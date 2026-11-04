/**
 * app.js — ダッシュボードの画面
 *
 * 状態（state）を 1 つの JSON で持ち、変更のたびに画面を描き直して保存します。
 * 並べ替えには SortableJS（public/vendor/Sortable.min.js）を使っています。
 *
 * データ形式（default-dashboard.json も同じ形）:
 * {
 *   "version": 1,
 *   "title": "Dashboard",
 *   "settings": { "mode": "auto", "preset": "", "openInNewTab": true, "useFavicons": true },
 *   "widgets": [
 *     { "id": "...", "type": "links", "title": "...", "size": "m", "view": "list",
 *       "accent": "#2f6f5e", "items": [ { "id": "...", "title": "...", "url": "...", "icon": "", "description": "" } ] },
 *     { "id": "...", "type": "note",   "title": "...", "size": "s", "text": "" },
 *     { "id": "...", "type": "clock",  "title": "...", "size": "s", "timeZone": "" },
 *     { "id": "...", "type": "search", "title": "...", "size": "m", "searchUrl": "https://www.google.com/search?q=%s" },
 *     { "id": "...", "type": "embed",  "title": "...", "size": "l", "embedUrl": "https://...", "height": 400 }
 *   ]
 * }
 */
import { THEME_PRESETS, FAVICON_URL, SAVE_DELAY_MS } from "./config.js";
import * as storage from "./storage.js";

const WIDGET_TYPES = {
  links: "リンク集",
  note: "メモ",
  clock: "時計",
  search: "Web 検索",
  embed: "埋め込み",
};
const SIZES = ["s", "m", "l", "xl"];
const DEFAULT_SETTINGS = { mode: "auto", preset: "", openInNewTab: true, useFavicons: true };
const DEFAULT_SEARCH_URL = "https://www.google.com/search?q=%s";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const el = {
  root: document.documentElement,
  title: $("#dashboard-title"),
  dashboard: $("#dashboard"),
  filter: $("#filter"),
  editToggle: $("#edit-toggle"),
  settingsOpen: $("#settings-open"),
  saveStatus: $("#save-status"),
  banner: $("#banner"),
  userEmail: $("#user-email"),
  widgetDialog: $("#widget-dialog"),
  widgetForm: $("#widget-form"),
  widgetDelete: $("#widget-delete"),
  linkDialog: $("#link-dialog"),
  linkForm: $("#link-form"),
  linkDelete: $("#link-delete"),
  settingsDialog: $("#settings-dialog"),
  settingsForm: $("#settings-form"),
  presetSelect: $("#preset-select"),
  exportButton: $("#export-button"),
  importInput: $("#import-input"),
  resetButton: $("#reset-button"),
};

let state = null;
let storageMode = "local";
let editing = false;
let sortables = [];
let saveTimer = null;
let clockTimer = null;

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
    version: 1,
    title: typeof data?.title === "string" ? data.title : "Dashboard",
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings || {}) },
    widgets: [],
  };
  for (const w of Array.isArray(data?.widgets) ? data.widgets : []) {
    if (!w || !WIDGET_TYPES[w.type]) continue;
    const widget = {
      ...w,
      id: w.id ? String(w.id) : uid(),
      title: typeof w.title === "string" ? w.title : "",
      size: SIZES.includes(w.size) ? w.size : "m",
    };
    if (widget.type === "links") {
      widget.view = widget.view === "grid" ? "grid" : "list";
      widget.items = (Array.isArray(w.items) ? w.items : [])
        .filter((item) => item && safeUrl(item.url))
        .map((item) => ({ ...item, id: item.id ? String(item.id) : uid() }));
    }
    out.widgets.push(widget);
  }
  return out;
}

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

function applySettings() {
  const { mode, preset } = state.settings;
  if (mode === "light" || mode === "dark") el.root.dataset.mode = mode;
  else delete el.root.dataset.mode;
  if (preset) el.root.dataset.preset = preset;
  else delete el.root.dataset.preset;
  el.title.textContent = state.title || "Dashboard";
  document.title = state.title || "Dashboard";
}

function render() {
  applySettings();
  destroySortables();

  const nodes = state.widgets.map(renderWidget);
  if (editing) {
    nodes.push(
      h("button", { type: "button", class: "widget-add", onclick: () => openWidgetDialog(null) }, "＋ ウィジェットを追加"),
    );
  }
  if (state.widgets.length === 0 && !editing) {
    nodes.push(
      h("p", { class: "widget__empty" }, "ウィジェットがありません。右上の「編集」から追加できます。"),
    );
  }
  el.dashboard.replaceChildren(...nodes);

  setupSortables();
  applyFilter();
  updateClocks();
}

