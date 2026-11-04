/**
 * Personal Dashboard - Cloudflare Worker
 *
 * 静的ファイル（public/）は Workers Static Assets が配信し、
 * /api/* だけがこのコードを通ります。
 *
 * 認証は Cloudflare Access（Google ログイン）が担当します。
 * Access を通過したリクエストには Cf-Access-Jwt-Assertion ヘッダーが付くので、
 * ここではその JWT の署名と宛先（AUD）を検証し、メールアドレスごとに
 * ダッシュボードのデータを KV に保存します。
 *
 * 必要な環境変数（Cloudflare ダッシュボードで設定）
 *   TEAM_DOMAIN    例: yourteam.cloudflareaccess.com
 *   POLICY_AUD     Access アプリケーションの Audience (AUD) タグ
 *   ALLOWED_EMAILS 任意。カンマ区切りで許可するメールアドレスを追加で絞り込む
 *
 * ローカル開発用（.dev.vars にだけ書く。本番では設定しない）
 *   DEV_AUTH_EMAIL localhost からのアクセスをこのメールアドレスとして扱う
 */

const MAX_BODY_BYTES = 512 * 1024;
const JWKS_TTL_MS = 10 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return json({ error: err.message || "Internal Server Error" }, status);
    }
  },
};

async function handleApi(request, env, url) {
  const user = await authenticate(request, env, url);

  switch (url.pathname) {
    case "/api/me":
      if (request.method !== "GET") throw new HttpError(405, "Method Not Allowed");
      return json({ email: user.email });

    case "/api/dashboard":
      if (request.method === "GET") return getDashboard(env, user);
      if (request.method === "PUT") {
        assertSameOrigin(request, url);
        return putDashboard(request, env, user);
      }
      throw new HttpError(405, "Method Not Allowed");

    default:
      throw new HttpError(404, "Not Found");
  }
}

/* ------------------------------------------------------------------ */
/* データ保存                                                          */
/* ------------------------------------------------------------------ */

function storageKey(user) {
  return `dashboard:${user.email}`;
}

async function getDashboard(env, user) {
  const data = await env.DASHBOARD_KV.get(storageKey(user), "json");
  if (!data) return json({ error: "Not Found" }, 404);
  return json(data);
}

async function putDashboard(request, env, user) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, "Dashboard is too large");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.widgets)) {
    throw new HttpError(400, "Invalid dashboard format");
  }
  data.updatedAt = new Date().toISOString();
  await env.DASHBOARD_KV.put(storageKey(user), JSON.stringify(data));
  return json({ ok: true, updatedAt: data.updatedAt });
}

/* ------------------------------------------------------------------ */
/* 認証                                                                */
/* ------------------------------------------------------------------ */

async function authenticate(request, env, url) {
  // ローカル開発（wrangler dev）用の抜け道。localhost 以外では効かない。
  if (env.DEV_AUTH_EMAIL && isLocalhost(url.hostname)) {
    return { email: String(env.DEV_AUTH_EMAIL).toLowerCase() };
  }

  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    // 設定漏れのまま公開されてもデータを読めないよう、閉じる側に倒す
    throw new HttpError(500, "TEAM_DOMAIN と POLICY_AUD が設定されていません（README の手順を参照）");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Cloudflare Access のトークンがありません");

  const payload = await verifyAccessJwt(token, env);
  const email = String(payload.email || "").toLowerCase();
  if (!email) throw new HttpError(403, "メールアドレスを取得できません");

  const allowed = parseList(env.ALLOWED_EMAILS);
  if (allowed.length > 0 && !allowed.includes(email)) {
    throw new HttpError(403, "このアカウントには許可がありません");
  }
  return { email };
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeTeamDomain(value) {
  return String(value).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

let jwksCache = { url: "", keys: [], fetchedAt: 0 };

async function getSigningKeys(certsUrl, force = false) {
  const fresh = jwksCache.url === certsUrl && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache.keys;
  const res = await fetch(certsUrl);
  if (!res.ok) throw new HttpError(502, "Access の公開鍵を取得できません");
  const body = await res.json();
  jwksCache = { url: certsUrl, keys: body.keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

async function verifyAccessJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "トークンの形式が不正です");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecodeText(headerB64));
    payload = JSON.parse(base64UrlDecodeText(payloadB64));
  } catch {
    throw new HttpError(401, "トークンを読み取れません");
  }
  if (header.alg !== "RS256") throw new HttpError(401, "未対応の署名方式です");

  const team = normalizeTeamDomain(env.TEAM_DOMAIN);
  const issuer = `https://${team}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;

  let keys = await getSigningKeys(certsUrl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getSigningKeys(certsUrl, true); // 鍵のローテーションに追従
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new HttpError(401, "署名鍵が見つかりません");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecodeBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new HttpError(401, "署名が不正です");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new HttpError(401, "トークンの有効期限が切れています");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) {
    throw new HttpError(401, "トークンがまだ有効ではありません");
  }
  if (payload.iss !== issuer) throw new HttpError(401, "発行元が一致しません");

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(String(env.POLICY_AUD).trim())) {
    throw new HttpError(401, "AUD が一致しません");
  }
  return payload;
}

function base64UrlDecodeBytes(input) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeText(input) {
  return new TextDecoder().decode(base64UrlDecodeBytes(input));
}

/* ------------------------------------------------------------------ */
/* ユーティリティ                                                      */
/* ------------------------------------------------------------------ */

function assertSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw new HttpError(403, "Origin が一致しません");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
