/**
 * storage.js — ログインとダッシュボードの読み書き（Firebase）
 *
 * - ログイン：Firebase Authentication（Google）
 * - 保存先：Cloud Firestore の dashboards/{ユーザーID} ドキュメント
 *   （中身はダッシュボード全体を JSON 文字列にしたもの）
 * - 読み書きできるのは、firestore.rules に書いたメールアドレスの本人だけ
 *
 * firebase-config.js が未設定のときは「ローカルモード」になり、
 * ブラウザの localStorage にだけ保存します。
 */
import {
  firebaseConfig,
  FIREBASE_SDK_VERSION,
  USE_EMULATORS_ON_LOCALHOST,
} from "./firebase-config.js";
import { DEFAULT_DASHBOARD_URL } from "./config.js";

const COLLECTION = "dashboards";
const LOCAL_PREFIX = "personal-dashboard:";

export class StorageError extends Error {}

/** firebase-config.js に値が入っているか */
export const isConfigured = Boolean(
  firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_"),
);

let fb = null; // { auth, db, authMod, storeMod }
let currentUser = null;

/* ------------------------------------------------------------------ */
/* localStorage（控えと、ログイン前に使う見た目の設定）                   */
/* ------------------------------------------------------------------ */

function localKey(name) {
  return LOCAL_PREFIX + name;
}

