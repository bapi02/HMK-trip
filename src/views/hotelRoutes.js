// views/hotelRoutes.js — 숙소 기준 이동시간 계산 + 기준 숙소 선택 바.
// 타임라인의 각 스팟에 "숙소에서 택시🚕/지하철🚇 몇 분"을 보여주기 위한 공용 로직.
import { el, toast } from "../util.js";
import { CATEGORIES } from "../model.js";
import { hasGoogleMaps, loadGoogleMaps } from "../mapsConfig.js";

// 구글 지도 길찾기 딥링크 (실제 내비게이션).
export function dirUrl(o, d, mode) {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${o.lat},${o.lng}&destination=${d.lat},${d.lng}` +
    `&travelmode=${mode}`
  );
}

// 대중교통 출발시각 — 그날 오전 10시(미래) 기준, 지난 날짜면 1시간 뒤.
function departureTime(day) {
  const base = day.date ? new Date(day.date + "T10:00:00") : new Date();
  return base.getTime() > Date.now() ? base : new Date(Date.now() + 3600000);
}

// 그날 기준 숙소 id 결정: 저장값 → 숙소 카테고리 → 첫 좌표 스팟.
export function pickHotelId(day) {
  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return null;
  if (day.hotelSpotId && located.some((s) => s.id === day.hotelSpotId)) {
    return day.hotelSpotId;
  }
  const hotel = located.find((s) => s.category === "hotel");
  return (hotel || located[0]).id;
}

function distanceMatrix(google, origin, destinations, mode, depTime) {
  return new Promise((resolve) => {
    const svc = new google.maps.DistanceMatrixService();
    const req = { origins: [origin], destinations, travelMode: mode };
    if (mode === google.maps.TravelMode.TRANSIT) {
      req.transitOptions = { departureTime: depTime };
    }
    svc.getDistanceMatrix(req, (res, status) => {
      if (status !== "OK" || !res) resolve({ error: status });
      else resolve({ elements: res.rows[0].elements });
    });
  });
}

// 좌표·숙소·날짜가 같으면 재호출 안 하도록 세션 캐시.
const _cache = new Map();
function cacheKey(day, hotelId) {
  const coords = day.spots
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => `${s.id}:${s.lat},${s.lng}`)
    .join("|");
  return `${day.date}|${hotelId}|${coords}`;
}

// computeHotelTimes(day, hotelId) → Map(spotId → {driveText, driveMin, transitText, transitMin, error})
export async function computeHotelTimes(day, hotelId) {
  const key = cacheKey(day, hotelId);
  if (_cache.has(key)) return _cache.get(key);

  const result = new Map();
  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  const hotel = located.find((s) => s.id === hotelId);
  const courses = located.filter((s) => s.id !== hotelId);
  if (!hotel || !courses.length) {
    _cache.set(key, result);
    return result;
  }

  const google = await loadGoogleMaps();
  const origin = { lat: hotel.lat, lng: hotel.lng };
  const dests = courses.map((s) => ({ lat: s.lat, lng: s.lng }));
  const depTime = departureTime(day);

  const [drive, transit] = await Promise.all([
    distanceMatrix(google, origin, dests, google.maps.TravelMode.DRIVING, depTime),
    distanceMatrix(google, origin, dests, google.maps.TravelMode.TRANSIT, depTime),
  ]);

  courses.forEach((s, i) => {
    const d = drive.elements && drive.elements[i];
    const t = transit.elements && transit.elements[i];
    result.set(s.id, {
      driveText: d && d.status === "OK" ? d.duration.text : null,
      driveMin: d && d.status === "OK" ? Math.round(d.duration.value / 60) : null,
      transitText: t && t.status === "OK" ? t.duration.text : null,
      transitMin: t && t.status === "OK" ? Math.round(t.duration.value / 60) : null,
      error: drive.error && transit.error ? drive.error : null,
    });
  });

  _cache.set(key, result);
  return result;
}

// 기준 숙소 선택 바 (타임라인 상단). 구글맵 키 없으면 null.
export function renderHotelSelector(ctx) {
  if (!hasGoogleMaps()) return null;
  const day = ctx.trip.schedule[ctx.dayIndex];
  const located = day.spots.filter((s) => s.lat != null && s.lng != null);

  const bar = el("div.hotel-bar");
  bar.appendChild(el("span.hb-icon", {}, ["🏨"]));
  bar.appendChild(el("span.hb-label", {}, ["기준 숙소"]));

  if (located.length < 2) {
    bar.appendChild(
      el("span.hb-hint", {}, ["좌표 있는 스팟이 2곳 이상이면 숙소 기준 이동시간을 보여줘요"])
    );
    return bar;
  }

  const hotelId = pickHotelId(day);
  const candidates = [...located].sort(
    (a, b) => (b.category === "hotel") - (a.category === "hotel")
  );
  const select = el("select.hb-select", {
    onchange: async (e) => {
      day.hotelSpotId = e.target.value;
      await ctx.persist();
      ctx.refresh();
    },
  });
  candidates.forEach((s) => {
    const cat = CATEGORIES[s.category] || CATEGORIES.etc;
    const o = el("option", { value: s.id }, [`${cat.icon} ${s.title || "(제목 없음)"}`]);
    if (s.id === hotelId) o.selected = true;
    select.appendChild(o);
  });
  bar.appendChild(select);
  bar.appendChild(el("span.hb-hint", {}, ["각 스팟까지 🚕택시 · 🚇지하철"]));
  return bar;
}
