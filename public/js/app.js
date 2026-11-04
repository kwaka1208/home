/**
 * app.js — ダッシュボードの画面
 *
 * 状態（state）を 1 つの JSON で持ち、変更のたびに画面を描き直して保存します。
 * 並べ替えには SortableJS（public/vendor/Sortable.min.js）を使っています。
 *
 * データ形式（default-dashboard.json も同じ形）:
 * {
 *   "version": 2,
 *   "title": "Dashboard",
 *   "pages": [ { "id": "...", "name": "ホーム", "widgets": [ ...下の widgets と同じ... ] } ],
 *   （version 1 の形式：pages の代わりに widgets だけを持つ。読み込むと「ホーム」タブ 1 つになる）
 *   "settings": { "mode": "auto", "preset": "", "density": "normal", "layout": "tile",
 *                 "openInNewTab": true, "useFavicons": true },
 *   "widgets": [
 *     （各ウィジェットは "rows": 1〜4 で高さ（段数）を持つ。省略時は種類ごとの初期値）
 *     { "id": "...", "type": "links", "title": "...", "size": "m", "rows": 2, "view": "list",
 *       "accent": "#2f6f5e", "items": [ { "id": "...", "title": "...", "url": "...", "icon": "", "description": "" } ] },
 *     { "id": "...", "type": "note",   "title": "...", "size": "s", "text": "" },
 *     { "id": "...", "type": "clock",  "title": "...", "size": "s", "timeZone": "" },
 *     { "id": "...", "type": "search", "title": "...", "size": "m", "searchUrl": "https://www.google.com/search?q=%s" },
 *     { "id": "...", "type": "embed",  "title": "...", "size": "l", "embedUrl": "https://...", "height": 400 },
 *     { "id": "...", "type": "todo",   "title": "...", "size": "m",
 *       "categories": [ { "id": "...", "name": "仕事" } ],
 *       "items": [ { "id": "...", "text": "...", "done": false, "categoryId": "..." } ] }
 *   ]
 * }
 */
import { THEME_PRESETS, FAVICON_URL, SAVE_DELAY_MS } from "./config.js";
import * as storage from "./storage.js";
import { toYouTubeEmbed } from "./embed.js";

const WIDGET_TYPES = {
  links: "リンク集",
  note: "メモ",
  clock: "時計",
  search: "Web 検索",
  embed: "埋め込み",
  todo: "ToDo",
};
const DEFAULT_TODO_CATEGORIES = ["仕事", "プライベート"];
/** ウィジェットの高さ（段数）の選択肢と、種類ごとの初期値 */
const ROW_OPTIONS = [1, 2, 3, 4];
const DEFAULT_ROWS = { links: 2, note: 2, clock: 1, search: 1, embed: 2, todo: 3 };

function normalizeRows(value, type) {
  const rows = Number(value);
  return ROW_OPTIONS.includes(rows) ? rows : DEFAULT_ROWS[type] || 2;
}
const SIZES = ["s", "m", "l", "xl"];
const DEFAULT_SETTINGS = {
  mode: "auto",
  preset: "",
  density: "normal",
  layout: "tile", // "tile"：段で高さを指定してタイル状に並べる / "flow"：中身の高さに合わせる
  openInNewTab: true,
  useFavicons: true,
};
const DEFAULT_SEARCH_URL = "https://www.google.com/search?q=%s";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const el = {
  root: document.documentElement,
  title: $("#dashboard-title"),
  dashboard: $("#dashboard"),
  tabs: $("#tabs"),
  filter: $("#filter"),
  editToggle: $("#edit-toggle"),
  settingsOpen: $("#settings-open"),
  saveStatus: $("#save-status"),
  banner: $("#banner"),
  userEmail: $("#user-email"),
  headerSearch: $("#header-search"),
  headerActions: $("#header-actions"),
  signin: $("#signin"),
  signinButton: $("#signin-button"),
  signoutButton: $("#signout-button"),
  widgetDialog: $("#widget-dialog"),
  widgetForm: $("#widget-form"),
  widgetDelete: $("#widget-delete"),
  linkDialog: $("#link-dialog"),
  linkForm: $("#link-form"),
  linkDelete: $("#link-delete"),
  settingsDialog: $("#settings-dialog"),
  settingsForm: $("#settings-form"),
  themePicker: $("#theme-picker"),
  exportButton: $("#export-button"),
  importInput: $("#import-input"),
  resetButton: $("#reset-button"),
  textDialog: $("#text-dialog"),
  textForm: $("#text-form"),
  toast: $("#toast"),
};

let state = null;
let storageMode = "local";
let editing = false;
let sortables = [];
let saveTimer = null;
let clockTimer = null;
/** ToDo ウィジェットごとに選んでいるカテゴリー（保存しない表示状態） */
const todoFilters = new Map();
/** 描き直したあとにフォーカスを戻す要素のセレクター */
let focusAfterRender = null;

/* ================================================================== */
/* ユーティリティ                                                       */
/* ================================================================== */

function uid() {
  return crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** javascript: などを弾き、http(s) と一部のスキームだけ通す */
function safeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** 読み込んだデータを補正する（古い形式や手で書いた JSON への備え） */
function normalize(data) {
  const out = {
    version: 2,
    title: typeof data?.title === "string" ? data.title : "Dashboard",
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings || {}) },
    pages: [],
  };
  // 旧バージョンの「コンパクト」テーマは表示密度の設定に移した
  if (out.settings.preset === "compact") {
    out.settings.preset = "";
    out.settings.density = "compact";
  }
  if (!THEME_PRESETS.some((p) => p.id === out.settings.preset)) out.settings.preset = "";
  if (out.settings.layout !== "flow") out.settings.layout = "tile";
  delete out.settings.alignRows; // 旧バージョンの設定（layout に置き換え）

  // タブ。旧形式（widgets だけ）は「ホーム」タブ 1 つにまとめる
  const pages = Array.isArray(data?.pages) && data.pages.length
    ? data.pages
    : [{ id: "home", name: "ホーム", widgets: data?.widgets }];
  for (const p of pages) {
    if (!p || typeof p !== "object") continue;
    out.pages.push({
      id: p.id ? String(p.id) : uid(),
      name: typeof p.name === "string" && p.name.trim() ? p.name : "タブ",
      widgets: (Array.isArray(p.widgets) ? p.widgets : []).map(normalizeWidget).filter(Boolean),
    });
  }
  if (out.pages.length === 0) out.pages.push({ id: uid(), name: "ホーム", widgets: [] });
  return out;
}

