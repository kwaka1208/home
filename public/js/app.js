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
import { toYouTubeEmbed, toImageUrl } from "./embed.js";
import { CALENDAR_SCOPE, GMAIL_SCOPE, fetchCalendarEvents, fetchGmailUnread } from "./google.js";
import { GITHUB_LISTS, describeWeather, fetchGitHub, fetchWeather, geocode } from "./services.js";

const WIDGET_TYPES = {
  links: "リンク集",
  note: "メモ",
  clock: "時計",
  search: "Web 検索",
  embed: "埋め込み",
  todo: "ToDo",
  photo: "写真",
  calendar: "Google カレンダー",
  mail: "Gmail",
  weather: "天気",
  timer: "タイマー・ポモドーロ",
  worldclock: "世界時計",
  habit: "習慣トラッカー",
  github: "GitHub",
};
const DEFAULT_TODO_CATEGORIES = ["仕事", "プライベート"];
/** ウィジェットの高さ（段数）の選択肢と、種類ごとの初期値 */
const ROW_OPTIONS = [1, 2, 3, 4];
const DEFAULT_ROWS = {
  links: 2, note: 2, clock: 1, search: 1, embed: 2, todo: 3, photo: 2, calendar: 3, mail: 1,
  weather: 2, timer: 2, worldclock: 2, habit: 2, github: 3,
};
/** Google の API を使うウィジェット */
const GOOGLE_WIDGETS = ["calendar", "mail"];
/** 外部から読み込んで、一定時間ごとに読み込み直すウィジェット */
const REMOTE_WIDGETS = ["calendar", "mail", "weather", "github"];
const CALENDAR_DAYS = [1, 3, 7, 14];
const MAIL_LABELS = {
  INBOX: { name: "受信トレイ", hash: "inbox" },
  CATEGORY_PERSONAL: { name: "メイン", hash: "inbox" },
  IMPORTANT: { name: "重要", hash: "imp" },
  STARRED: { name: "スター付き", hash: "starred" },
};
/** 写真のスライドショーの切り替え間隔（秒）の選択肢。0 は切り替えない */
const PHOTO_INTERVALS = [0, 5, 10, 30, 60, 300];

const SIZES = ["s", "m", "l", "xl"];
const SIZE_NAMES = { s: "S", m: "M", l: "L", xl: "XL" };

/**
 * 種類ごとの最小サイズ（これより小さいと中身が使いにくいもの）。書いていない種類は S・1 段。
 * 編集画面ではこれより小さい大きさを選べず、読み込むときもここまで広げる。
 */
const MIN_SIZE = {
  links: { rows: 1 },
  todo: { size: "m", rows: 2 },      // 幅 S だと入力欄が狭すぎる
  embed: { rows: 2 },                // 1 段だと動画やカレンダーが小さすぎる
  calendar: { rows: 2 },
  timer: { rows: 2 },                // 1 段だと開始ボタンが隠れる
  habit: { size: "m", rows: 2 },     // 習慣 × 日付の表
  github: { rows: 2 },
};

function minSizeOf(type) {
  return { size: "s", rows: 1, ...(MIN_SIZE[type] || {}) };
}

/** 幅を最小サイズ以上にそろえる */
function clampSize(size, type) {
  const min = SIZES.indexOf(minSizeOf(type).size);
  const index = SIZES.indexOf(size);
  return SIZES[Math.max(index < 0 ? 1 : index, min)];
}

