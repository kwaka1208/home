/**
 * storage.js — ログインとダッシュボードの読み書き（Firebase）
 *
 * - ログイン：Firebase Authentication（Google）
 * - 保存先：Cloud Firestore の dashboards/{ユーザーID} ドキュメント
 *   （中身はダッシュボード全体を JSON 文字列にしたもの）
 * - 読み書きできるのは、firestore.rules に書いたメールアドレスの本人だけ
 * - firebase-config.js で SHARED_DASHBOARD = true にすると、dashboards/shared の 1 つを
 *   firestore.rules に書いた全員で共有する（誰かが変えると、開いている全員の画面に反映される）
 *
 * firebase-config.js が未設定のときは「ローカルモード」になり、
 * ブラウザの localStorage にだけ保存します。
 */
import { t } from "./i18n.js";
// firebase-config.js は利用者ごとのファイルなので、新しい設定（SHARED_DASHBOARD）が
// 書かれていない古いファイルでも動くよう、まとめて読み込んで無ければ初期値を使う
import * as userConfig from "./firebase-config.js";
import { DEFAULT_DASHBOARD_URL } from "./config.js";

const { firebaseConfig, FIREBASE_SDK_VERSION, USE_EMULATORS_ON_LOCALHOST } = userConfig;

const COLLECTION = "dashboards";
/** 共有するときのドキュメントの名前（firestore.rules と合わせる） */
const SHARED_DOC_ID = "shared";

/** 許可した全員で 1 つのダッシュボードを共有するか（firebase-config.js の SHARED_DASHBOARD） */
export const isShared = userConfig.SHARED_DASHBOARD === true;
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
  // 共有中は、ライト / ダークと言語は共有のものではなく、この人の設定を覚えておく
  writeAppearance({ ...data?.settings, ...(isShared ? readPersonal() : {}) });
}

/*
 * 人ごとの設定（共有中だけ使う）：ライト / ダークと言語は、共有のダッシュボードに入れず、
 * この端末にアカウントごとに覚えておく（同じ端末を家族で使っても、人ごとに分かれる）。
 */
export const PERSONAL_KEYS = ["mode", "language"];

export function readPersonal() {
  if (!currentUser) return {};
  return readLocal(`personal:${currentUser.uid}`) || {};
}

export function writePersonal(settings) {
  if (!currentUser) return;
  const values = Object.fromEntries(PERSONAL_KEYS.map((k) => [k, settings?.[k]]).filter(([, v]) => v != null));
  writeLocal(`personal:${currentUser.uid}`, values);
  writeAppearance({ ...(readAppearance() || {}), ...values });
}

/** 見た目と言語の設定だけを、この端末に覚えておく（ログイン前の画面や、ライト / ダークの切り替えで使う） */
export function writeAppearance(settings) {
  const { language, mode, preset, density } = settings || {};
  writeLocal("appearance", { language, mode, preset, density });
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
    throw new StorageError(t("error.sdk"));
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
  stopWatching();
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
  if (!canUseGoogleApi()) throw new StorageError(t("error.notSignedIn"));
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
      throw new StorageError(t("error.sameAccount"));
    }
    throw new StorageError(describeError(err));
  }
  const token = fb.authMod.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new StorageError(t("error.noGoogleToken"));
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
  if (!res.ok) throw new Error(`default-dashboard.json: ${res.status}`);
  return res.json();
}

/** 読み書きするドキュメント（共有なら dashboards/shared、そうでなければ本人の dashboards/{uid}） */
function dashboardRef() {
  return fb.storeMod.doc(fb.db, COLLECTION, isShared ? SHARED_DOC_ID : currentUser.uid);
}

/** 最後に読み込んだ・保存した内容（自分の保存が通知で戻ってきたときに、描き直さないため） */
let lastJson = null;
/**
 * 今の画面のもとになっている内容。保存するときに、これと Firestore の今の内容が違えば
 * 「ほかの人（端末）が先に保存した」とわかるので、両方の変更をまとめてから保存する。
 */
let baseJson = null;

/** 画面をこの内容（JSON 文字列）にそろえた、と知らせる（ほかの人の変更を反映したとき） */
export function setBase(json) {
  baseJson = json;
}

function parseDashboard(snap) {
  try {
    return JSON.parse(snap.data().json);
  } catch {
    throw new StorageError(t("error.unreadableData"));
  }
}

/**
 * @returns {Promise<{ data: object, mode: "remote" | "local" }>}
 */
