/**
 * services.js — 天気（Open-Meteo）と GitHub の API の呼び出し
 *
 * - 天気：Open-Meteo（https://open-meteo.com/）。登録も API キーも不要で、無料で使えます（非商用）。
 * - GitHub：自分で発行した個人用アクセストークンで、自分に関係するプルリクエストと Issue を検索します。
 */

export class ServiceError extends Error {
  constructor(message, { unauthorized = false } = {}) {
    super(message);
    this.unauthorized = unauthorized;
  }
}

async function getJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ServiceError("接続できません。ネットワークを確認してください。");
  }
  if (!res.ok) {
    let message = "";
    try { message = (await res.json()).message || ""; } catch { /* 本文なし */ }
    const err = new ServiceError(`エラーが発生しました（${res.status}${message ? `：${message}` : ""}）`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* 天気                                                                 */
/* ------------------------------------------------------------------ */

/** WMO の天気コード → 絵文字と日本語 */
const WEATHER_CODES = [
  [[0], "☀️", "快晴"],
  [[1], "🌤️", "晴れ"],
  [[2], "⛅", "晴れ時々くもり"],
  [[3], "☁️", "くもり"],
  [[45, 48], "🌫️", "霧"],
  [[51, 53, 55, 56, 57], "🌦️", "霧雨"],
  [[61, 63, 80, 81], "🌧️", "雨"],
  [[65, 82], "🌧️", "強い雨"],
  [[66, 67], "🌧️", "着氷性の雨"],
  [[71, 73, 77, 85], "🌨️", "雪"],
  [[75, 86], "❄️", "大雪"],
  [[95], "⛈️", "雷雨"],
  [[96, 99], "⛈️", "ひょうを伴う雷雨"],
];

export function describeWeather(code) {
  const found = WEATHER_CODES.find(([codes]) => codes.includes(Number(code)));
  return found ? { icon: found[1], text: found[2] } : { icon: "🌡️", text: "" };
}

/**
 * 地名から緯度・経度を探す（最初の候補）。
 * 日本語の地名は「東京都」「大阪市」のような正式な名前でないと見つからないことがあるので、
 * 見つからなければ「市」「都」などを付けて探し直す。
 */
export async function geocode(name) {
  const search = async (q) => {
    const params = new URLSearchParams({ name: q, count: "1", language: "ja", format: "json" });
    const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    return data.results?.[0];
  };
  let place = await search(name);
  const japanese = /[぀-ヿ一-鿿]/.test(name) && !/[市都府県区町村]$/.test(name);
  for (const suffix of japanese ? ["市", "都", "府", "県", "区", "町", "村"] : []) {
    if (place) break;
    place = await search(name + suffix);
  }
  if (!place) throw new ServiceError(`「${name}」という地域が見つかりませんでした。「札幌市」のような正式な名前か、ローマ字（Sapporo）で試してください。`);
  const label = [place.name, place.admin1 && place.admin1 !== place.name ? place.admin1 : "", place.country_code !== "JP" ? place.country : ""]
    .filter(Boolean).join("・");
  return { lat: place.latitude, lon: place.longitude, label };
}

/** 現在の天気と、今日から 7 日分の予報 */
export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "ms",
  });
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const c = data.current || {};
  const d = data.daily || {};
  return {
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      code: c.weather_code,
      isDay: c.is_day !== 0,
    },
    daily: (d.time || []).map((date, i) => ({
      date,
      code: d.weather_code?.[i],
      max: d.temperature_2m_max?.[i],
      min: d.temperature_2m_min?.[i],
      rain: d.precipitation_probability_max?.[i],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* GitHub                                                               */
/* ------------------------------------------------------------------ */

export const GITHUB_LISTS = {
  review: { label: "レビュー依頼", query: (login) => `is:open is:pr review-requested:${login} archived:false` },
  mine: { label: "自分のプルリクエスト", query: (login) => `is:open is:pr author:${login} archived:false` },
  assigned: { label: "担当の Issue", query: (login) => `is:open is:issue assignee:${login} archived:false` },
};

/**
 * 選んだ一覧ごとに、自分に関係する開いているプルリクエスト・Issue を返す。
 * @returns {Promise<{ login: string, lists: Array<{ key, label, total, items: Array<{ title, url, repo, number, updated, draft }> }> }>}
 */
export async function fetchGitHub(token, keys, limit = 10) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  let user;
  try {
    user = await getJson("https://api.github.com/user", { headers });
  } catch (err) {
    if (err.status === 401) {
      throw new ServiceError("GitHub のトークンが無効か、期限切れです。トークンを設定し直してください。", { unauthorized: true });
    }
    throw err;
  }
  const lists = await Promise.all(keys.filter((k) => GITHUB_LISTS[k]).map(async (key) => {
    const params = new URLSearchParams({ q: GITHUB_LISTS[key].query(user.login), sort: "updated", order: "desc", per_page: String(limit) });
    let data;
    try {
      data = await getJson(`https://api.github.com/search/issues?${params}`, { headers });
    } catch (err) {
      if (err.status === 403 || err.status === 429) throw new ServiceError("GitHub の利用回数の上限に達しました。しばらくしてから更新してください。");
      throw err;
    }
    return {
      key,
      label: GITHUB_LISTS[key].label,
      total: data.total_count || 0,
      items: (data.items || []).map((it) => ({
        title: it.title,
        url: it.html_url,
        repo: (it.repository_url || "").split("/").slice(-2).join("/"),
        number: it.number,
        updated: it.updated_at ? new Date(it.updated_at) : null,
        draft: Boolean(it.draft),
      })),
    };
  }));
  return { login: user.login, lists };
}