/** 高さ（段数）を選択肢の中で、最小サイズ以上にそろえる */
function normalizeRows(value, type) {
  const rows = Number(value);
  const valid = ROW_OPTIONS.includes(rows) ? rows : DEFAULT_ROWS[type] || 2;
  return Math.max(valid, minSizeOf(type).rows);
}
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
    size: clampSize(w.size, w.type),
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
  if (widget.type === "photo") {
    widget.photos = (Array.isArray(w.photos) ? w.photos : [])
      .filter((ph) => ph && toImageUrl(ph.url))
      .map((ph) => ({
        id: ph.id ? String(ph.id) : uid(),
        url: toImageUrl(ph.url),
        caption: typeof ph.caption === "string" ? ph.caption : "",
      }));
    widget.fit = widget.fit === "contain" ? "contain" : "cover";
    widget.interval = PHOTO_INTERVALS.includes(Number(w.interval)) ? Number(w.interval) : 10;
  }
  if (widget.type === "calendar") {
    widget.days = CALENDAR_DAYS.includes(Number(w.days)) ? Number(w.days) : 3;
    widget.allCalendars = w.allCalendars !== false;
  }
  WIDGET_FORMS[widget.type]?.normalize?.(widget);
  if (widget.type === "mail") {
    widget.label = MAIL_LABELS[w.label] ? w.label : "INBOX";
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
  stopWidgetTimers();

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
  // カレンダー・メールは 1 分ごとに見直し、古くなっていたら読み込み直す
  if (widgets().some((w) => REMOTE_WIDGETS.includes(w.type))) {
    widgetTimers.push(setInterval(refreshGoogleWidgets, 60 * 1000));
  }
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
  if (widget.type === "habit") {
    tools.append(
      h("button", {
        type: "button",
        class: "button button--small button--ghost",
        title: "習慣を追加",
        "aria-label": "習慣を追加",
        onclick: () => addHabit(widget),
      }, "＋"),
    );
  }
  if (widget.type === "photo") {
    tools.append(
      h("button", {
        type: "button",
        class: "button button--small button--ghost",
        title: "写真を追加",
        "aria-label": "写真を追加",
        onclick: () => addPhotoByUrl(widget),
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
    case "photo": return renderPhoto(widget);
    case "calendar": return renderCalendar(widget);
    case "mail": return renderMail(widget);
    case "weather": return renderWeather(widget);
    case "timer": return renderTimer(widget);
    case "worldclock": return renderWorldClock(widget);
    case "habit": return renderHabit(widget);
    case "github": return renderGitHub(widget);
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

/** Markdown を安全な HTML にする（ライブラリが読み込めないときは null） */
function markdownToHtml(text) {
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") return null;
  const html = marked.parse(text, { gfm: true, breaks: true, async: false });
  return DOMPurify.sanitize(html);
}

/** チェックボックスの行（- [ ] / - [x]）にあたる正規表現 */
const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm;

function renderNote(widget) {
  const area = h("textarea", {
    class: "note",
    "aria-label": widget.title || "メモ",
    placeholder: widget.markdown === false
      ? "ここにメモを書けます（自動保存）"
      : "ここにメモを書けます（自動保存）\n# 見出し / - 箇条書き / - [ ] チェック / **太字** / [リンク](https://…)",
  });
  area.value = widget.text || "";
  area.addEventListener("input", () => {
    widget.text = area.value;
    commit({ rerender: false });
  });
  if (widget.markdown === false) return area;

  // Markdown：ふだんは整えて表示し、クリックすると編集に切り替える
  const view = h("div", {
    class: "note note--view markdown",
    tabindex: "0",
    title: "クリックして編集",
    "aria-label": `${widget.title || "メモ"}（Enter で編集）`,
  });
  const box = h("div", { class: "note-box" }, view, area);

  const showView = () => {
    const text = widget.text || "";
    const html = text.trim() ? markdownToHtml(text) : null;
    if (text.trim() && html === null) return; // ライブラリが読めないときは編集欄のまま
    if (!text.trim()) {
      view.replaceChildren(h("p", { class: "note__placeholder" }, "クリックしてメモを書く（Markdown が使えます）"));
    } else {
      view.innerHTML = html;
      for (const a of view.querySelectorAll("a[href]")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      // チェックボックスは、クリックで元の文章の [ ] / [x] を切り替える
      [...view.querySelectorAll('input[type="checkbox"]')].forEach((box, n) => {
        box.disabled = false;
        box.addEventListener("change", () => {
          let i = -1;
          widget.text = (widget.text || "").replace(TASK_LINE, (all, head, mark) => {
            i += 1;
            return i === n ? `${head}[${mark === " " ? "x" : " "}]` : all;
          });
          area.value = widget.text;
          commit({ rerender: false });
          showView();
        });
      });
    }
    view.hidden = false;
    area.hidden = true;
  };
  const showEdit = () => {
    view.hidden = true;
    area.hidden = false;
    area.focus();
  };

  view.addEventListener("click", (event) => {
    if (editing || event.target.closest("a, input")) return;
    showEdit();
  });
  view.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target === view) {
      event.preventDefault();
      showEdit();
    }
  });
  area.addEventListener("blur", showView);
  area.addEventListener("keydown", (event) => {
    if (event.key === "Escape") area.blur();
  });
  showView();
  return box;
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
  updateWorldClocks(now);
  updateTimers();
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
/* 写真                                                                 */
/* ================================================================== */

/** ウィジェットごとに表示中の写真の番号（保存しない表示状態） */
const photoIndexes = new Map();
const widgetTimers = [];

function stopWidgetTimers() {
  while (widgetTimers.length) clearInterval(widgetTimers.pop());
}

function renderPhoto(widget) {
  const photos = widget.photos;

  // 編集モード：写真の一覧（並べ替え・キャプション・削除）
  if (editing) {
    const list = h("ul", { class: "photo-thumbs", dataset: { widgetId: widget.id } },
      ...photos.map((ph) => h("li", { class: "photo-thumb", dataset: { id: ph.id } },
        h("img", { class: "photo-thumb__img", src: ph.url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
        h("span", { class: "photo-thumb__tools" },
          h("button", {
            type: "button",
            class: "button button--small",
            title: "キャプションを編集",
            "aria-label": "キャプションを編集",
            onclick: async () => {
              const caption = await askText({ title: "キャプション", label: "写真の説明（空欄で消す）", value: ph.caption, allowEmpty: true });
              if (caption === null) return;
              ph.caption = caption;
              commit();
            },
          }, "✎"),
          h("button", {
            type: "button",
            class: "button button--small button--danger",
            title: "この写真を外す",
            "aria-label": "この写真を外す",
            onclick: () => {
              widget.photos = widget.photos.filter((x) => x.id !== ph.id);
              commit();
            },
          }, "×"),
        ),
      )),
    );
    return h("div", { class: "photo-edit" },
      list,
      h("p", { class: "widget__empty" }, "見出しの「＋」で画像の URL を追加。ドラッグで順番を変えられます"));
  }

  if (photos.length === 0) {
    return h("p", { class: "widget__empty" },
      "写真がありません。「編集」→ 見出しの「＋」で画像の URL を追加するか、ほかのタブの画像をここにドラッグしてください");
  }

  let index = Math.min(photoIndexes.get(widget.id) || 0, photos.length - 1);
  const img = h("img", { class: "photo__img", alt: "", referrerpolicy: "no-referrer", decoding: "async" });
  const caption = h("span", { class: "photo__caption" });
  const error = h("span", { class: "photo__error", hidden: true }, "画像を読み込めませんでした");
  const dots = h("span", { class: "photo__dots", "aria-hidden": "true" },
    ...photos.map(() => h("span", { class: "photo__dot" })));
  const link = h("a", { class: "photo__link", target: "_blank", rel: "noopener noreferrer", title: "元の画像を開く" }, img);

  const show = (i) => {
    index = (i + photos.length) % photos.length;
    photoIndexes.set(widget.id, index);
    const ph = photos[index];
    error.hidden = true;
    img.hidden = false;
    img.src = ph.url;
    img.alt = ph.caption || `写真 ${index + 1}`;
    link.href = ph.url;
    caption.textContent = ph.caption;
    caption.hidden = !ph.caption;
    [...dots.children].forEach((d, n) => d.classList.toggle("is-active", n === index));
    // 次の写真を先に読み込んでおく
    if (photos.length > 1) new Image().src = photos[(index + 1) % photos.length].url;
  };
  img.addEventListener("error", () => { img.hidden = true; error.hidden = false; });

  const frame = h("div", {
    class: `photo photo--${widget.fit}`,
    role: "group",
    "aria-roledescription": "スライドショー",
    "aria-label": widget.title || "写真",
  }, link, error, caption);

  if (photos.length > 1) {
    frame.append(
      h("button", { type: "button", class: "photo__nav photo__nav--prev", "aria-label": "前の写真", onclick: () => show(index - 1) }, "‹"),
      h("button", { type: "button", class: "photo__nav photo__nav--next", "aria-label": "次の写真", onclick: () => show(index + 1) }, "›"),
      dots,
    );
    // 一定間隔で切り替え（マウスを乗せている間と、ページが隠れている間は止める）
    if (widget.interval > 0) {
      let hovering = false;
      frame.addEventListener("mouseenter", () => { hovering = true; });
      frame.addEventListener("mouseleave", () => { hovering = false; });
      widgetTimers.push(setInterval(() => {
        if (!hovering && !document.hidden && frame.isConnected) show(index + 1);
      }, widget.interval * 1000));
    }
  }
  show(index);
  return frame;
}

async function addPhotoByUrl(widget) {
  const value = await askText({
    title: "写真を追加",
    label: "画像の URL（Google ドライブ・Dropbox の共有リンクも可）",
    value: "",
  });
  if (!value) return;
  const url = toImageUrl(value);
  if (!url) {
    showToast("http:// か https:// で始まる URL を入力してください");
    return;
  }
  addPhoto(widget, url);
}

function addPhoto(widget, url) {
  if (widget.photos.some((ph) => ph.url === url)) {
    showToast("この写真はすでに追加されています");
    return false;
  }
  widget.photos.push({ id: uid(), url, caption: "" });
  photoIndexes.set(widget.id, widget.photos.length - 1); // 追加した写真を表示
  commit();
  return true;
}

/** ドロップされたデータから画像の URL を取り出す（<img src> を優先） */
function readDroppedImage(dataTransfer) {
  const html = dataTransfer.getData("text/html");
  if (html) {
    const img = new DOMParser().parseFromString(html, "text/html").querySelector("img[src]");
    const src = img && toImageUrl(img.getAttribute("src"));
    if (src) return src;
  }
  const link = readDroppedLink(dataTransfer);
  return link ? toImageUrl(link.url) : null;
}

/* ================================================================== */
/* Google カレンダー・Gmail                                              */
/* ================================================================== */

/** 取得した予定・件数の一時的な控え（保存しない）。widgetId → { key, data, error, fetchedAt, loading } */
const googleCache = new Map();
const GOOGLE_REFRESH_MS = 10 * 60 * 1000;
let currentEmail = "";

function scopesFor(type) {
  return type === "calendar" ? [CALENDAR_SCOPE] : [GMAIL_SCOPE];
}

/** カレンダー・メールのウィジェットの中身を、それぞれ描き直す（読み込み直しの判定も行う） */
function refreshGoogleWidgets() {
  for (const widget of widgets()) {
    if (REMOTE_WIDGETS.includes(widget.type)) refreshWidgetBody(widget);
  }
}

function refreshWidgetBody(widget) {
  const body = el.dashboard.querySelector(`.widget[data-id="${CSS.escape(widget.id)}"] .widget__body`);
  if (!body) return;
  const content = renderWidgetBody(widget);
  body.replaceChildren(...(content ? [content] : []));
}

/**
 * 共通の流れ：未ログイン → 説明 / 連携前・期限切れ → 「連携」ボタン / 連携済み → 読み込んで表示
 */
function renderGoogleWidget(widget, { cacheKey, load, view }) {
  const scopes = scopesFor(widget.type);
  if (!storage.canUseGoogleApi()) {
    return h("p", { class: "widget__empty" },
      "Firebase を設定してログインすると使えます（README の「カレンダーとメールのウィジェット」を参照）");
  }
  const token = storage.getGoogleToken(scopes);
  const entry = googleCache.get(widget.id);
  if (!token) {
    const expiredBefore = entry?.data;
    return h("div", { class: "google-connect" },
      h("p", { class: "widget__empty" }, expiredBefore
        ? "Google との連携の有効期限（約 1 時間）が切れました。"
        : widget.type === "calendar"
          ? "Google カレンダーの予定を表示するには、読み取りの許可が必要です。"
          : "Gmail の未読件数を表示するには、ラベルと件数の読み取りの許可が必要です（メールの本文や件名は読みません）。"),
      h("button", {
        type: "button",
        class: "button button--primary",
        onclick: async () => {
          try {
            const got = await storage.connectGoogle(scopes);
            if (!got) return;
            googleCache.delete(widget.id);
            refreshGoogleWidgets();
          } catch (err) {
            showToast(err.message);
          }
        },
      }, expiredBefore ? "連携し直す" : "Google と連携"),
    );
  }

  return renderRemote(widget, {
    cacheKey,
    load: () => load(token),
    view,
    refreshMs: GOOGLE_REFRESH_MS,
    onError: (err) => { if (err.expired) storage.forgetGoogleToken(); },
  });
}

/**
 * 外部から読み込んで表示するウィジェットの共通部分（カレンダー・Gmail・天気・GitHub）。
 * 読み込んだ結果は googleCache に控え、refreshMs ごとに読み込み直す。
 */
function renderRemote(widget, { cacheKey, load, view, refreshMs, onError }) {
  const entry = googleCache.get(widget.id);
  const stale = !entry || entry.key !== cacheKey || Date.now() - entry.fetchedAt > refreshMs;
  if (stale && !entry?.loading) loadRemote(widget, cacheKey, load, onError);
  const current = googleCache.get(widget.id);

  const updated = current?.fetchedAt
    ? new Date(current.fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : "";
  const toolbar = h("div", { class: "google-toolbar" },
    h("span", { class: "google-toolbar__time" },
      current?.loading ? "読み込み中…" : updated ? `${updated} 更新` : ""),
    h("button", {
      type: "button",
      class: "button button--small button--ghost",
      title: "最新の情報を読み込む",
      "aria-label": "最新の情報を読み込む",
      disabled: current?.loading,
      onclick: () => {
        const e = googleCache.get(widget.id);
        if (e) e.fetchedAt = 0;
        refreshWidgetBody(widget);
      },
    }, "↻"),
  );

  let content;
  if (current?.data !== undefined && current?.key === cacheKey) content = view(current.data);
  else if (current?.error) content = null;
  else content = h("p", { class: "widget__empty" }, "読み込み中…");

  return h("div", { class: "google-widget" },
    toolbar,
    current?.error ? h("p", { class: "google-error" }, current.error) : null,
    content,
  );
}

async function loadRemote(widget, key, load, onError) {
  const entry = { ...(googleCache.get(widget.id) || {}), key, loading: true };
  googleCache.set(widget.id, entry);
  try {
    entry.data = await load();
    entry.error = null;
  } catch (err) {
    entry.error = err.message;
    onError?.(err);
  }
  entry.fetchedAt = Date.now();
  entry.loading = false;
  refreshWidgetBody(widget);
}

function renderCalendar(widget) {
  return renderGoogleWidget(widget, {
    cacheKey: `${widget.days}:${widget.allCalendars}`,
    load: (token) => fetchCalendarEvents(token, { days: widget.days, allCalendars: widget.allCalendars }),
    view: (events) => renderCalendarEvents(widget, events),
  });
}

function renderCalendarEvents(widget, events) {
  if (events.length === 0) {
    return h("p", { class: "widget__empty" },
      widget.days === 1 ? "今日はこの先の予定はありません" : `${widget.days} 日以内の予定はありません`);
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const groups = new Map();
  for (const ev of events) {
    const start = ev.start < today ? today : ev.start; // 前日から続く予定は今日に表示
    const key = dayKey(start);
    if (!groups.has(key)) groups.set(key, { date: new Date(start.getFullYear(), start.getMonth(), start.getDate()), items: [] });
    groups.get(key).items.push(ev);
  }
  const time = (d) => d.toLocaleTimeString("ja-JP", { hour: "numeric", minute: "2-digit" });
  const label = (d) => {
    const diff = Math.round((d - today) / 86400000);
    const date = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    return diff === 0 ? `今日 ${date}` : diff === 1 ? `明日 ${date}` : date;
  };

  return h("div", { class: "cal" },
    ...[...groups.values()].map((g) => h("section", { class: "cal-day" },
      h("h3", { class: "cal-day__label" }, label(g.date)),
      h("ul", { class: "cal-events" },
        ...g.items.map((ev) => {
          const ongoing = !ev.allDay && ev.start <= now && now < ev.end;
          const item = h("a", {
            class: "cal-event__link",
            href: ev.link || null,
            target: "_blank",
            rel: "noopener noreferrer",
            title: [ev.title, ev.location, ev.calendar].filter(Boolean).join("\n"),
          },
            h("span", { class: "cal-event__time" }, ev.allDay ? "終日" : `${time(ev.start)}–${time(ev.end)}`),
            h("span", { class: "cal-event__dot", "aria-hidden": "true" }),
            h("span", { class: "cal-event__title" }, ev.title),
          );
          if (ev.color) item.style.setProperty("--event-color", ev.color);
          return h("li", { class: `cal-event${ongoing ? " is-now" : ""}${ev.allDay ? " is-all-day" : ""}` },
            item,
            ev.meet ? h("a", {
              class: "button button--small cal-event__meet",
              href: ev.meet,
              target: "_blank",
              rel: "noopener noreferrer",
              title: "Google Meet に参加",
            }, "Meet") : null,
          );
        }),
      ),
    )),
  );
}

function renderMail(widget) {
  const label = MAIL_LABELS[widget.label] || MAIL_LABELS.INBOX;
  return renderGoogleWidget(widget, {
    cacheKey: widget.label,
    load: (token) => fetchGmailUnread(token, widget.label),
    view: (data) => h("a", {
      class: "mail",
      href: `https://mail.google.com/mail/?authuser=${encodeURIComponent(currentEmail)}#${label.hash}`,
      target: "_blank",
      rel: "noopener noreferrer",
      title: "Gmail を開く",
    },
      h("span", { class: "mail__count" }, String(data.unreadMessages)),
      h("span", { class: "mail__label" }, `${label.name}の未読`),
      h("span", { class: "mail__open" }, "Gmail を開く ↗"),
    ),
  });
}

/* ================================================================== */
/* 天気                                                                 */
/* ================================================================== */

const WEATHER_REFRESH_MS = 30 * 60 * 1000;

function renderWeather(widget) {
  if (!widget.place && widget.lat == null) {
    return h("p", { class: "widget__empty" }, "「編集」→ ✎ で地域を設定してください（例：東京、大阪市、札幌）");
  }
  return renderRemote(widget, {
    // 地名で調べた緯度・経度は読み込みの途中で決まるので、キーには含めない（「現在地」のときだけ含める）
    cacheKey: widget.place === "現在地" ? `here:${widget.lat},${widget.lon}` : `place:${widget.place}`,
    refreshMs: WEATHER_REFRESH_MS,
    load: async () => {
      // 地名だけ設定されていて、緯度・経度がまだなら調べて控える
      if (widget.lat == null || widget.geocodedPlace !== widget.place) {
        const found = await geocode(widget.place);
        Object.assign(widget, { lat: found.lat, lon: found.lon, placeLabel: found.label, geocodedPlace: widget.place });
        scheduleSave();
      }
      return fetchWeather(widget.lat, widget.lon);
    },
    view: (data) => renderWeatherView(widget, data),
  });
}

function renderWeatherView(widget, { current, daily }) {
  const now = describeWeather(current.code);
  const icon = !current.isDay && now.icon === "☀️" ? "🌙" : now.icon;
  const round = (n) => (n == null ? "–" : Math.round(n));
  const weekday = (date, i) => i === 0 ? "今日" : i === 1 ? "明日"
    : new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", { weekday: "short" });
  return h("div", { class: "weather" },
    h("div", { class: "weather__now" },
      h("span", { class: "weather__icon", "aria-hidden": "true" }, icon),
      h("span", { class: "weather__temp" }, `${round(current.temp)}°`),
      h("span", { class: "weather__detail" },
        h("span", { class: "weather__place" }, widget.placeLabel || widget.place || "現在地"),
        h("span", {}, `${now.text}　最高 ${round(daily[0]?.max)}° / 最低 ${round(daily[0]?.min)}°`),
        h("span", { class: "weather__sub" },
          `体感 ${round(current.feels)}°・湿度 ${round(current.humidity)}%・風 ${round(current.wind)}m/s・降水 ${round(daily[0]?.rain)}%`),
      ),
    ),
    h("ol", { class: "weather__days" },
      ...daily.slice(1).map((d, i) => {
        const w = describeWeather(d.code);
        return h("li", { class: "weather__day", title: w.text },
          h("span", { class: "weather__day-name" }, weekday(d.date, i + 1)),
          h("span", { class: "weather__day-icon", "aria-label": w.text }, w.icon),
          h("span", { class: "weather__day-temp" }, `${round(d.max)}° / ${round(d.min)}°`),
          h("span", { class: "weather__day-rain" }, `☂ ${round(d.rain)}%`),
        );
      }),
    ),
  );
}

/* ================================================================== */
/* タイマー・ポモドーロ                                                  */
/* ================================================================== */

/*
 * 動いているタイマーの状態は、この端末の localStorage にだけ保存する（ほかの端末とは共有しない）。
 * 終了時刻（endAt）で持つので、再読み込みしても続きから数える。
 */
const TIMER_PHASES = { work: "作業", short: "休憩", long: "長い休憩", timer: "タイマー" };

function timerKey(widget) {
  return `personal-dashboard:timer:${widget.id}`;
}

function phaseMinutes(widget, phase) {
  if (phase === "work") return widget.work;
  if (phase === "short") return widget.short;
  if (phase === "long") return widget.long;
  return widget.minutes;
}

function readTimer(widget) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(timerKey(widget)) || "null"); } catch { /* 使えない環境 */ }
  const firstPhase = widget.mode === "pomodoro" ? "work" : "timer";
  const valid = saved && TIMER_PHASES[saved.phase] && (widget.mode === "pomodoro") === (saved.phase !== "timer");
  if (valid) return saved;
  return { phase: firstPhase, running: false, endAt: 0, remaining: phaseMinutes(widget, firstPhase) * 60000, count: 0 };
}

function writeTimer(widget, t) {
  try { localStorage.setItem(timerKey(widget), JSON.stringify(t)); } catch { /* 使えない環境 */ }
}

function timerRemaining(t) {
  return t.running ? Math.max(0, t.endAt - Date.now()) : t.remaining;
}

function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderTimer(widget) {
  const t = readTimer(widget);
  const running = t.running;
  const control = (label, aria, onclick, extra = "") => h("button", {
    type: "button", class: `button ${extra}`, "aria-label": aria, title: aria, onclick,
  }, label);

  const start = () => {
    requestNotificationPermission();
    const cur = readTimer(widget);
    writeTimer(widget, { ...cur, running: true, endAt: Date.now() + cur.remaining });
    refreshWidgetBody(widget);
  };
  const pause = () => {
    const cur = readTimer(widget);
    writeTimer(widget, { ...cur, running: false, remaining: timerRemaining(cur) });
    refreshWidgetBody(widget);
  };
  const reset = () => {
    const first = widget.mode === "pomodoro" ? "work" : "timer";
    writeTimer(widget, { phase: first, running: false, endAt: 0, remaining: phaseMinutes(widget, first) * 60000, count: 0 });
    refreshWidgetBody(widget);
  };
  const skip = () => finishTimer(widget, { silent: true });

  const total = phaseMinutes(widget, t.phase) * 60000;
  return h("div", { class: `timer timer--${t.phase}${running ? " is-running" : ""}`, dataset: { widgetId: widget.id } },
    h("div", { class: "timer__head" },
      h("span", { class: "timer__phase" }, TIMER_PHASES[t.phase]),
      widget.mode === "pomodoro" ? h("span", { class: "timer__count", title: "完了した作業の回数" },
        ...Array.from({ length: widget.longEvery }, (_, i) =>
          h("span", { class: `timer__dot${i < t.count % widget.longEvery ? " is-done" : ""}` })),
        h("span", { class: "timer__count-total" }, ` ${t.count} 回`)) : null,
    ),
    h("span", { class: "timer__time", "aria-live": "off" }, formatDuration(timerRemaining(t))),
    h("span", { class: "timer__bar", "aria-hidden": "true" },
      h("span", { class: "timer__bar-fill", style: { width: `${100 - (timerRemaining(t) / total) * 100}%` } })),
    h("div", { class: "timer__controls" },
      running
        ? control("⏸ 一時停止", "一時停止", pause, "button--primary")
        : control("▶ 開始", "開始", start, "button--primary"),
      control("↺", "リセット", reset),
      widget.mode === "pomodoro" ? control("⏭", "次へ進む", skip) : null,
    ),
  );
}

/** 1 秒ごと：残り時間を表示し、終わったタイマーを片付ける */
function updateTimers() {
  if (!state) return;
  for (const node of $$(".timer[data-widget-id]", el.dashboard)) {
    const widget = widgets().find((w) => w.id === node.dataset.widgetId);
    if (!widget) continue;
    const t = readTimer(widget);
    const left = timerRemaining(t);
    $(".timer__time", node).textContent = formatDuration(left);
    const total = phaseMinutes(widget, t.phase) * 60000;
    $(".timer__bar-fill", node).style.width = `${100 - (left / total) * 100}%`;
    if (t.running && left <= 0) finishTimer(widget);
  }
}

function finishTimer(widget, { silent = false } = {}) {
  const t = readTimer(widget);
  const name = widget.title || "タイマー";
  if (widget.mode !== "pomodoro") {
    writeTimer(widget, { ...t, running: false, endAt: 0, remaining: widget.minutes * 60000 });
    if (!silent) notifyDone(`${name}：${widget.minutes} 分が経ちました`, widget);
    refreshWidgetBody(widget);
    return;
  }
  let { phase, count } = t;
  if (phase === "work") {
    count += silent ? 0 : 1;
    phase = count > 0 && count % widget.longEvery === 0 && !silent ? "long" : "short";
  } else {
    phase = "work";
  }
  const next = phaseMinutes(widget, phase) * 60000;
  const autoStart = widget.autoNext && !silent;
  writeTimer(widget, { phase, count, running: autoStart, endAt: autoStart ? Date.now() + next : 0, remaining: next });
  if (!silent) {
    notifyDone(phase === "work"
      ? `${name}：休憩おわり。次の作業（${widget.work} 分）を始めましょう`
      : `${name}：作業おわり。${TIMER_PHASES[phase]}（${phaseMinutes(widget, phase)} 分）にしましょう`, widget);
  }
  refreshWidgetBody(widget);
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyDone(message, widget) {
  showToast(`⏰ ${message}`);
  if (widget.sound !== false) playChime();
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    try { new Notification("ダッシュボード", { body: message, tag: `timer-${widget.id}` }); } catch { /* 使えない環境 */ }
  }
}

/** 終了の合図の音（3 回鳴らす） */
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.32);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* 音が出せない環境 */ }
}

/* ================================================================== */
/* 世界時計                                                              */
/* ================================================================== */

const DEFAULT_WORLD_ZONES = [
  { label: "東京", tz: "Asia/Tokyo" },
  { label: "ロンドン", tz: "Europe/London" },
  { label: "ニューヨーク", tz: "America/New_York" },
];

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("ja-JP", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** 「表示名=タイムゾーン」の行を読み取る */
function parseWorldZones(text) {
  const zones = [];
  const invalid = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [left, right] = trimmed.includes("=") ? trimmed.split("=", 2) : [trimmed, trimmed];
    const tz = right.trim();
    const label = left.trim() || tz.split("/").pop().replace(/_/g, " ");
    if (isValidTimeZone(tz)) zones.push({ id: uid(), label, tz });
    else invalid.push(trimmed);
  }
  return { zones, invalid };
}

function renderWorldClock(widget) {
  if (widget.zones.length === 0) {
    return h("p", { class: "widget__empty" }, "「編集」→ ✎ で表示する都市を設定してください");
  }
  return h("ul", { class: "wclock" },
    ...widget.zones.map((z) => h("li", { class: "wclock__row", dataset: { tz: z.tz } },
      h("span", { class: "wclock__icon", "aria-hidden": "true" }),
      h("span", { class: "wclock__label" }, z.label),
      h("span", { class: "wclock__time" }),
      h("span", { class: "wclock__diff" }),
    )),
  );
}

function zonedParts(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute };
}

function updateWorldClocks(now) {
  const rows = $$(".wclock__row", el.dashboard);
  if (rows.length === 0) return;
  const local = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(), h: now.getHours(), mi: now.getMinutes() };
  const minutesOf = (p) => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) / 60000;
  for (const row of rows) {
    const tz = row.dataset.tz;
    let p;
    try { p = zonedParts(now, tz); } catch { continue; }
    $(".wclock__time", row).textContent = `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
    $(".wclock__icon", row).textContent = p.h >= 6 && p.h < 18 ? "☀️" : "🌙";
    const diffMin = minutesOf(p) - minutesOf(local);
    const dayDiff = Date.UTC(p.y, p.mo - 1, p.d) / 86400000 - Date.UTC(local.y, local.mo - 1, local.d) / 86400000;
    const hours = diffMin / 60;
    const sign = hours > 0 ? "+" : hours < 0 ? "−" : "±";
    const abs = Math.abs(hours);
    const offset = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1);
    const day = dayDiff === 0 ? "今日" : dayDiff > 0 ? "明日" : "昨日";
    $(".wclock__diff", row).textContent = `${day} ${sign}${offset}時間`;
  }
}

/* ================================================================== */
/* 習慣トラッカー                                                        */
/* ================================================================== */

const HABIT_DAYS = [7, 14];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 今日（記録がまだなら昨日）から、続けて記録した日数 */
function habitStreak(done) {
  const day = new Date();
  if (!done.has(dateKey(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (done.has(dateKey(day))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function renderHabit(widget) {
  if (widget.habits.length === 0) {
    return h("p", { class: "widget__empty" },
      editing ? "見出しの「＋」で習慣を追加してください（例：運動、読書、日記）" : "習慣がありません。「編集」→ 見出しの「＋」で追加できます");
  }
  const today = new Date();
  const days = Array.from({ length: widget.days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (widget.days - 1 - i));
    return d;
  });
  const head = h("tr", {},
    h("th", { class: "habit__name-head", scope: "col" }, ""),
    ...days.map((d, i) => h("th", { scope: "col", class: i === days.length - 1 ? "is-today" : "" },
      h("span", { class: "habit__dow" }, d.toLocaleDateString("ja-JP", { weekday: "narrow" })),
      h("span", { class: "habit__date" }, String(d.getDate())))),
    h("th", { scope: "col", class: "habit__streak-head", title: "連続日数" }, "連続"),
  );
  const rows = widget.habits.map((habit) => {
    const done = new Set(widget.log[habit.id] || []);
    return h("tr", { dataset: { id: habit.id } },
      h("th", { scope: "row", class: "habit__name" },
        h("span", { class: "habit__name-text" }, habit.name),
        h("span", { class: "habit__tools" },
          h("button", {
            type: "button", class: "button button--small button--ghost", "aria-label": `「${habit.name}」の名前を変える`, title: "名前を変える",
            onclick: async () => {
              const name = await askText({ title: "習慣の名前を変える", label: "習慣", value: habit.name });
              if (!name) return;
              habit.name = name;
              commit();
            },
          }, "✎"),
          h("button", {
            type: "button", class: "button button--small button--ghost button--danger", "aria-label": `「${habit.name}」を削除`, title: "削除",
            onclick: () => {
              if (!confirm(`習慣「${habit.name}」と、その記録を削除しますか？`)) return;
              widget.habits = widget.habits.filter((x) => x.id !== habit.id);
              delete widget.log[habit.id];
              commit();
            },
          }, "×"),
        ),
      ),
      ...days.map((d, i) => {
        const key = dateKey(d);
        const on = done.has(key);
        return h("td", { class: i === days.length - 1 ? "is-today" : "" },
          h("button", {
            type: "button",
            class: `habit__cell${on ? " is-done" : ""}`,
            "aria-pressed": String(on),
            "aria-label": `${habit.name}：${d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}`,
            onclick: () => {
              const set = new Set(widget.log[habit.id] || []);
              if (set.has(key)) set.delete(key);
              else set.add(key);
              widget.log[habit.id] = pruneHabitLog([...set]);
              commit();
            },
          }, on ? "✓" : ""),
        );
      }),
      h("td", { class: "habit__streak" }, (() => {
        const s = habitStreak(done);
        return s > 0 ? `🔥${s}` : "–";
      })()),
    );
  });
  return h("div", { class: "habit" },
    h("table", { class: "habit__table" }, h("thead", {}, head), h("tbody", {}, ...rows)));
}

/** 記録は 1 年分だけ残す（データが大きくなりすぎないように） */
function pruneHabitLog(keys) {
  const limit = new Date();
  limit.setDate(limit.getDate() - 400);
  const min = dateKey(limit);
  return keys.filter((k) => k >= min).sort();
}

async function addHabit(widget) {
  const name = await askText({ title: "習慣を追加", label: "習慣（例：運動 30 分、読書、日記）", value: "" });
  if (!name) return;
  widget.habits.push({ id: uid(), name });
  commit();
}

/* ================================================================== */
/* GitHub                                                               */
/* ================================================================== */

const GITHUB_TOKEN_KEY = "personal-dashboard:github-token";
const GITHUB_REFRESH_MS = 5 * 60 * 1000;

function getGitHubToken() {
  try { return localStorage.getItem(GITHUB_TOKEN_KEY) || ""; } catch { return ""; }
}

function setGitHubToken(token) {
  try {
    if (token) localStorage.setItem(GITHUB_TOKEN_KEY, token);
    else localStorage.removeItem(GITHUB_TOKEN_KEY);
  } catch { /* 使えない環境 */ }
  // GitHub のウィジェットだけ読み込み直す（天気などの控えは残す）
  for (const w of widgets()) if (w.type === "github") googleCache.delete(w.id);
}

async function askGitHubToken() {
  const token = await askText({
    title: "GitHub のトークンを設定",
    label: "個人用アクセストークン（この端末のブラウザにだけ保存し、サーバーには送りません）",
    value: "",
  });
  if (!token) return;
  setGitHubToken(token);
  refreshRemoteWidgets();
}

function refreshRemoteWidgets() {
  for (const widget of widgets()) {
    if (REMOTE_WIDGETS.includes(widget.type)) refreshWidgetBody(widget);
  }
}

function renderGitHub(widget) {
  const token = getGitHubToken();
  if (!token) {
    return h("div", { class: "google-connect" },
      h("p", { class: "widget__empty" },
        "GitHub の個人用アクセストークンを、この端末に設定すると表示できます（README の「GitHub」を参照）。"),
      h("button", { type: "button", class: "button button--primary", onclick: askGitHubToken }, "トークンを設定"),
    );
  }
  if (widget.lists.length === 0) {
    return h("p", { class: "widget__empty" }, "「編集」→ ✎ で表示する一覧を選んでください");
  }
  return renderRemote(widget, {
    cacheKey: `${widget.lists.join(",")}:${widget.limit}:${token.length}`,
    refreshMs: GITHUB_REFRESH_MS,
    load: () => fetchGitHub(token, widget.lists, widget.limit),
    onError: (err) => {
      if (err.unauthorized) {
        setGitHubToken("");
        showToast(err.message);
      }
    },
    view: (data) => renderGitHubLists(data),
  });
}

function relativeTime(date) {
  if (!date) return "";
  const min = Math.round((Date.now() - date) / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分前`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} 日前` : date.toLocaleDateString("ja-JP");
}

function renderGitHubLists({ lists }) {
  return h("div", { class: "gh" },
    ...lists.map((list) => h("section", { class: "gh-list" },
      h("h3", { class: "gh-list__label" }, list.label, h("span", { class: "gh-list__count" }, String(list.total))),
      list.items.length === 0
        ? h("p", { class: "gh-list__empty" }, "ありません")
        : h("ul", { class: "gh-items" },
          ...list.items.map((it) => h("li", { class: "gh-item" },
            h("a", { class: "gh-item__link", href: it.url, target: "_blank", rel: "noopener noreferrer", title: it.title },
              h("span", { class: "gh-item__title" }, it.draft ? `[Draft] ${it.title}` : it.title),
              h("span", { class: "gh-item__meta" }, `${it.repo} #${it.number}・${relativeTime(it.updated)}`),
            ),
          ))),
    )),
  );
}

