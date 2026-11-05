/**
 * firebase-config.js — あなたの Firebase プロジェクトの設定
 *
 * Firebase コンソール → プロジェクトの設定 → マイアプリ（ウェブアプリ）に表示される
 * firebaseConfig の値を、下の YOUR_... の部分に貼り付けてください（README の手順 5）。
 *
 * この値は画面のプログラムに埋め込んで公開する前提のもので、秘密情報ではありません。
 * データを守っているのは firestore.rules（Firestore のセキュリティルール）です。
 *
 * 未設定のままだと「ローカルモード」で動き、データはこのブラウザにだけ保存されます。
 */
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/**
 * 複数のアカウントで 1 つのダッシュボードを共有するか（README「複数のアカウントで共有する」）。
 * - false：ログインした人ごとに別々のダッシュボード（初期値）
 * - true ：firestore.rules の allowedEmails() に書いた全員で、同じダッシュボードを見て編集する
 *          （誰かが変更すると、開いている全員の画面にすぐ反映されます）
 */
export const SHARED_DASHBOARD = false;

/** 読み込む Firebase JavaScript SDK のバージョン（https://www.gstatic.com/firebasejs/ から読み込みます） */
export const FIREBASE_SDK_VERSION = "13.1.0";

/**
 * 開発用：localhost で開いたときに Firebase Emulator Suite につなぐ（README「ローカルで動かす」）。
 * 本番（github.io）では、この値に関係なく本物の Firebase につながります。
 */
export const USE_EMULATORS_ON_LOCALHOST = false;