/** ウィジェット 1 つ分の補正 */
function normalizeWidget(w) {
  if (!w || !WIDGET_TYPES[w.type]) return null;
  const widget = {
    ...w,
    id: w.id ? String(w.id) : uid(),
    title: typeof w.title === "string" ? w.title : "",
    size: SIZES.includes(w.size) ? w.size : "m",
    rows: normalizeRows(w.rows, w.type),
  };
  if (widget.type === "links") {
    widget.view = widget.view === "grid" ? "grid" : "list";
    widget.items = (Array.isArray(w.items) ? w.items : [])
      .filter((item) => item && safeUrl(item.url))
      .map((item) => ({ ...item, id: item.id ? String(item.id) : uid() }));
  }
  if (widget.type === "todo") {
    widget.categories = (Array.isArray(w.categories) ? w.categories : [])
      .filter((c) => c && typeof c.name === "string")
      .map((c) => ({ id: c.id ? String(c.id) : uid(), name: c.name }));
    const categoryIds = new Set(widget.categories.map((c) => c.id));
    widget.items = (Array.isArray(w.items) ? w.items : [])
      .filter((item) => item && typeof item.text === "string" && categoryIds.has(String(item.categoryId)))
      .map((item) => ({
        id: item.id ? String(item.id) : uid(),
        text: item.text,
        done: Boolean(item.done),
        categoryId: String(item.categoryId),
      }));
  }
  return widget;
}

/* ================================================================== */
/* タブ                                                                 */
/* ================================================================== */

const ACTIVE_TAB_KEY = "personal-dashboard:active-tab";
let activePageId = null;

/** いま表示しているタブ */
function page() {
  return state.pages.find((p) => p.id === activePageId) || state.pages[0];
}

/** いま表示しているタブのウィジェット */
function widgets() {
  return page().widgets;
}

/** 開くタブを決める：URL の #タブID → この端末で最後に開いたタブ → 先頭 */
function pickInitialPage() {
  const fromHash = decodeURIComponent(location.hash.slice(1));
  let remembered = null;
  try { remembered = localStorage.getItem(ACTIVE_TAB_KEY); } catch { /* 使えない環境 */ }
  const found = [fromHash, remembered].find((id) => id && state.pages.some((p) => p.id === id));
  activePageId = found || state.pages[0].id;
}

function switchPage(id, { updateHash = true } = {}) {
  if (!state.pages.some((p) => p.id === id)) return;
  activePageId = id;
  try { localStorage.setItem(ACTIVE_TAB_KEY, id); } catch { /* 使えない環境 */ }
  if (updateHash) history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  el.filter.value = "";
  render();
}

window.addEventListener("hashchange", () => {
  if (!state) return;
  const id = decodeURIComponent(location.hash.slice(1));
  if (id && id !== activePageId) switchPage(id, { updateHash: false });
});

function renderTabs() {
  const show = state.pages.length > 1 || editing;
  el.tabs.hidden = !show;
  if (!show) {
    el.tabs.replaceChildren();
    return;
  }
  const list = h("div", { class: "tabs__list", role: "tablist", "aria-label": "タブ" });
  for (const p of state.pages) {
    const selected = p.id === page().id;
    const item = h("div", { class: "tab-item", dataset: { pageId: p.id } },
      h("span", { class: "tab-item__handle", title: "ドラッグでタブを並べ替え", "aria-hidden": "true" }, "⠿"),
      h("button", {
        type: "button",
        class: "tab",
        role: "tab",
        "aria-selected": String(selected),
        tabindex: selected ? "0" : "-1",
        onclick: () => switchPage(p.id),
        onkeydown: (event) => moveTabFocus(event, p.id),
      }, p.name),
      h("span", { class: "tab-item__tools" },
        h("button", {
          type: "button",
          class: "button button--small button--ghost",
          title: "名前を変える",
          "aria-label": `タブ「${p.name}」の名前を変える`,
          onclick: () => renamePage(p),
        }, "✎"),
        state.pages.length > 1 ? h("button", {
          type: "button",
          class: "button button--small button--ghost button--danger",
          title: "タブを削除",
          "aria-label": `タブ「${p.name}」を削除`,
          onclick: () => deletePage(p),
        }, "×") : null,
      ),
    );
    list.append(item);
  }
  el.tabs.replaceChildren(list);
  if (editing) {
    el.tabs.append(h("button", { type: "button", class: "tabs__add", onclick: addPage }, "＋ タブを追加"));
  }
}

/** 矢印キーでタブを移動（WAI-ARIA のタブの操作） */
function moveTabFocus(event, id) {
  const index = state.pages.findIndex((p) => p.id === id);
  let next = null;
  if (event.key === "ArrowRight") next = state.pages[(index + 1) % state.pages.length];
  if (event.key === "ArrowLeft") next = state.pages[(index - 1 + state.pages.length) % state.pages.length];
  if (event.key === "Home") next = state.pages[0];
  if (event.key === "End") next = state.pages[state.pages.length - 1];
  if (!next) return;
  event.preventDefault();
  switchPage(next.id);
  $(`.tab-item[data-page-id="${CSS.escape(next.id)}"] .tab`, el.tabs)?.focus();
}

async function addPage() {
  const name = await askText({ title: "タブを追加", label: "タブの名前", value: "" });
  if (!name) return;
  const p = { id: uid(), name, widgets: [] };
  state.pages.push(p);
  scheduleSave();
  switchPage(p.id);
}

async function renamePage(p) {
  const name = await askText({ title: "タブの名前を変える", label: "タブの名前", value: p.name });
  if (!name) return;
  p.name = name;
  commit();
}

function deletePage(p) {
  if (state.pages.length <= 1) return;
  const count = p.widgets.length;
  const extra = count ? `\n（このタブのウィジェット ${count} 個も消えます）` : "";
  if (!confirm(`タブ「${p.name}」を削除しますか？${extra}`)) return;
  state.pages = state.pages.filter((x) => x.id !== p.id);
  if (activePageId === p.id) {
    activePageId = state.pages[0].id;
    history.replaceState(null, "", `#${encodeURIComponent(activePageId)}`);
  }
  commit();
}

