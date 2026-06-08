// weather.js — Day별 날씨(최고/최저 기온 + 비 여부). 무료 Open-Meteo, 키 불필요.
//  · 16일 이내면 실제 예보, 그 이후(먼 미래)면 작년 같은 시기 '예년 기준'으로 대체.
//  · 좌표·날짜별로 localStorage에 캐시(6시간).

const WX_KEY = "tripPlanner.wx.v1";
let _cache = {};
try {
  _cache = JSON.parse(localStorage.getItem(WX_KEY) || "{}");
} catch {}
function save() {
  try {
    localStorage.setItem(WX_KEY, JSON.stringify(_cache));
  } catch {}
}

function daysFromToday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
// WMO weather_code가 비/눈 계열인지.
function isWetCode(code) {
  return code != null && code >= 51;
}

// getDayWeather(lat, lng, date) → { tmax, tmin, rain, source:'forecast'|'normal' } | null
export async function getDayWeather(lat, lng, date) {
  if (lat == null || lng == null || !date) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${date}`;
  const c = _cache[key];
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return c.data;

  let data = null;
  const dd = daysFromToday(date);
  try {
    if (dd >= 0 && dd <= 15) {
      // 실제 예보
      const u =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
        `&timezone=auto&start_date=${date}&end_date=${date}`;
      const j = await (await fetch(u)).json();
      const dly = j.daily;
      if (dly && dly.time && dly.time.length) {
        const pp = dly.precipitation_probability_max?.[0];
        const code = dly.weather_code?.[0];
        data = {
          tmax: Math.round(dly.temperature_2m_max[0]),
          tmin: Math.round(dly.temperature_2m_min[0]),
          rain: (pp != null && pp >= 40) || isWetCode(code),
          pop: pp ?? null,
          source: "forecast",
        };
      }
    } else if (dd > 15) {
      // 먼 미래 → 작년 같은 시기(전후 3일) 평균을 '예년 기준'으로
      const yr = new Date(date + "T00:00:00").getFullYear() - 1;
      const base = `${yr}-${date.slice(5)}`;
      const s = shiftDate(base, -3);
      const e = shiftDate(base, 3);
      const u =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
        `&start_date=${s}&end_date=${e}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
      const j = await (await fetch(u)).json();
      const dly = j.daily;
      if (dly && dly.time && dly.time.length) {
        const avg = (a) => a.reduce((x, y) => x + (y || 0), 0) / a.length;
        const wetDays = dly.precipitation_sum.filter((v) => v >= 1).length;
        data = {
          tmax: Math.round(avg(dly.temperature_2m_max)),
          tmin: Math.round(avg(dly.temperature_2m_min)),
          rain: wetDays >= Math.ceil(dly.time.length / 2),
          source: "normal",
        };
      }
    }
  } catch (e) {
    console.warn("날씨 로드 실패", e);
  }

  if (data) {
    _cache[key] = { data, at: Date.now() };
    save();
  }
  return data;
}