/* ================================================================== */
/* ウィジェットの設定欄（種類ごと）                                        */
/* ================================================================== */

/*
 * normalize：読み込んだデータの補正 / init：新しく作るときの初期値
 * fill：編集ダイアログに今の値を入れる（widget が null なら初期値）/ save：ダイアログの値を保存
 */
const WIDGET_FORMS = {
  weather: {
    normalize: (w) => {
      w.place = typeof w.place === "string" ? w.place : "";
      if (typeof w.lat !== "number" || typeof w.lon !== "number") { delete w.lat; delete w.lon; }
    },
    fill: (f, w) => {
      f.weatherPlace.value = w?.place || "";
      f.weatherLat.value = w?.lat ?? "";
      f.weatherLon.value = w?.lon ?? "";
    },
    save: (f, w) => {
      const place = f.weatherPlace.value.trim();
      const lat = Number(f.weatherLat.value);
      const lon = Number(f.weatherLon.value);
      if (f.weatherLat.value !== "" && Number.isFinite(lat) && Number.isFinite(lon)) {
        // 「現在地を使う」で緯度・経度が入っている
        Object.assign(w, { place: place || "現在地", lat, lon, placeLabel: place || "現在地", geocodedPlace: place || "現在地" });
      } else if (place !== w.place) {
        Object.assign(w, { place });
        delete w.lat; delete w.lon; delete w.placeLabel; delete w.geocodedPlace;
      }
    },
  },
  timer: {
    normalize: (w) => {
      const num = (v, d, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || d));
      w.mode = w.mode === "timer" ? "timer" : "pomodoro";
      w.work = num(w.work, 25, 1, 180);
      w.short = num(w.short, 5, 1, 60);
      w.long = num(w.long, 15, 1, 120);
      w.longEvery = num(w.longEvery, 4, 2, 8);
      w.minutes = num(w.minutes, 10, 1, 600);
      w.autoNext = Boolean(w.autoNext);
      w.sound = w.sound !== false;
    },
    fill: (f, w) => {
      f.timerMode.value = w?.mode || "pomodoro";
      f.timerWork.value = w?.work ?? 25;
      f.timerShort.value = w?.short ?? 5;
      f.timerLong.value = w?.long ?? 15;
      f.timerLongEvery.value = w?.longEvery ?? 4;
      f.timerMinutes.value = w?.minutes ?? 10;
      f.timerAutoNext.checked = Boolean(w?.autoNext);
      f.timerSound.checked = w?.sound !== false;
    },
    save: (f, w) => {
      const before = JSON.stringify([w.mode, w.work, w.short, w.long, w.minutes]);
      Object.assign(w, {
        mode: f.timerMode.value,
        work: f.timerWork.value,
        short: f.timerShort.value,
        long: f.timerLong.value,
        longEvery: f.timerLongEvery.value,
        minutes: f.timerMinutes.value,
        autoNext: f.timerAutoNext.checked,
        sound: f.timerSound.checked,
      });
      WIDGET_FORMS.timer.normalize(w);
      // 時間の設定を変えたら、止まっているタイマーは新しい時間で始め直す
      if (before !== JSON.stringify([w.mode, w.work, w.short, w.long, w.minutes]) && !readTimer(w).running) {
        try { localStorage.removeItem(timerKey(w)); } catch { /* 使えない環境 */ }
      }
    },
  },
  worldclock: {
    init: (w) => { w.zones = DEFAULT_WORLD_ZONES.map((z) => ({ id: uid(), ...z })); },
    normalize: (w) => {
      w.zones = (Array.isArray(w.zones) ? w.zones : [])
        .filter((z) => z && typeof z.tz === "string" && isValidTimeZone(z.tz))
        .map((z) => ({ id: z.id ? String(z.id) : uid(), label: typeof z.label === "string" ? z.label : z.tz, tz: z.tz }));
    },
    fill: (f, w) => {
      const zones = w ? w.zones : DEFAULT_WORLD_ZONES;
      f.worldZones.value = zones.map((z) => `${z.label}=${z.tz}`).join("\n");
    },
    save: (f, w) => {
      const { zones, invalid } = parseWorldZones(f.worldZones.value);
      w.zones = zones;
      if (invalid.length) showToast(`読み取れなかった行があります：${invalid.join("、")}`);
    },
  },
  habit: {
    init: (w) => { w.habits = []; w.log = {}; },
    normalize: (w) => {
      w.habits = (Array.isArray(w.habits) ? w.habits : [])
        .filter((x) => x && typeof x.name === "string")
        .map((x) => ({ id: x.id ? String(x.id) : uid(), name: x.name }));
      const log = w.log && typeof w.log === "object" ? w.log : {};
      w.log = {};
      for (const habit of w.habits) {
        const keys = Array.isArray(log[habit.id]) ? log[habit.id].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
        if (keys.length) w.log[habit.id] = pruneHabitLog(keys);
      }
      w.days = HABIT_DAYS.includes(Number(w.days)) ? Number(w.days) : 7;
    },
    fill: (f, w) => { f.habitDays.value = String(w?.days || 7); },
    save: (f, w) => { w.days = HABIT_DAYS.includes(Number(f.habitDays.value)) ? Number(f.habitDays.value) : 7; },
  },
  github: {
    normalize: (w) => {
      w.lists = (Array.isArray(w.lists) ? w.lists : ["review", "mine", "assigned"]).filter((k) => GITHUB_LISTS[k]);
      w.limit = [5, 10, 20].includes(Number(w.limit)) ? Number(w.limit) : 5;
    },
    fill: (f, w) => {
      const lists = w ? w.lists : ["review", "mine", "assigned"];
      for (const box of f.githubLists) box.checked = lists.includes(box.value);
      f.githubLimit.value = String(w?.limit || 5);
      $("#github-token-state").textContent = getGitHubToken()
        ? "この端末にはトークンが設定されています。"
        : "この端末にはトークンが設定されていません（ウィジェットの「トークンを設定」から設定します）。";
      $("#github-token-clear").hidden = !getGitHubToken();
    },
    save: (f, w) => {
      w.lists = [...f.githubLists].filter((b) => b.checked).map((b) => b.value);
      w.limit = [5, 10, 20].includes(Number(f.githubLimit.value)) ? Number(f.githubLimit.value) : 5;
    },
  },
};

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