// Alt（Mac は option）＋数字キーでタブを切り替え
document.addEventListener("keydown", (event) => {
  if (!state || !event.altKey || event.ctrlKey || event.metaKey) return;
  const n = Number((event.code || "").replace("Digit", ""));
  if (!n || n > state.pages.length || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  switchPage(state.pages[n - 1].id);
});

/* ================================================================== */
/* 保存                                                                 */
/* ================================================================== */

function setStatus(text, stateName = "") {
  el.saveStatus.textContent = text;
  el.saveStatus.dataset.state = stateName;
}

function showBanner(message, kind = "error") {
  el.banner.textContent = message;
  el.banner.dataset.kind = kind;
  el.banner.hidden = !message;
}

function scheduleSave() {
  setStatus("保存待ち…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state) return;
  setStatus("保存中…");
  try {
    await storage.save(state, storageMode);
    setStatus(storageMode === "remote" ? "保存しました" : "このブラウザに保存しました");
  } catch (err) {
    setStatus("保存できませんでした", "error");
    showBanner(err.message);
  }
}

/** 変更を反映：描き直して保存 */
function commit({ rerender = true } = {}) {
  if (rerender) render();
  scheduleSave();
}

window.addEventListener("beforeunload", (event) => {
  if (saveTimer) {
    saveNow();
    event.preventDefault();
  }
});

/* ================================================================== */
/* 描画                                                                 */
/* ================================================================== */

function applySettings(settings = state.settings) {
  const { mode, preset, density, layout } = settings;
  if (layout === "flow") el.root.dataset.layout = "flow";
  else delete el.root.dataset.layout;
  if (mode === "light" || mode === "dark") el.root.dataset.mode = mode;
  else delete el.root.dataset.mode;
  if (preset) el.root.dataset.preset = preset;
  else delete el.root.dataset.preset;
  if (density === "compact") el.root.dataset.density = density;
  else delete el.root.dataset.density;
  if (state) {
    el.title.textContent = state.title || "Dashboard";
    document.title = state.title || "Dashboard";
  }
}

function render() {
  applySettings();
  destroySortables();

  renderTabs();
  const nodes = widgets().map(renderWidget);
  if (editing) {
    nodes.push(
      h("button", { type: "button", class: "widget-add", onclick: () => openWidgetDialog(null) }, "＋ ウィジェットを追加"),
    );
  }
  if (widgets().length === 0 && !editing) {
    nodes.push(
      h("p", { class: "widget__empty" }, "ウィジェットがありません。右上の「編集」から追加できます。"),
    );
  }
  el.dashboard.replaceChildren(...nodes);

  setupSortables();
  applyFilter();
  updateClocks();
  if (focusAfterRender) {
    $(focusAfterRender)?.focus();
    focusAfterRender = null;
  }
}

function renderWidget(widget) {
  const style = isHexColor(widget.accent) ? { "--widget-accent": widget.accent } : {};
  const section = h("section", {
    class: `widget widget--${widget.type}`,
    dataset: { id: widget.id, size: widget.size, rows: String(widget.rows), type: widget.type },
    "data-accent": isHexColor(widget.accent) ? "" : null,
    "aria-label": widget.title || WIDGET_TYPES[widget.type],
  });
  // カスタムプロパティは Object.assign では入らないので setProperty で
  for (const [k, v] of Object.entries(style)) section.style.setProperty(k, v);

  const tools = h("div", { class: "widget__tools" });
  if (widget.type === "links") {
    tools.append(
      h("button", {
        type: "button",
        class: "button button--small button--ghost",
        title: "リンクを追加",
        "aria-label": "リンクを追加",
        onclick: () => openLinkDialog(widget.id, null),
      }, "＋"),
    );
  }
  if (widget.type === "todo") {
    tools.append(
      h("button", {
        type: "button",
        class: "button button--small button--ghost",
        title: "カテゴリーを追加",
        "aria-label": "カテゴリーを追加",
        onclick: () => addTodoCategory(widget),
      }, "＋"),
    );
  }
  tools.append(
    h("button", {
      type: "button",
      class: "button button--small button--ghost",
      title: "ウィジェットを編集",
      "aria-label": "ウィジェットを編集",
      onclick: () => openWidgetDialog(widget.id),
    }, "✎"),
  );

  section.append(
    h("header", { class: "widget__header" },
      h("span", { class: "widget__handle", title: "ドラッグで移動", "aria-hidden": "true" }, "⠿"),
      h("h2", { class: "widget__title" }, h("span", { class: "widget__title-text" }, widget.title || "")),
      tools,
    ),
    h("div", { class: "widget__body" }, renderWidgetBody(widget)),
  );
  return section;
}

function renderWidgetBody(widget) {
  switch (widget.type) {
    case "links": return renderLinks(widget);
    case "note": return renderNote(widget);
    case "clock": return renderClock(widget);
    case "search": return renderSearch(widget);
    case "embed": return renderEmbed(widget);
    case "todo": return renderTodo(widget);
    default: return null;
  }
}

function renderLinks(widget) {
  const list = h("ul", {
    class: `link-list link-list--${widget.view}`,
    dataset: { widgetId: widget.id },
  });
  for (const item of widget.items) {
    list.append(renderLinkItem(widget, item));
  }
  if (widget.items.length === 0 && !editing) {
    return h("p", { class: "widget__empty" }, "リンクがありません。ブラウザのアドレスバーから URL をここにドラッグすると追加できます");
  }
  return list;
}

function renderLinkItem(widget, item) {
  const url = safeUrl(item.url);
  const title = item.title || hostname(url) || url;
  const newTab = state.settings.openInNewTab;
  const link = h("a", {
    class: "link",
    href: url,
    target: newTab ? "_blank" : null,
    rel: newTab ? "noopener noreferrer" : "noreferrer",
    title: item.description ? `${title}\n${item.description}` : url,
  },
    renderIcon(item, url, title),
    h("span", { class: "link__text" },
      h("span", { class: "link__title" }, title),
      item.description ? h("span", { class: "link__desc" }, item.description) : null,
    ),
  );
  // 編集モード中はリンクを開かずに編集する
  link.addEventListener("click", (event) => {
    if (editing) {
      event.preventDefault();
      openLinkDialog(widget.id, item.id);
    }
  });

  return h("li", {
    class: "link-item",
    dataset: { id: item.id, search: `${title} ${url} ${item.description || ""}`.toLowerCase() },
  },
    link,
    h("button", {
      type: "button",
      class: "button button--small button--ghost link-item__edit",
      "aria-label": `${title} を編集`,
      onclick: () => openLinkDialog(widget.id, item.id),
    }, "✎"),
  );
}

function renderIcon(item, url, title) {
  const icon = (item.icon || "").trim();
  const letter = () =>
    h("span", { class: "link__icon link__icon--letter", "aria-hidden": "true" }, (title || "?").trim().charAt(0).toUpperCase());

  const imageSrc = icon && safeUrl(icon)
    ? safeUrl(icon)
    : !icon && state.settings.useFavicons && /^https?:/.test(url) && hostname(url)
      ? FAVICON_URL.replace("{domain}", encodeURIComponent(new URL(url).hostname))
      : null;

  if (imageSrc) {
    const img = h("img", { src: imageSrc, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    const wrap = h("span", { class: "link__icon", "aria-hidden": "true" }, img);
    img.addEventListener("error", () => wrap.replaceWith(letter()), { once: true });
    return wrap;
  }
  if (icon) return h("span", { class: "link__icon", "aria-hidden": "true" }, icon); // 絵文字
  return letter();
}

function renderNote(widget) {
  const area = h("textarea", {
    class: "note",
    "aria-label": widget.title || "メモ",
    placeholder: "ここにメモを書けます（自動保存）",
  });
  area.value = widget.text || "";
  area.addEventListener("input", () => {
    widget.text = area.value;
    commit({ rerender: false });
  });
  return area;
}

function renderClock(widget) {
  return h("div", { class: "clock", dataset: { timeZone: widget.timeZone || "" } },
    h("span", { class: "clock__time" }),
    h("span", { class: "clock__date" }),
  );
}

function updateClocks() {
  const now = new Date();
  for (const node of $$(".clock", el.dashboard)) {
    const timeZone = node.dataset.timeZone || undefined;
    try {
      $(".clock__time", node).textContent = now.toLocaleTimeString("ja-JP", {
        timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      $(".clock__date", node).textContent = now.toLocaleDateString("ja-JP", {
        timeZone, year: "numeric", month: "long", day: "numeric", weekday: "short",
      });
    } catch {
      $(".clock__date", node).textContent = `タイムゾーン「${timeZone}」が不正です`;
    }
  }
}

function renderSearch(widget) {
  const input = h("input", { class: "input", type: "search", name: "q", placeholder: "検索", "aria-label": "Web 検索" });
  const form = h("form", { class: "web-search" },
    input,
    h("button", { class: "button button--primary", type: "submit" }, "検索"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const template = widget.searchUrl || DEFAULT_SEARCH_URL;
    const url = safeUrl(template.replace("%s", encodeURIComponent(q)));
    if (url) window.open(url, state.settings.openInNewTab ? "_blank" : "_self", "noopener");
  });
  return form;
}

function renderEmbed(widget) {
  // YouTube の URL は、そのまま貼れば埋め込み用のプレーヤーに変換する
  const youtube = toYouTubeEmbed(widget.embedUrl || "");
  if (youtube) {
    return h("iframe", {
      class: `embed embed--video${youtube.vertical ? " embed--vertical" : ""}`,
      src: youtube.src,
      title: widget.title || "YouTube 動画",
      loading: "lazy",
      // YouTube は参照元の情報がないと再生できない（エラー 153）ため、送る設定にする
      referrerpolicy: "strict-origin-when-cross-origin",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowfullscreen: true,
    });
  }

  const url = safeUrl(widget.embedUrl || "");
  if (!url || !/^https:/.test(url)) {
    return h("p", { class: "widget__empty" },
      "埋め込む URL（https://…）を設定してください。YouTube の URL もそのまま貼れます。編集中でなくても、URL をここにドラッグして設定できます");
  }
  const frame = h("iframe", {
    class: "embed",
    src: url,
    title: widget.title || "埋め込み",
    loading: "lazy",
    referrerpolicy: "no-referrer",
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  });
  // 高さはタイル表示では段に合わせ、「中身に合わせる」表示のときだけこの値を使う
  frame.style.setProperty("--embed-height", `${Math.min(Math.max(Number(widget.height) || 400, 120), 1600)}px`);
  return frame;
}

/* ================================================================== */
/* ToDo                                                                 */
/* ================================================================== */

function renderTodo(widget) {
  const cats = widget.categories;
  const wrap = h("div", { class: "todo" });
  if (cats.length === 0) {
    wrap.append(h("p", { class: "widget__empty" },
      editing ? "見出しの「＋」でカテゴリーを追加してください" : "カテゴリーがありません。「編集」からカテゴリーを追加できます"));
    return wrap;
  }

  // 編集モードでは並べ替えのため、すべてのカテゴリーを表示する
  let filter = editing ? "all" : todoFilters.get(widget.id) || "all";
  if (filter !== "all" && !cats.some((c) => c.id === filter)) filter = "all";

  // 追加フォーム
  const input = h("input", {
    class: "input todo__input",
    type: "text",
    placeholder: "ToDo を追加",
    "aria-label": "ToDo の内容",
    maxlength: "200",
    "data-todo-input": widget.id,
  });
  const select = h("select", { class: "input todo__select", "aria-label": "カテゴリー" },
    ...cats.map((c) => h("option", { value: c.id }, c.name)));
  select.value = filter !== "all"
    ? filter
    : cats.some((c) => c.id === widget.lastCategoryId) ? widget.lastCategoryId : cats[0].id;
  if (cats.length === 1) select.hidden = true;
  const form = h("form", { class: "todo__form" },
    input, select, h("button", { class: "button button--primary", type: "submit" }, "追加"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    widget.items.push({ id: uid(), text, done: false, categoryId: select.value });
    widget.lastCategoryId = select.value;
    focusAfterRender = `[data-todo-input="${widget.id}"]`;
    commit();
  });
  wrap.append(form);

  // カテゴリーの絞り込み
  if (!editing && cats.length > 1) {
    const chip = (id, label, count) => h("button", {
      type: "button",
      class: "todo-chip",
      "aria-pressed": String(filter === id),
      onclick: () => { todoFilters.set(widget.id, id); render(); },
    }, label, count ? h("span", { class: "todo-chip__count" }, count) : null);
    const remaining = (id) => widget.items.filter((i) => !i.done && (id === "all" || i.categoryId === id)).length;
    wrap.append(h("div", { class: "todo__chips", role: "group", "aria-label": "カテゴリーで絞り込む" },
      chip("all", "すべて", remaining("all")),
      ...cats.map((c) => chip(c.id, c.name, remaining(c.id))),
    ));
  }

  // カテゴリーごとの一覧
  const shown = filter === "all" ? cats : cats.filter((c) => c.id === filter);
  const groups = h("div", { class: "todo__groups", dataset: { widgetId: widget.id } });
  for (const cat of shown) {
    const items = widget.items.filter((i) => i.categoryId === cat.id);
    const left = items.filter((i) => !i.done).length;
    const list = h("ul", { class: "todo-list", dataset: { categoryId: cat.id } },
      ...items.map((item) => renderTodoItem(widget, item)));
    groups.append(h("section", { class: "todo-group", dataset: { categoryId: cat.id } },
      h("header", { class: "todo-group__header" },
        h("span", { class: "todo-group__handle", title: "ドラッグでカテゴリーを並べ替え", "aria-hidden": "true" }, "⠿"),
        h("span", { class: "todo-group__name" }, cat.name),
        h("span", { class: "todo-group__count", title: "未完了 / 全体" }, `${left}/${items.length}`),
        h("span", { class: "todo-group__tools" },
          h("button", {
            type: "button",
            class: "button button--small button--ghost",
            "aria-label": `カテゴリー「${cat.name}」の名前を変える`,
            title: "名前を変える",
            onclick: () => renameTodoCategory(widget, cat),
          }, "✎"),
          h("button", {
            type: "button",
            class: "button button--small button--ghost button--danger",
            "aria-label": `カテゴリー「${cat.name}」を削除`,
            title: "カテゴリーを削除",
            onclick: () => deleteTodoCategory(widget, cat),
          }, "×"),
        ),
      ),
      list,
      items.length === 0 && !editing ? h("p", { class: "todo-group__empty" }, "ToDo はありません") : null,
    ));
  }
  wrap.append(groups);

  // 完了したものの一括削除
  const shownIds = new Set(shown.map((c) => c.id));
  const doneCount = widget.items.filter((i) => i.done && shownIds.has(i.categoryId)).length;
  if (doneCount > 0) {
    wrap.append(h("div", { class: "todo__footer" },
      h("button", {
        type: "button",
        class: "button button--small button--ghost",
        onclick: () => {
          widget.items = widget.items.filter((i) => !(i.done && shownIds.has(i.categoryId)));
          commit();
        },
      }, `完了した ${doneCount} 件を削除`),
    ));
  }
  return wrap;
}

function renderTodoItem(widget, item) {
  const check = h("input", {
    type: "checkbox",
    class: "todo-item__check",
    checked: item.done,
    "aria-label": `${item.text} を完了にする`,
  });
  check.addEventListener("change", () => {
    item.done = check.checked;
    commit();
  });
  const text = h("span", { class: "todo-item__text" }, item.text);
  const label = h("label", { class: "todo-item__label" }, check, text);
  // 編集モードでは、文字をクリックすると書き直せる
  label.addEventListener("click", async (event) => {
    if (!editing || event.target === check) return;
    event.preventDefault();
    const value = await askText({ title: "ToDo を編集", label: "内容", value: item.text });
    if (value) {
      item.text = value;
      commit();
    }
  });
  return h("li", { class: `todo-item${item.done ? " todo-item--done" : ""}`, dataset: { id: item.id } },
    label,
    h("button", {
      type: "button",
      class: "button button--small button--ghost todo-item__delete",
      "aria-label": `${item.text} を削除`,
      title: "削除",
      onclick: () => {
        widget.items = widget.items.filter((i) => i.id !== item.id);
        commit();
      },
    }, "×"),
  );
}

async function addTodoCategory(widget) {
  const name = await askText({ title: "カテゴリーを追加", label: "カテゴリー名", value: "" });
  if (!name) return;
  widget.categories.push({ id: uid(), name });
  commit();
}

async function renameTodoCategory(widget, cat) {
  const name = await askText({ title: "カテゴリーの名前を変える", label: "カテゴリー名", value: cat.name });
  if (!name) return;
  cat.name = name;
  commit();
}

function deleteTodoCategory(widget, cat) {
  const count = widget.items.filter((i) => i.categoryId === cat.id).length;
  const extra = count ? `\n（このカテゴリーの ToDo ${count} 件も消えます）` : "";
  if (!confirm(`カテゴリー「${cat.name}」を削除しますか？${extra}`)) return;
  widget.categories = widget.categories.filter((c) => c.id !== cat.id);
  widget.items = widget.items.filter((i) => i.categoryId !== cat.id);
  commit();
}

/* ================================================================== */
/* 1 行の文字を入力してもらうダイアログ                                   */
/* ================================================================== */

function askText({ title, label, value }) {
  const input = el.textForm.elements.text;
  $("#text-dialog-title").textContent = title;
  $("#text-dialog-label").textContent = label;
  input.value = value || "";
  el.textDialog.returnValue = "";
  el.textDialog.showModal();
  input.select();
  return new Promise((resolve) => {
    el.textDialog.addEventListener("close", () => {
      resolve(el.textDialog.returnValue === "ok" ? input.value.trim() || null : null);
    }, { once: true });
  });
}

/* ================================================================== */
/* アドレスバーなどからのリンクのドロップ                                 */
/* ================================================================== */

let internalDrag = false; // このページの中で始まったドラッグは対象外
let toastTimer = null;

function showToast(message, action) {
  clearTimeout(toastTimer);
  el.toast.replaceChildren(h("span", {}, message));
  if (action) {
    el.toast.append(h("button", {
      type: "button",
      class: "button button--small",
      onclick: () => { el.toast.hidden = true; action.run(); },
    }, action.label));
  }
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 4000);
}

function hasLinkData(dataTransfer) {
  const types = [...(dataTransfer?.types || [])];
  if (types.includes("Files")) return false;
  return types.includes("text/uri-list") || types.includes("text/x-moz-url") || types.includes("text/plain");
}

/** ドロップされたデータから URL とページ名を取り出す */
function readDroppedLink(dataTransfer) {
  let url = null;
  let title = "";
  // Firefox：「URL 改行 ページ名」
  const moz = dataTransfer.getData("text/x-moz-url");
  if (moz) {
    const [u, t] = moz.split(/\r?\n/);
    url = safeUrl(u);
    title = (t || "").trim();
  }
  if (!url) {
    const uri = dataTransfer.getData("text/uri-list")
      .split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
    url = safeUrl(uri || "");
  }
  // ページ名は HTML（<a href="...">ページ名</a>）に入っていることがある
  const html = dataTransfer.getData("text/html");
  if (html) {
    const a = new DOMParser().parseFromString(html, "text/html").querySelector("a[href]");
    if (a) {
      url = url || safeUrl(a.getAttribute("href"));
      if (!title) title = a.textContent.trim();
    }
  }
  if (!url) url = safeUrl(dataTransfer.getData("text/plain"));
  if (!url) return null;
  if (title === url || safeUrl(title)) title = "";
  return { url, title: title.slice(0, 80) };
}

function setDropTarget(widgetEl) {
  for (const node of $$(".widget.is-drop-target", el.dashboard)) {
    if (node !== widgetEl) node.classList.remove("is-drop-target");
  }
  widgetEl?.classList.add("is-drop-target");
}

document.addEventListener("dragstart", () => { internalDrag = true; });
document.addEventListener("dragend", () => { internalDrag = false; setDropTarget(null); });

document.addEventListener("dragover", (event) => {
  if (internalDrag || !state || !hasLinkData(event.dataTransfer)) return;
  if (event.target.closest?.("input, textarea, dialog")) return; // 入力欄への文字のドロップはそのまま
  // ページ外へ移動してしまわないよう、どこでも既定の動作は止める
  event.preventDefault();
  const target = event.target.closest?.(".widget--links, .widget--embed") || null;
  event.dataTransfer.dropEffect = target ? "copy" : "none";
  setDropTarget(target);
});

document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) setDropTarget(null); // ウィンドウの外に出た
});

document.addEventListener("drop", (event) => {
  if (internalDrag || !state || !hasLinkData(event.dataTransfer)) return;
  if (event.target.closest?.("input, textarea, dialog")) return;
  event.preventDefault();
  setDropTarget(null);
  const target = event.target.closest?.(".widget--links, .widget--embed");
  const widget = target && widgets().find((w) => w.id === target.dataset.id);
  if (!widget) return;

  const link = readDroppedLink(event.dataTransfer);
  if (!link) {
    showToast("URL を読み取れませんでした");
    return;
  }
  // 埋め込みウィジェット：表示する URL を差し替える
  if (widget.type === "embed") {
    const previous = widget.embedUrl;
    widget.embedUrl = link.url;
    commit();
    showToast(toYouTubeEmbed(link.url) ? "YouTube 動画を埋め込みました" : "埋め込む URL を変更しました",
      previous ? { label: "元に戻す", run: () => { widget.embedUrl = previous; commit(); } } : null);
    return;
  }
  const name = widget.title || "リンク集";
  if (widget.items.some((i) => safeUrl(i.url) === link.url)) {
    showToast(`「${name}」にはすでに登録されています`);
    return;
  }
  const item = { id: uid(), url: link.url, title: link.title, icon: "", description: "" };
  widget.items.push(item);
  commit();
  showToast(`「${link.title || hostname(link.url)}」を「${name}」に追加しました`, {
    label: "名前を編集",
    run: () => openLinkDialog(widget.id, item.id),
  });
});

/* ================================================================== */
/* ドラッグ＆ドロップ（編集モードのみ）                                   */
/* ================================================================== */

function destroySortables() {
  for (const s of sortables) s.destroy();
  sortables = [];
}

function setupSortables() {
  if (!editing || typeof Sortable === "undefined") return;

  const common = {
    animation: 150,
    ghostClass: "is-ghost",
    chosenClass: "is-chosen",
    dragClass: "is-dragging",
    forceFallback: true, // マウスでもタッチでも同じ動きにする
    fallbackOnBody: true,
    delayOnTouchOnly: true,
    delay: 150, // スマホではスクロールと区別するため少し長押し
  };

  // タブの並べ替え
  const tabList = $(".tabs__list", el.tabs);
  if (tabList) {
    sortables.push(new Sortable(tabList, {
      ...common,
      direction: "horizontal",
      draggable: ".tab-item",
      handle: ".tab-item__handle",
      onEnd: () => {
        const order = $$(".tab-item", tabList).map((n) => n.dataset.pageId);
        state.pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        commit();
      },
    }));
  }

  // ウィジェットの並べ替え
  sortables.push(new Sortable(el.dashboard, {
    ...common,
    handle: ".widget__handle",
    draggable: ".widget",
    onEnd: () => {
      const order = $$(".widget", el.dashboard).map((n) => n.dataset.id);
      widgets().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      commit();
    },
  }));

  // リンクの並べ替え（ウィジェット間の移動も可）
  for (const list of $$(".link-list", el.dashboard)) {
    sortables.push(new Sortable(list, {
      ...common,
      group: "links",
      draggable: ".link-item",
      filter: ".link-item__edit",
      preventOnFilter: false,
      onEnd: (event) => {
        if (event.from === event.to && event.oldIndex === event.newIndex) return;
        const all = new Map();
        for (const w of widgets()) {
          if (w.type === "links") for (const item of w.items) all.set(item.id, item);
        }
        for (const listEl of new Set([event.from, event.to])) {
          const widget = widgets().find((w) => w.id === listEl.dataset.widgetId);
          if (!widget) continue;
          widget.items = $$(".link-item", listEl).map((n) => all.get(n.dataset.id)).filter(Boolean);
        }
        commit();
      },
    }));
  }

  // ToDo：カテゴリーの並べ替え
  for (const groups of $$(".todo__groups", el.dashboard)) {
    const widget = widgets().find((w) => w.id === groups.dataset.widgetId);
    if (!widget) continue;
    sortables.push(new Sortable(groups, {
      ...common,
      handle: ".todo-group__handle",
      draggable: ".todo-group",
      onEnd: () => {
        const order = $$(".todo-group", groups).map((n) => n.dataset.categoryId);
        widget.categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        commit();
      },
    }));
    // ToDo の並べ替え（同じウィジェットのカテゴリー間で移動も可）
    for (const list of $$(".todo-list", groups)) {
      sortables.push(new Sortable(list, {
        ...common,
        group: `todo-${widget.id}`,
        draggable: ".todo-item",
        filter: "input, button",
        preventOnFilter: false,
        onEnd: () => {
          const byId = new Map(widget.items.map((i) => [i.id, i]));
          widget.items = $$(".todo-list", groups).flatMap((listEl) =>
            $$(".todo-item", listEl).map((n) => {
              const item = byId.get(n.dataset.id);
              if (item) item.categoryId = listEl.dataset.categoryId;
              return item;
            }).filter(Boolean));
          commit();
        },
      }));
    }
  }
}

function setEditing(value) {
  editing = value;
  if (editing) el.root.dataset.editing = "";
  else delete el.root.dataset.editing;
  el.editToggle.setAttribute("aria-pressed", String(editing));
  $(".button__label", el.editToggle).textContent = editing ? "完了" : "編集";
  render();
}

/* ================================================================== */
/* 絞り込み                                                              */
/* ================================================================== */

function applyFilter() {
  const q = el.filter.value.trim().toLowerCase();
  for (const item of $$(".link-item", el.dashboard)) {
    item.classList.toggle("is-filtered-out", Boolean(q) && !item.dataset.search.includes(q));
  }
  for (const widget of $$(".widget--links", el.dashboard)) {
    const visible = $$(".link-item:not(.is-filtered-out)", widget).length;
    widget.classList.toggle("is-filtered-out", Boolean(q) && visible === 0);
  }
  for (const widget of $$(".widget:not(.widget--links)", el.dashboard)) {
    widget.classList.toggle("is-filtered-out", Boolean(q));
  }
}

el.filter.addEventListener("input", applyFilter);
el.filter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = $(".link-item:not(.is-filtered-out) .link", el.dashboard);
    if (first) first.click();
  } else if (event.key === "Escape") {
    el.filter.value = "";
    applyFilter();
    el.filter.blur();
  }
});

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (event.key === "/" && !typing && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    el.filter.focus();
  }
});

