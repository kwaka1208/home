/**
 * config.js — フォークした人が触ってよい設定
 */

/** 設定画面の「テーマ」に並ぶ選択肢。id は css/themes.css の data-preset と対応 */
export const THEME_PRESETS = [
  { id: "", label: "標準" },
  { id: "indigo", label: "藍" },
  { id: "washi", label: "和紙" },
  { id: "mono", label: "モノクロ" },
  { id: "compact", label: "コンパクト" },
];

/** 初めて開いたとき（保存データがないとき）に読み込むレイアウト */
export const DEFAULT_DASHBOARD_URL = "default-dashboard.json";

/** アイコン未設定のリンクに使うファビコン取得サービス。{domain} がドメイン名に置き換わる */
export const FAVICON_URL = "https://www.google.com/s2/favicons?domain={domain}&sz=64";

/** 編集してから保存するまでの待ち時間（ミリ秒） */
export const SAVE_DELAY_MS = 800;