export async function load() {
  if (!isConfigured) {
    return { data: readLocal("data:local") || (await loadDefault()), mode: "local" };
  }
  if (!currentUser) throw new StorageError(t("error.notSignedIn"));

  const { doc, getDoc } = fb.storeMod;
  let snap;
  try {
    snap = await getDoc(dashboardRef());
    // 共有を始めたばかりで共有のデータがまだないときは、今までの自分のダッシュボードを引き継ぐ
    if (!snap.exists() && isShared) {
      const own = await getDoc(doc(fb.db, COLLECTION, currentUser.uid)).catch(() => null);
      if (own?.exists()) snap = own;
    }
  } catch (err) {
    throw new StorageError(describeError(err));
  }
  if (!snap.exists()) {
    // まだ一度も保存していない：初期レイアウトから始める
    lastJson = baseJson = null;
    return { data: await loadDefault(), mode: "remote" };
  }
  const data = parseDashboard(snap);
  lastJson = baseJson = snap.ref.id === dashboardRef().id ? snap.data().json : null;
  writeLocal(`data:${currentUser.uid}`, data);
  rememberAppearance(data);
  return { data, mode: "remote" };
}

/**
 * 保存する。ほかの人（端末）が先に保存していたら、merge(もと, 自分, ほかの人) でまとめた内容を保存する。
 * @returns {Promise<{ merged: object, json: string } | null>} まとめた内容（まとめなかったときは null）。
 *   まとめた内容を画面に反映したら setBase(json) を呼ぶこと
 */
export async function save(data, mode, merge) {
  rememberAppearance(data);
  if (mode !== "remote") {
    writeLocal("data:local", data);
    return null;
  }
  if (!currentUser) throw new StorageError(t("error.sessionExpired"));

  const { runTransaction, serverTimestamp } = fb.storeMod;
  const ref = dashboardRef();
  const base = baseJson; // 保存を始めた時点の「もと」（保存中に変わっても、これでまとめる）
  let result = null;
  try {
    await runTransaction(fb.db, async (tx) => {
      const snap = await tx.get(ref);
      const remoteJson = snap.exists() ? snap.data().json : null;
      let toWrite = data;
      result = null;
      if (merge && remoteJson && base && remoteJson !== base) {
        try {
          toWrite = merge(JSON.parse(base), data, JSON.parse(remoteJson));
          result = { merged: toWrite };
        } catch { /* まとめられないときは、自分の内容で保存する */ }
      }
      const json = JSON.stringify(toWrite);
      if (result) result.json = json;
      lastJson = json;
      tx.set(ref, { json, updatedAt: serverTimestamp() });
    });
  } catch (err) {
    throw new StorageError(describeError(err));
  }
  if (!result) baseJson = lastJson;
  writeLocal(`data:${currentUser.uid}`, result ? result.merged : data);
  return result;
}

/* ------------------------------------------------------------------ */
/* ほかの人（ほかの端末）の変更を受け取る                                   */
/* ------------------------------------------------------------------ */

let unsubscribe = null;

/**
 * ダッシュボードが Firestore で変わったら callback(data, json) を呼ぶ。
 * 自分の保存が戻ってきたもの・今の内容と同じものは呼ばない。
 * 画面に反映したら setBase(json) を呼ぶこと。
 */
export function watch(callback) {
  stopWatching();
  if (!isConfigured || !currentUser) return;
  unsubscribe = fb.storeMod.onSnapshot(dashboardRef(), (snap) => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const json = snap.data().json;
    if (json === lastJson) return;
    let data;
    try { data = parseDashboard(snap); } catch { return; }
    lastJson = json;
    writeLocal(`data:${currentUser.uid}`, data);
    callback(data, json);
  }, () => { /* 通信が切れたなど。つながり直すと自動で再開する */ });
}

/** Firestore の今の内容を読み直す。画面の内容と同じなら null */
export async function fetchLatest() {
  if (!isConfigured || !currentUser) return null;
  const snap = await fb.storeMod.getDoc(dashboardRef());
  if (!snap.exists() || snap.data().json === lastJson) return null;
  const json = snap.data().json;
  lastJson = json;
  return { data: parseDashboard(snap), json };
}

export function stopWatching() {
  unsubscribe?.();
  unsubscribe = null;
}

/* ------------------------------------------------------------------ */
/* エラーメッセージ                                                      */
/* ------------------------------------------------------------------ */

function describeError(err) {
  const code = err?.code || "";
  const email = currentUser?.email || t("error.thisAccount");
  switch (code) {
    case "permission-denied":
      return t("error.permissionDenied", { email });
    case "unavailable":
      return t("error.unavailable");
    case "not-found":
    case "failed-precondition":
      return t("error.noDatabase");
    case "auth/unauthorized-domain":
      return t("error.unauthorizedDomain", { host: location.hostname });
    case "auth/popup-blocked":
      return t("error.popupBlocked");
    case "auth/operation-not-allowed":
      return t("error.googleDisabled");
    case "auth/configuration-not-found":
      return t("error.authNotStarted");
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return t("error.invalidApiKey");
    case "auth/network-request-failed":
      return t("error.network");
    default:
      return t("error.unknown", { detail: code || err?.message || t("error.unknownDetail") });
  }
}