/* ================================================================== */
/* ウィジェットの編集                                                    */
/* ================================================================== */

let editingWidgetId = null;

function updateWidgetFormVisibility() {
  const type = el.widgetForm.elements.type.value;
  for (const field of $$("[data-for-type]", el.widgetForm)) {
    field.hidden = field.dataset.forType !== type;
  }
  // YouTube の URL なら高さは自動なので、入力欄を隠して説明を出す
  const isYouTube = type === "embed" && Boolean(toYouTubeEmbed(el.widgetForm.elements.embedUrl.value));
  $("#embed-url-hint").hidden = !isYouTube;
  if (isYouTube) $("#embed-height-field").hidden = true;
}
el.widgetForm.elements.type.addEventListener("change", updateWidgetFormVisibility);
el.widgetForm.elements.embedUrl.addEventListener("input", updateWidgetFormVisibility);

function openWidgetDialog(widgetId) {
  editingWidgetId = widgetId;
  const widget = widgets().find((w) => w.id === widgetId);
  const f = el.widgetForm.elements;

  $("#widget-dialog-title").textContent = widget ? "ウィジェットを編集" : "ウィジェットを追加";
  f.type.value = widget?.type || "links";
  f.type.disabled = Boolean(widget); // 種類は作成時のみ選べる
  f.title.value = widget?.title ?? "";
  f.size.value = widget?.size || "m";
  f.rows.value = String(widget?.rows || DEFAULT_ROWS[f.type.value] || 2);
  f.page.replaceChildren(...state.pages.map((p) => h("option", { value: p.id }, p.name)));
  f.page.value = page().id;
  $("#widget-page-field").hidden = state.pages.length <= 1;
  f.useAccent.checked = isHexColor(widget?.accent);
  f.accent.value = isHexColor(widget?.accent) ? widget.accent : "#2f6f5e";
  f.view.value = widget?.view || "list";
  f.searchUrl.value = widget?.searchUrl || "";
  f.embedUrl.value = widget?.embedUrl || "";
  f.height.value = widget?.height || 400;
  f.timeZone.value = widget?.timeZone || "";
  el.widgetDelete.hidden = !widget;
  updateWidgetFormVisibility();
  el.widgetDialog.returnValue = "";
  el.widgetDialog.showModal();
}

