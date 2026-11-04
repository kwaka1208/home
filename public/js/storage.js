/**
 * storage.js — ダッシュボードの読み込みと保存
 *
 * 基本はサーバー（Worker → KV）に保存し、ブラウザの localStorage にも
 * 控えを残します。API に届かないとき（ファイルを直接開いた場合など）は
 * localStorage だけで動きます。
 */
import { DEFAULT_DASHBOARD_URL } from "./config.js";

const LOCAL_KEY = "personal-dashboard:data";

export class StorageError extends Error {
  constructor(message, { sessionExpired = false } = {}) {
    super(message);
    this.sessionExpired = sessionExpired;
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* プライベートブラウズなどで使えない場合は無視 */
  }
}

async function api(path, options = {}) {
  let res;
  try {
    // Access のセッションが切れるとログイン画面へリダイレクトされるので、
    // 追いかけずに検知する
    res = await fetch(path, { credentials: "same-origin", redirect: "manual", ...options });
  } catch (err) {
    throw new StorageError("サーバーに接続できません");
  }
  if (res.type === "opaqueredirect" || res.status === 0) {
    throw new StorageError("ログインの有効期限が切れました。ページを再読み込みしてください。", {
      sessionExpired: true,
    });
  }
  return res;
}

async function readError(res) {
  try {
    const body = await res.json();
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function loadDefault() {
  const res = await fetch(DEFAULT_DASHBOARD_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("default-dashboard.json を読み込めません");
  return res.json();
}

/**
 * @returns {Promise<{ data: object, mode: "remote" | "local", email?: string, warning?: string }>}
 */
export async function load() {
  let res;
  try {
    res = await api("/api/dashboard");
  } catch (err) {
    if (err.sessionExpired) throw err;
    return { data: readLocal() || (await loadDefault()), mode: "local", warning: err.message };
  }

  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    // API 自体がない（静的ファイルとして配信されている）場合も 404 になる
    if (!("error" in body)) {
      return { data: readLocal() || (await loadDefault()), mode: "local" };
    }
    // まだ保存したことがない：ローカルの控えか初期レイアウトから始める
    return { data: readLocal() || (await loadDefault()), mode: "remote" };
  }
  if (!res.ok) {
    throw new StorageError(await readError(res));
  }

  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    // SPA のフォールバックで index.html が返ってきた＝ API がない
    return { data: readLocal() || (await loadDefault()), mode: "local" };
  }
  const data = await res.json();
  writeLocal(data);
  return { data, mode: "remote" };
}

export async function fetchUser() {
  try {
    const res = await api("/api/me");
    if (!res.ok) return null;
    const body = await res.json();
    return body.email || null;
  } catch {
    return null;
  }
}

export async function save(data, mode) {
  writeLocal(data);
  if (mode !== "remote") return;
  const res = await api("/api/dashboard", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new StorageError(await readError(res));
}