function renderWidget(widget) {
  const style = isHexColor(widget.accent) ? { "--widget-accent": widget.accent } : {};
  const section = h("section", {
    class: `widget widget--${widget.type}`,
    dataset: { id: widget.id, size: widget.size, type: widget.type },
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
      h("h2", { class: "widget__title" }, widget.title || ""),
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
    return h("p", { class: "widget__empty" }, "リンクがありません");
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
  const url = safeUrl(widget.embedUrl || "");
  if (!url || !/^https:/.test(url)) {
    return h("p", { class: "widget__empty" }, "埋め込む URL（https://…）を設定してください");
  }
  return h("iframe", {
    class: "embed",
    src: url,
    title: widget.title || "埋め込み",
    loading: "lazy",
    referrerpolicy: "no-referrer",
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    style: { height: `${Math.min(Math.max(Number(widget.height) || 400, 120), 1600)}px` },
  });
}

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

  // ウィジェットの並べ替え
  sortables.push(new Sortable(el.dashboard, {
    ...common,
    handle: ".widget__handle",
    draggable: ".widget",
    onEnd: () => {
      const order = $$(".widget", el.dashboard).map((n) => n.dataset.id);
      state.widgets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
        for (const w of state.widgets) {
          if (w.type === "links") for (const item of w.items) all.set(item.id, item);
        }
        for (const listEl of new Set([event.from, event.to])) {
          const widget = state.widgets.find((w) => w.id === listEl.dataset.widgetId);
          if (!widget) continue;
          widget.items = $$(".link-item", listEl).map((n) => all.get(n.dataset.id)).filter(Boolean);
        }
        commit();
      },
    }));
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
}
el.widgetForm.elements.type.addEventListener("change", updateWidgetFormVisibility);

function openWidgetDialog(widgetId) {
  editingWidgetId = widgetId;
  const widget = state.widgets.find((w) => w.id === widgetId);
  const f = el.widgetForm.elements;

  $("#widget-dialog-title").textContent = widget ? "ウィジェットを編集" : "ウィジェットを追加";
  f.type.value = widget?.type || "links";
  f.type.disabled = Boolean(widget); // 種類は作成時のみ選べる
  f.title.value = widget?.title ?? "";
  f.size.value = widget?.size || "m";
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

el.widgetDialog.addEventListener("close", () => {
  if (el.widgetDialog.returnValue !== "ok") return;
  const f = el.widgetForm.elements;
  let widget = state.widgets.find((w) => w.id === editingWidgetId);
  if (!widget) {
    widget = { id: uid(), type: f.type.value };
    if (widget.type === "links") widget.items = [];
    if (widget.type === "note") widget.text = "";
    state.widgets.push(widget);
  }
  widget.title = f.title.value.trim();
  widget.size = SIZES.includes(f.size.value) ? f.size.value : "m";
  if (f.useAccent.checked && isHexColor(f.accent.value)) widget.accent = f.accent.value;
  else delete widget.accent;

  if (widget.type === "links") widget.view = f.view.value === "grid" ? "grid" : "list";
  if (widget.type === "search") widget.searchUrl = f.searchUrl.value.trim();
  if (widget.type === "embed") {
    widget.embedUrl = f.embedUrl.value.trim();
    widget.height = Number(f.height.value) || 400;
  }
  if (widget.type === "clock") widget.timeZone = f.timeZone.value.trim();
  commit();
});

el.widgetDelete.addEventListener("click", () => {
  const widget = state.widgets.find((w) => w.id === editingWidgetId);
  if (!widget) return;
  const extra = widget.type === "links" && widget.items.length ? `（リンク ${widget.items.length} 件も消えます）` : "";
  if (!confirm(`「${widget.title || WIDGET_TYPES[widget.type]}」を削除しますか？${extra}`)) return;
  state.widgets = state.widgets.filter((w) => w.id !== editingWidgetId);
  el.widgetDialog.close("deleted");
  commit();
});

/* ================================================================== */
/* リンクの編集                                                          */
/* ================================================================== */

let linkTarget = { widgetId: null, itemId: null };

function openLinkDialog(widgetId, itemId) {
  linkTarget = { widgetId, itemId };
  const widget = state.widgets.find((w) => w.id === widgetId);
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
  const widget = state.widgets.find((w) => w.id === linkTarget.widgetId);
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
  const widget = state.widgets.find((w) => w.id === linkTarget.widgetId);
  if (!widget) return;
  widget.items = widget.items.filter((i) => i.id !== linkTarget.itemId);
  el.linkDialog.close("deleted");
  commit();
});

/* ================================================================== */
/* 設定                                                                 */
/* ================================================================== */

el.presetSelect.replaceChildren(...THEME_PRESETS.map((p) => h("option", { value: p.id }, p.label)));

el.settingsOpen.addEventListener("click", () => {
  const f = el.settingsForm.elements;
  f.title.value = state.title;
  f.mode.value = state.settings.mode;
  f.preset.value = state.settings.preset;
  f.openInNewTab.checked = state.settings.openInNewTab;
  f.useFavicons.checked = state.settings.useFavicons;
  el.settingsDialog.returnValue = "";
  el.settingsDialog.showModal();
});

// 配色とテーマは選んだ時点でプレビューする
for (const name of ["mode", "preset"]) {
  el.settingsForm.elements[name].addEventListener("change", () => {
    const f = el.settingsForm.elements;
    const preview = { ...state.settings, mode: f.mode.value, preset: f.preset.value };
    const saved = state.settings;
    state.settings = preview;
    applySettings();
    state.settings = saved;
  });
}

el.settingsDialog.addEventListener("close", () => {
  if (el.settingsDialog.returnValue === "ok") {
    const f = el.settingsForm.elements;
    state.title = f.title.value.trim() || "Dashboard";
    state.settings = {
      mode: f.mode.value,
      preset: f.preset.value,
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

async function init() {
  setStatus("読み込み中…");
  try {
    const result = await storage.load();
    state = normalize(result.data);
    storageMode = result.mode;
    if (storageMode === "local") {
      showBanner(
        "サーバーに保存できないため、このブラウザにだけ保存しています。" +
          (result.warning ? `（${result.warning}）` : ""),
        "info",
      );
    }
    setStatus(storageMode === "remote" ? "" : "ローカル保存");
  } catch (err) {
    // 認証エラーや設定漏れ。データを上書きしないよう読み取り専用で初期表示もしない
    setStatus("読み込めませんでした", "error");
    showBanner(err.message);
    el.editToggle.disabled = true;
    el.settingsOpen.disabled = true;
    return;
  }

  render();
  clockTimer = setInterval(updateClocks, 1000);

  if (storageMode === "remote") {
    const email = await storage.fetchUser();
    if (email) el.userEmail.textContent = email;
  }
}

init();