function readLocal(name) {
  try {
    const raw = localStorage.getItem(localKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(name, value) {
  try {
    if (value == null) localStorage.removeItem(localKey(name));
    else localStorage.setItem(localKey(name), JSON.stringify(value));
  } catch {
    /* プライベートブラウズなどで使えない場合は無視 */
  }
}

/** ログイン画面でも前回のテーマで表示するために、見た目の設定だけ別に覚えておく */
export function readAppearance() {
  return readLocal("appearance");
}

function rememberAppearance(data) {
  const { mode, preset, density } = data?.settings || {};
  writeLocal("appearance", { mode, preset, density });
}

/* ------------------------------------------------------------------ */
/* Firebase の初期化とログイン                                           */
/* ------------------------------------------------------------------ */

function sdkUrl(name) {
  return `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-${name}.js`;
}

export async function initFirebase() {
  if (fb) return fb;
  let appMod, authMod, storeMod;
  try {
    [appMod, authMod, storeMod] = await Promise.all([
      import(sdkUrl("app")),
      import(sdkUrl("auth")),
      import(sdkUrl("firestore")),
    ]);
  } catch {
    throw new StorageError("Firebase のプログラムを読み込めませんでした。ネットワークを確認してください。");
  }
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = storeMod.getFirestore(app);

  const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (USE_EMULATORS_ON_LOCALHOST && isLocalhost) {
    authMod.connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    storeMod.connectFirestoreEmulator(db, location.hostname, 8080);
  }

  fb = { auth, db, authMod, storeMod };
  return fb;
}

/** ログイン状態が変わるたびに callback({ uid, email } | null) を呼ぶ */
export function watchUser(callback) {
  fb.authMod.onAuthStateChanged(fb.auth, (user) => {
    currentUser = user;
    callback(user ? { uid: user.uid, email: user.email } : null);
  });
}

export async function signIn() {
  const provider = new fb.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await fb.authMod.signInWithPopup(fb.auth, provider);
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
    throw new StorageError(describeError(err));
  }
}

export async function signOut() {
  if (currentUser) writeLocal(`data:${currentUser.uid}`, null); // この端末に残した控えも消す
  writeLocal("google-token", null);
  writeLocal("github-token", null);
  await fb.authMod.signOut(fb.auth);
}

/* ------------------------------------------------------------------ */
/* Google の API（カレンダー・Gmail）を使うためのアクセストークン        */
/* ------------------------------------------------------------------ */

/*
 * ログイン中の Google アカウントに、追加の権限（スコープ）をもらってアクセストークンを得る。
 * トークンの有効期限は Google 側で 1 時間と決まっていて、サーバーを持たないこの仕組みでは延ばせない。
 * そのため、この端末の localStorage に有効期限つきで控えるだけにし（Firestore には保存しない）、
 * 期限が近づいたら、画面を操作したときに取り直す（app.js の autoRenewGoogle）。
 */
const FALLBACK_LIFETIME_MS = 55 * 60 * 1000; // 残り時間を問い合わせられなかったとき
const EXPIRY_MARGIN_MS = 60 * 1000; // 期限ぴったりで失敗しないよう、1 分早めに切れたことにする

/** Google の API が使える状態か（Firebase を設定してログインしているか） */
export function canUseGoogleApi() {
  return isConfigured && Boolean(currentUser);
}

function readConnection() {
  const saved = readLocal("google-token");
  return saved && currentUser && saved.uid === currentUser.uid ? saved : null;
}

/** 有効なトークンがあれば返す（必要なスコープがすべて含まれていること） */
export function getGoogleToken(scopes) {
  const saved = readConnection();
  if (!saved?.token || Date.now() > saved.expiresAt) return null;
  if (!scopes.every((s) => saved.scopes.includes(s))) return null;
  return saved.token;
}

/**
 * 一度でも連携したことがあれば、そのときのスコープと期限を返す（期限切れでも返す）。
 * 期限が近い・切れたときに、同じスコープで取り直すために使う。
 */
export function getGoogleConnection() {
  const saved = readConnection();
  return saved ? { scopes: saved.scopes, expiresAt: saved.expiresAt || 0 } : null;
}

/** トークンを使えなくする（API が「期限切れ」と返したときなど）。取り直せるよう、スコープは残す */
export function forgetGoogleToken() {
  const saved = readConnection();
  if (saved) writeLocal("google-token", { ...saved, token: null, expiresAt: 0 });
}

/** Google に問い合わせて、トークンの本当の残り時間（ミリ秒）を調べる */
async function tokenLifetime(token) {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return FALLBACK_LIFETIME_MS;
    const seconds = Number((await res.json()).expires_in);
    return Number.isFinite(seconds) && seconds > 120 ? seconds * 1000 - EXPIRY_MARGIN_MS : FALLBACK_LIFETIME_MS;
  } catch {
    return FALLBACK_LIFETIME_MS;
  }
}

/**
 * ポップアップで権限を確認してトークンを得る。ボタンのクリックから呼ぶこと
 * （ブラウザはクリック以外で開いたポップアップをブロックする）。
 */
export async function connectGoogle(scopes) {
  if (!canUseGoogleApi()) throw new StorageError("ログインしていません");
  const previous = readLocal("google-token");
  const all = [...new Set([...(previous?.uid === currentUser.uid ? previous.scopes : []), ...scopes])];
  const provider = new fb.authMod.GoogleAuthProvider();
  for (const scope of all) provider.addScope(scope);
  provider.setCustomParameters({ login_hint: currentUser.email || "" });
  let result;
  try {
    result = await fb.authMod.reauthenticateWithPopup(currentUser, provider);
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return null;
    if (err?.code === "auth/user-mismatch") {
      throw new StorageError("ダッシュボードにログインしているのと同じ Google アカウントを選んでください。");
    }
    throw new StorageError(describeError(err));
  }
  const token = fb.authMod.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new StorageError("Google からアクセス権を受け取れませんでした");
  const startedAt = Date.now();
  const lifetime = await tokenLifetime(token);
  writeLocal("google-token", { token, scopes: all, uid: currentUser.uid, expiresAt: startedAt + lifetime });
  return token;
}

/* ------------------------------------------------------------------ */
/* 読み込みと保存                                                        */
/* ------------------------------------------------------------------ */

export async function loadDefault() {
  const res = await fetch(DEFAULT_DASHBOARD_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("default-dashboard.json を読み込めません");
  return res.json();
}

/**
 * @returns {Promise<{ data: object, mode: "remote" | "local" }>}
 */
export async function load() {
  if (!isConfigured) {
    return { data: readLocal("data:local") || (await loadDefault()), mode: "local" };
  }
  if (!currentUser) throw new StorageError("ログインしていません");

  const { doc, getDoc } = fb.storeMod;
  let snap;
  try {
    snap = await getDoc(doc(fb.db, COLLECTION, currentUser.uid));
  } catch (err) {
    throw new StorageError(describeError(err));
  }
  if (!snap.exists()) {
    // まだ一度も保存していない：初期レイアウトから始める
    return { data: await loadDefault(), mode: "remote" };
  }
  let data;
  try {
    data = JSON.parse(snap.data().json);
  } catch {
    throw new StorageError("保存されているデータを読み取れませんでした");
  }
  writeLocal(`data:${currentUser.uid}`, data);
  rememberAppearance(data);
  return { data, mode: "remote" };
}

export async function save(data, mode) {
  rememberAppearance(data);
  if (mode !== "remote") {
    writeLocal("data:local", data);
    return;
  }
  if (!currentUser) throw new StorageError("ログインの有効期限が切れました。ページを再読み込みしてください。");
  writeLocal(`data:${currentUser.uid}`, data);

  const { doc, setDoc, serverTimestamp } = fb.storeMod;
  try {
    await setDoc(doc(fb.db, COLLECTION, currentUser.uid), {
      json: JSON.stringify(data),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw new StorageError(describeError(err));
  }
}

/* ------------------------------------------------------------------ */
/* エラーメッセージ                                                      */
/* ------------------------------------------------------------------ */

function describeError(err) {
  const code = err?.code || "";
  const email = currentUser?.email || "このアカウント";
  switch (code) {
    case "permission-denied":
      return `${email} ではこのダッシュボードを使えません。別のアカウントでログインし直してください。` +
        "（持ち主の方は、Firestore のルールに書いたメールアドレスを確認してください。）";
    case "unavailable":
      return "Firestore に接続できません。ネットワークを確認してください。";
    case "not-found":
    case "failed-precondition":
      return "Firestore のデータベースが見つかりません。Firebase コンソールで Firestore Database を作成したか確認してください。";
    case "auth/unauthorized-domain":
      return `このドメイン（${location.hostname}）が Firebase の承認済みドメインに登録されていません（README の手順 6）。`;
    case "auth/popup-blocked":
      return "ログイン用のポップアップがブロックされました。ブラウザでポップアップを許可してから、もう一度ログインしてください。";
    case "auth/operation-not-allowed":
      return "Firebase の Authentication で Google ログインが有効になっていません（README の手順 3）。";
    case "auth/configuration-not-found":
      return "Firebase の Authentication が開始されていません（README の手順 3）。";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "firebase-config.js の apiKey が正しくありません（README の手順 5）。";
    case "auth/network-request-failed":
      return "ネットワークに接続できません。";
    default:
      return `エラーが発生しました（${code || err?.message || "不明"}）`;
  }
}
