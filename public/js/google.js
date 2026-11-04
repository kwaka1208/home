/**
 * google.js — Google カレンダーと Gmail の API の呼び出し
 *
 * どちらも「読み取りだけ」の権限で、ブラウザから直接 Google の API を呼びます。
 * 取得した予定や件数はダッシュボードのデータ（Firestore）には保存しません。
 */

/** カレンダーの予定を読むための権限（読み取りのみ） */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
/** Gmail のラベルと件数を読むための権限（メールの本文や件名は読めない） */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.labels";

import { firebaseConfig } from "./firebase-config.js";

/** API ごとの名前と、Google Cloud での識別名（有効にする画面のリンクに使う） */
const APIS = {
  "www.googleapis.com": { name: "Google Calendar API", service: "calendar-json.googleapis.com" },
  "gmail.googleapis.com": { name: "Gmail API", service: "gmail.googleapis.com" },
};

export class GoogleApiError extends Error {
  /**
   * @param {string} message
   * @param {{ expired?: boolean, link?: { label: string, url: string } }} options
   *   link があれば、エラーの下に「◯◯を開く」リンクとして表示する
   */
  constructor(message, { expired = false, link = null } = {}) {
    super(message);
    this.expired = expired;
    this.link = link;
  }
}

/** 「API が有効になっていない」エラーから、有効にする画面の URL を決める */
function activationUrl(body, service) {
  // Google のエラーには、プロジェクト番号つきの正確なリンクが入っていることが多い
  for (const detail of body?.error?.details || []) {
    const url = detail?.metadata?.activationUrl;
    if (typeof url === "string" && /^https:\/\/console\.(developers|cloud)\.google\.com\//.test(url)) return url;
  }
  const project = encodeURIComponent(firebaseConfig.projectId || "");
  return `https://console.cloud.google.com/apis/library/${service}?project=${project}`;
}

async function call(url, token) {
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new GoogleApiError("Google に接続できません。ネットワークを確認してください。");
  }
  if (res.ok) return res.json();

  let reason = "";
  let message = "";
  let body = null;
  try {
    body = await res.json();
    message = body?.error?.message || "";
    reason = body?.error?.errors?.[0]?.reason || body?.error?.details?.[0]?.reason || "";
  } catch { /* 本文なし */ }

  if (res.status === 401) {
    throw new GoogleApiError("Google との連携の有効期限が切れました。", { expired: true });
  }
  if (res.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(`${reason} ${message}`)) {
    const api = APIS[new URL(url).hostname] || { name: "この API", service: "" };
    throw new GoogleApiError(
      `Google Cloud で「${api.name}」が有効になっていません。下のリンクから「有効にする」を押し、数分待ってから ↻ で読み込み直してください。`,
      { link: api.service ? { label: `${api.name} を有効にする画面を開く ↗`, url: activationUrl(body, api.service) } : null },
    );
  }
  if (res.status === 403 && /insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(`${reason} ${message}`)) {
    throw new GoogleApiError("必要な権限が許可されていません。連携し直して、確認画面のチェックを入れてください。", { expired: true });
  }
  throw new GoogleApiError(`Google の API でエラーが発生しました（${res.status}${message ? `：${message}` : ""}）`);
}

/**
 * 今日から days 日分の予定を、開始時刻順に返す（終わった予定は除く）。
 * allCalendars が true なら、Google カレンダーで表示中（チェックが入っている）のカレンダーすべて。
 * @returns {Promise<Array<{ id, title, start: Date, end: Date, allDay: boolean, link, color, calendar }>>}
 */
export async function fetchCalendarEvents(token, { days = 3, allCalendars = true } = {}) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  let calendars = [{ id: "primary", color: "", name: "" }];
  if (allCalendars) {
    const list = await call(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50",
      token,
    );
    const selected = (list.items || []).filter((c) => c.selected || c.primary);
    if (selected.length) calendars = selected.map((c) => ({ id: c.id, color: c.backgroundColor || "", name: c.summaryOverride || c.summary || "" }));
  }

  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const results = await Promise.all(calendars.map(async (cal) => {
    const data = await call(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
      token,
    );
    return (data.items || [])
      .filter((ev) => ev.status !== "cancelled")
      .map((ev) => {
        const allDay = Boolean(ev.start?.date);
        // 終日の予定の日付（YYYY-MM-DD）は、その地域の 0 時として扱う
        const parse = (t) => (t?.dateTime ? new Date(t.dateTime) : new Date(`${t?.date}T00:00:00`));
        return {
          id: `${cal.id}:${ev.id}`,
          title: ev.summary || "（タイトルなし）",
          start: parse(ev.start),
          end: parse(ev.end),
          allDay,
          link: ev.htmlLink || "",
          location: ev.location || "",
          meet: ev.hangoutLink || "",
          color: cal.color,
          calendar: cal.name,
        };
      });
  }));

  return results.flat()
    .filter((ev) => ev.end > now)
    .sort((a, b) => (a.start - b.start) || (Number(b.allDay) - Number(a.allDay)));
}

/** Gmail のラベル（INBOX など）の未読件数 */
export async function fetchGmailUnread(token, labelId = "INBOX") {
  const data = await call(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${encodeURIComponent(labelId)}`, token);
  return {
    unreadMessages: Number(data.messagesUnread || 0),
    unreadThreads: Number(data.threadsUnread || 0),
  };
}