el.widgetForm.elements.accent.addEventListener("input", () => {
  el.widgetForm.elements.useAccent.checked = true;
});

// 新しく追加するときは、種類を変えたら高さ（段数）もその種類の初期値にする
el.widgetForm.elements.type.addEventListener("change", () => {
  if (!editingWidgetId) {
    el.widgetForm.elements.rows.value = String(DEFAULT_ROWS[el.widgetForm.elements.type.value] || 2);
  }
});

el.widgetDialog.addEventListener("close", () => {
  if (el.widgetDialog.returnValue !== "ok") return;
  const f = el.widgetForm.elements;
  let widget = widgets().find((w) => w.id === editingWidgetId);
  if (!widget) {
    widget = { id: uid(), type: f.type.value };
    if (widget.type === "links") widget.items = [];
    if (widget.type === "note") widget.text = "";
    if (widget.type === "todo") {
      widget.categories = DEFAULT_TODO_CATEGORIES.map((name) => ({ id: uid(), name }));
      widget.items = [];
    }
    widgets().push(widget);
  }
  widget.title = f.title.value.trim();
  widget.size = SIZES.includes(f.size.value) ? f.size.value : "m";
  widget.rows = normalizeRows(f.rows.value, widget.type);
  if (f.useAccent.checked && isHexColor(f.accent.value)) widget.accent = f.accent.value;
  else delete widget.accent;

  if (widget.type === "links") widget.view = f.view.value === "grid" ? "grid" : "list";
  if (widget.type === "search") widget.searchUrl = f.searchUrl.value.trim();
  if (widget.type === "embed") {
    widget.embedUrl = f.embedUrl.value.trim();
    widget.height = Number(f.height.value) || 400;
  }
  if (widget.type === "clock") widget.timeZone = f.timeZone.value.trim();

  // 別のタブへ移す
  const target = state.pages.find((p) => p.id === f.page.value);
  if (target && target.id !== page().id) {
    page().widgets = widgets().filter((w) => w.id !== widget.id);
    target.widgets.push(widget);
    commit();
    showToast(`「${widget.title || WIDGET_TYPES[widget.type]}」をタブ「${target.name}」に移しました`, {
      label: "そのタブを開く",
      run: () => switchPage(target.id),
    });
    return;
  }
  commit();
});

