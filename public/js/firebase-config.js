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
const firebaseConfig = {
  apiKey: "AIzaSyB2yBqGXkrxuqkfHL84RXc8vlc72yWhQMU",
  authDomain: "persona-dashboard-a823f.firebaseapp.com",
  projectId: "persona-dashboard-a823f",
  storageBucket: "persona-dashboard-a823f.firebasestorage.app",
  messagingSenderId: "690343381511",
  appId: "1:690343381511:web:75e68a529dce308d56f8a2"
};

/** 読み込む Firebase JavaScript SDK のバージョン（https://www.gstatic.com/firebasejs/ から読み込みます） */
export const FIREBASE_SDK_VERSION = "13.1.0";

/**
 * 開発用：localhost で開いたときに Firebase Emulator Suite につなぐ（README「ローカルで動かす」）。
 * 本番（github.io）では、この値に関係なく本物の Firebase につながります。
 */
export const USE_EMULATORS_ON_LOCALHOST = false;