/**
 * @returns {Promise<string|null>} 入力された文字。キャンセルなら null。
 *   allowEmpty が true なら空欄で保存でき、そのときは ""。
 */
function askText({ title, label, value, allowEmpty = false }) {
  const input = el.textForm.elements.text;
  $("#text-dialog-title").textContent = title;
  $("#text-dialog-label").textContent = label;
  input.value = value || "";
  input.required = !allowEmpty;
  el.textDialog.returnValue = "";
  el.textDialog.showModal();
  input.select();
  return new Promise((resolve) => {
    el.textDialog.addEventListener("close", () => {
      if (el.textDialog.returnValue !== "ok") return resolve(null);
      const text = input.value.trim();
      resolve(text || (allowEmpty ? "" : null));
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
  const target = event.target.closest?.(".widget--links, .widget--embed, .widget--photo") || null;
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
  const target = event.target.closest?.(".widget--links, .widget--embed, .widget--photo");
  const widget = target && widgets().find((w) => w.id === target.dataset.id);
  if (!widget) return;

  // 写真ウィジェット：ドロップされた画像を追加する
  if (widget.type === "photo") {
    const src = readDroppedImage(event.dataTransfer);
    if (!src) {
      showToast("画像の URL を読み取れませんでした");
      return;
    }
    if (addPhoto(widget, src)) showToast(`「${widget.title || "写真"}」に写真を追加しました`);
    return;
  }

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

  // 写真の並べ替え
  for (const thumbs of $$(".photo-thumbs", el.dashboard)) {
    const widget = widgets().find((w) => w.id === thumbs.dataset.widgetId);
    if (!widget) continue;
    sortables.push(new Sortable(thumbs, {
      ...common,
      draggable: ".photo-thumb",
      filter: "button",
      preventOnFilter: false,
      onEnd: () => {
        const order = $$(".photo-thumb", thumbs).map((n) => n.dataset.id);
        widget.photos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
  f.photoFit.value = widget?.fit || "cover";
  f.noteMarkdown.checked = widget?.markdown !== false;
  f.calendarDays.value = String(widget?.days || 3);
  f.allCalendars.checked = widget?.allCalendars !== false;
  f.mailLabel.value = widget?.label || "INBOX";
  f.photoInterval.value = String(widget?.interval ?? 10);
  // 追加したウィジェットの種類ごとの設定欄（WIDGET_FORMS）
  for (const [type, form] of Object.entries(WIDGET_FORMS)) form.fill(f, widget?.type === type ? widget : null);
  el.widgetDelete.hidden = !widget;
  updateWidgetFormVisibility();
  updateSizeOptions();
  el.widgetDialog.returnValue = "";
  el.widgetDialog.showModal();
}

/** 種類に合わせて、最小サイズより小さい幅・高さを選べないようにする */
function updateSizeOptions() {
  const f = el.widgetForm.elements;
  const min = minSizeOf(f.type.value);
  for (const option of f.size.options) option.disabled = SIZES.indexOf(option.value) < SIZES.indexOf(min.size);
  for (const option of f.rows.options) option.disabled = Number(option.value) < min.rows;
  f.size.value = clampSize(f.size.value, f.type.value);
  if (Number(f.rows.value) < min.rows) f.rows.value = String(min.rows);
  const hint = $("#size-hint");
  const isMin = min.size !== "s" || min.rows > 1;
  hint.hidden = !isMin;
  hint.textContent = isMin ? `この種類の最小サイズ：幅 ${SIZE_NAMES[min.size]}・高さ ${min.rows} 段` : "";
}

el.widgetForm.elements.accent.addEventListener("input", () => {
  el.widgetForm.elements.useAccent.checked = true;
});

// タイマー：選んだ種類に関係する時間の欄だけ見せる
function updateTimerFields() {
  const mode = el.widgetForm.elements.timerMode.value;
  for (const label of $$("[data-timer-mode]", el.widgetForm)) label.hidden = label.dataset.timerMode !== mode;
}
el.widgetForm.elements.timerMode.addEventListener("change", updateTimerFields);
el.widgetForm.elements.type.addEventListener("change", updateTimerFields);
el.widgetDialog.addEventListener("toggle", updateTimerFields);

// 天気：ブラウザの位置情報で、現在地の緯度・経度を入れる
$("#weather-here").addEventListener("click", () => {
  const f = el.widgetForm.elements;
  if (!navigator.geolocation) {
    showToast("このブラウザでは現在地を使えません");
    return;
  }
  const button = $("#weather-here");
  button.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    f.weatherLat.value = pos.coords.latitude.toFixed(4);
    f.weatherLon.value = pos.coords.longitude.toFixed(4);
    f.weatherPlace.value = "現在地";
    button.disabled = false;
  }, () => {
    showToast("現在地を取得できませんでした。ブラウザで位置情報の利用を許可してください");
    button.disabled = false;
  }, { timeout: 10000, maximumAge: 600000 });
});
// 地名を書き換えたら、現在地の緯度・経度は使わない
el.widgetForm.elements.weatherPlace.addEventListener("input", () => {
  el.widgetForm.elements.weatherLat.value = "";
  el.widgetForm.elements.weatherLon.value = "";
});

// GitHub：この端末に保存したトークンを消す
$("#github-token-clear").addEventListener("click", () => {
  if (!confirm("この端末に保存した GitHub のトークンを削除しますか？")) return;
  setGitHubToken("");
  WIDGET_FORMS.github.fill(el.widgetForm.elements, widgets().find((w) => w.id === editingWidgetId) || null);
  refreshRemoteWidgets();
});

// 新しく追加するときは、種類を変えたら高さ（段数）もその種類の初期値にする
el.widgetForm.elements.type.addEventListener("change", () => {
  if (!editingWidgetId) {
    el.widgetForm.elements.rows.value = String(DEFAULT_ROWS[el.widgetForm.elements.type.value] || 2);
  }
  updateSizeOptions();
});

el.widgetDialog.addEventListener("close", () => {
  if (el.widgetDialog.returnValue !== "ok") return;
  const f = el.widgetForm.elements;
  let widget = widgets().find((w) => w.id === editingWidgetId);
  if (!widget) {
    widget = { id: uid(), type: f.type.value };
    if (widget.type === "links") widget.items = [];
    if (widget.type === "note") widget.text = "";
    if (widget.type === "photo") widget.photos = [];
    if (widget.type === "todo") {
      widget.categories = DEFAULT_TODO_CATEGORIES.map((name) => ({ id: uid(), name }));
      widget.items = [];
    }
    WIDGET_FORMS[widget.type]?.init?.(widget);
    widgets().push(widget);
  }
  widget.title = f.title.value.trim();
  widget.size = clampSize(f.size.value, widget.type);
  widget.rows = normalizeRows(f.rows.value, widget.type);
  WIDGET_FORMS[widget.type]?.save(f, widget);
  if (f.useAccent.checked && isHexColor(f.accent.value)) widget.accent = f.accent.value;
  else delete widget.accent;

  if (widget.type === "links") widget.view = f.view.value === "grid" ? "grid" : "list";
  if (widget.type === "search") widget.searchUrl = f.searchUrl.value.trim();
  if (widget.type === "embed") {
    widget.embedUrl = f.embedUrl.value.trim();
    widget.height = Number(f.height.value) || 400;
  }
  if (widget.type === "clock") widget.timeZone = f.timeZone.value.trim();
  if (widget.type === "note") widget.markdown = f.noteMarkdown.checked;
  if (widget.type === "calendar") {
    const days = Number(f.calendarDays.value);
    widget.days = CALENDAR_DAYS.includes(days) ? days : 3;
    widget.allCalendars = f.allCalendars.checked;
  }
  if (widget.type === "mail") widget.label = MAIL_LABELS[f.mailLabel.value] ? f.mailLabel.value : "INBOX";
  if (widget.type === "photo") {
    widget.fit = f.photoFit.value === "contain" ? "contain" : "cover";
    const interval = Number(f.photoInterval.value);
    widget.interval = PHOTO_INTERVALS.includes(interval) ? interval : 10;
  }

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
    : widget.type === "todo" && widget.items.length ? `（ToDo ${widget.items.length} 件も消えます）`
    : widget.type === "photo" && widget.photos.length ? `（登録した写真 ${widget.photos.length} 枚の URL も消えます）` : "";
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
  currentEmail = user?.email || "";
  googleCache.clear();
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