el.widgetDelete.addEventListener("click", () => {
  const widget = widgets().find((w) => w.id === editingWidgetId);
  if (!widget) return;
  const extra = widget.type === "links" && widget.items.length ? `（リンク ${widget.items.length} 件も消えます）`
    : widget.type === "todo" && widget.items.length ? `（ToDo ${widget.items.length} 件も消えます）` : "";
  if (!confirm(`「${widget.title || WIDGET_TYPES[widget.type]}」を削除しますか？${extra}`)) return;
  page().widgets = widgets().filter((w) => w.id !== editingWidgetId);
  el.widgetDialog.close("deleted");
  commit();
});

/* ================================================================== */
/* リンクの編集                                                          */
/* ================================================================== */

let linkTarget = { widgetId: null, itemId: null };

function openLinkDialog(widgetId, itemId) {
  linkTarget = { widgetId, itemId };
  const widget = widgets().find((w) => w.id === widgetId);
  const item = widget?.items.find((i) => i.id === itemId);
  const f = el.linkForm.elements;

  $("#link-dialog-title").textContent = item ? "リンクを編集" : "リンクを追加";
  f.url.value = item?.url || "";
  f.title.value = item?.title || "";
  f.icon.value = item?.icon || "";
  f.description.value = item?.description || "";
  el.linkDelete.hidden = !item;
  el.linkDialog.returnValue = "";
  el.linkDialog.showModal();
}

