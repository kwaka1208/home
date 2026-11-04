/**
 * countdown.js — アドオンの見本：カウントダウン
 *
 * 指定した日付までの残り日数を表示します。
 * 使うときは addons/index.js に  import "./countdown.js";  を書きます。
 */
import { registerWidget } from "../js/addon-api.js";

registerWidget({
  type: "countdown",
  name: "カウントダウン",
  defaultRows: 1,

  // 編集画面の設定欄。値は widget.date・widget.label に保存される
  fields: [
    { name: "date", label: "日付", type: "date" },
    { name: "label", label: "何の日か（任意。例：年末、締め切り）", placeholder: "年末" },
  ],

  // ウィジェットの中身を作って返す
  render(widget, { h }) {
    if (!widget.date) {
      return h("p", { class: "widget__empty" }, "「編集」→ ✎ で日付を設定してください");
    }
    const [y, m, d] = widget.date.split("-").map(Number);
    const today = new Date();
    const days = Math.round(
      (new Date(y, m - 1, d) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
    );
    const text = days > 0 ? `あと ${days} 日` : days === 0 ? "今日です" : `${-days} 日前`;
    return h("div", { class: "countdown" },
      h("span", { class: "countdown__days" }, text),
      h("span", { class: "countdown__label" }, widget.label || widget.date),
    );
  },

  // 見た目。色や大きさは CSS 変数を使うと、テーマに合わせて変わる
  css: `
    .countdown { display: grid; gap: var(--space-1); }
    .countdown__days {
      font-size: var(--font-size-clock);
      font-weight: var(--clock-weight);
      line-height: 1.2;
      color: var(--widget-accent);
    }
    .countdown__label { color: var(--color-text-muted); font-size: var(--font-size-sm); }
  `,
});