el.linkForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "ok" && !safeUrl(el.linkForm.elements.url.value)) {
    event.preventDefault();
    el.linkForm.elements.url.setCustomValidity("http:// か https:// で始まる URL を入力してください");
    el.linkForm.elements.url.reportValidity();
  }
});
el.linkForm.elements.url.addEventListener("input", () => el.linkForm.elements.url.setCustomValidity(""));

el.linkDialog.addEventListener("close", () => {
  if (el.linkDialog.returnValue !== "ok") return;
  const widget = widgets().find((w) => w.id === linkTarget.widgetId);
  if (!widget) return;
  const f = el.linkForm.elements;
  const url = safeUrl(f.url.value);
  if (!url) return;

  let item = widget.items.find((i) => i.id === linkTarget.itemId);
  if (!item) {
    item = { id: uid() };
    widget.items.push(item);
  }
  item.url = url;
  item.title = f.title.value.trim();
  item.icon = f.icon.value.trim();
  item.description = f.description.value.trim();
  commit();
});

el.linkDelete.addEventListener("click", () => {
  const widget = widgets().find((w) => w.id === linkTarget.widgetId);
  if (!widget) return;
  widget.items = widget.items.filter((i) => i.id !== linkTarget.itemId);
  el.linkDialog.close("deleted");
  commit();
});

/* ================================================================== */
/* 設定                                                                 */
/* ================================================================== */

/** テーマの見本。data-preset を持たせると、中はそのテーマの CSS 変数で描かれる */
el.themePicker.replaceChildren(
  ...THEME_PRESETS.map((p) =>
    h("label", { class: "theme-option" },
      h("input", { type: "radio", name: "preset", value: p.id, class: "theme-option__input" }),
      h("span", { class: "theme-preview", dataset: { preset: p.id || "default" }, "aria-hidden": "true" },
        h("span", { class: "theme-preview__title" }, "Dashboard"),
        h("span", { class: "theme-preview__cards" },
          h("span", { class: "theme-preview__card" },
            h("span", { class: "theme-preview__heading" }, "Links"),
            h("span", { class: "theme-preview__line" }),
            h("span", { class: "theme-preview__line theme-preview__line--short" }),
            h("span", { class: "theme-preview__chip" }),
          ),
          h("span", { class: "theme-preview__card" },
            h("span", { class: "theme-preview__heading" }, "Clock"),
            h("span", { class: "theme-preview__clock" }, "9:41"),
          ),
        ),
      ),
      h("span", { class: "theme-option__label" },
        p.label,
        p.note ? h("span", { class: "theme-option__note" }, `（${p.note}）`) : null,
      ),
    ),
  ),
);

el.settingsOpen.addEventListener("click", () => {
  const f = el.settingsForm.elements;
  f.title.value = state.title;
  f.mode.value = state.settings.mode;
  f.preset.value = state.settings.preset;
  f.density.value = state.settings.density;
  f.layout.value = state.settings.layout;
  f.openInNewTab.checked = state.settings.openInNewTab;
  f.useFavicons.checked = state.settings.useFavicons;
  el.settingsDialog.returnValue = "";
  el.settingsDialog.showModal();
});

// 配色・テーマ・表示密度・レイアウトは選んだ時点で画面に反映して見せる（保存はまだ）
el.settingsForm.addEventListener("change", (event) => {
  if (!["mode", "preset", "density", "layout"].includes(event.target.name)) return;
  const f = el.settingsForm.elements;
  applySettings({
    ...state.settings,
    mode: f.mode.value,
    preset: f.preset.value,
    density: f.density.value,
    layout: f.layout.value,
  });
});

el.settingsDialog.addEventListener("close", () => {
  if (el.settingsDialog.returnValue === "ok") {
    const f = el.settingsForm.elements;
    state.title = f.title.value.trim() || "Dashboard";
    state.settings = {
      mode: f.mode.value,
      preset: f.preset.value,
      density: f.density.value === "compact" ? "compact" : "normal",
      layout: f.layout.value === "flow" ? "flow" : "tile",
      openInNewTab: f.openInNewTab.checked,
      useFavicons: f.useFavicons.checked,
    };
    commit();
  } else {
    applySettings(); // プレビューを元に戻す
  }
});

el.exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = h("a", {
    href: URL.createObjectURL(blob),
    download: `dashboard-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

el.importInput.addEventListener("change", async () => {
  const file = el.importInput.files?.[0];
  el.importInput.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.widgets)) throw new Error("widgets がありません");
    if (!confirm("今のダッシュボードを、読み込んだ内容で置き換えますか？")) return;
    state = normalize(data);
    pickInitialPage();
    el.settingsDialog.close("imported");
    commit();
  } catch (err) {
    alert(`読み込めませんでした: ${err.message}`);
  }
});

el.resetButton.addEventListener("click", async () => {
  if (!confirm("すべてのウィジェットとリンクを消して、初期状態に戻しますか？\n（先に「書き出す」でバックアップを取ることをおすすめします）")) return;
  try {
    state = normalize(await storage.loadDefault());
    pickInitialPage();
    el.settingsDialog.close("reset");
    commit();
  } catch (err) {
    alert(err.message);
  }
});

/* ================================================================== */
/* 起動                                                                 */
/* ================================================================== */

el.editToggle.addEventListener("click", () => setEditing(!editing));

/** ログイン前・読み込み失敗時：ダッシュボードを隠して、編集できないようにする */
function showSignedOut() {
  clearInterval(clockTimer);
  if (editing) setEditing(false);
  state = null;
  el.dashboard.replaceChildren();
  el.tabs.replaceChildren();
  el.tabs.hidden = true;
  el.headerSearch.hidden = true;
  el.headerActions.hidden = true;
  el.userEmail.textContent = "";
  el.signoutButton.hidden = true;
  el.title.textContent = "Dashboard";
  document.title = "Dashboard";
}

/** データを読み込んでダッシュボードを表示する */
async function openDashboard(user) {
  setStatus("読み込み中…");
  try {
    const result = await storage.load();
    state = normalize(result.data);
    pickInitialPage();
    storageMode = result.mode;
  } catch (err) {
    // 許可がない・設定漏れなど。データを上書きしないよう、画面は出さない
    showSignedOut();
    if (user) {
      el.userEmail.textContent = user.email;
      el.signoutButton.hidden = false;
    }
    showBanner(err.message);
    return;
  }

  el.signin.hidden = true;
  el.headerSearch.hidden = false;
  el.headerActions.hidden = false;
  el.editToggle.disabled = false;
  el.settingsOpen.disabled = false;
  if (user) {
    el.userEmail.textContent = user.email;
    el.signoutButton.hidden = false;
  }
  if (storageMode === "local") {
    showBanner(
      "Firebase が未設定のため「ローカルモード」で動いています。データはこのブラウザにだけ保存されます（README の手順 5）。",
      "info",
    );
  } else {
    showBanner("");
  }
  setStatus("");
  render();
  clearInterval(clockTimer);
  clockTimer = setInterval(updateClocks, 1000);
}

el.signinButton.addEventListener("click", async () => {
  el.signinButton.disabled = true;
  showBanner("");
  try {
    await storage.signIn();
  } catch (err) {
    showBanner(err.message);
  } finally {
    el.signinButton.disabled = false;
  }
});

el.signoutButton.addEventListener("click", async () => {
  if (saveTimer) await saveNow();
  await storage.signOut();
});

async function init() {
  // ログイン前も、前回選んだテーマで表示する
  const appearance = storage.readAppearance();
  applySettings({ ...DEFAULT_SETTINGS, ...(appearance || {}) });

  if (!storage.isConfigured) {
    await openDashboard(null);
    return;
  }

  setStatus("");
  try {
    await storage.initFirebase();
  } catch (err) {
    showBanner(err.message);
    return;
  }
  storage.watchUser((user) => {
    if (user) {
      el.signin.hidden = true;
      openDashboard(user);
    } else {
      showSignedOut();
      el.signin.hidden = false;
    }
  });
}

init();
