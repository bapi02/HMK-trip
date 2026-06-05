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

// 대중교통 출발시각 = '지금 출발'(실시간). 구글맵 대중교통을 쓰는 가장 일반적인 방식이고,
// 먼 미래 날짜라 시간표가 없어 지하철이 비는 문제도 함께 해결된다.
function departureTime() {
  return new Date(Date.now() + 60 * 1000); // 1분 뒤(현재 시각 기준)
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

// 순간 호출 제한(OVER_QUERY_LIMIT)이면 백오프 재시도.
function distanceMatrix(google, origin, destinations, mode, depTime, attempt = 0) {
  return new Promise((resolve) => {
    const svc = new google.maps.DistanceMatrixService();
    const req = { origins: [origin], destinations, travelMode: mode };
    if (mode === google.maps.TravelMode.TRANSIT) {
      req.transitOptions = { departureTime: depTime };
    }
    svc.getDistanceMatrix(req, (res, status) => {
      if (status === "OK" && res) {
        resolve({ elements: res.rows[0].elements });
      } else if (status === "OVER_QUERY_LIMIT" && attempt < 3) {
        setTimeout(
          () =>
            distanceMatrix(google, origin, destinations, mode, depTime, attempt + 1).then(
              resolve
            ),
          500 * Math.pow(2, attempt)
        );
      } else {
        resolve({ error: status });
      }
    });
  });
}

// 대중교통은 Directions API로 조회(Distance Matrix보다 경로를 잘 잡음).
// 대안 경로 중 '가장 빠른' 소요시간을 반환. 경로 없거나 미설정이면 null.
function directionsTransit(google, origin, dest, depTime, attempt = 0) {
  return new Promise((resolve) => {
    const ds = new google.maps.DirectionsService();
    ds.route(
      {
        origin,
        destination: dest,
        travelMode: google.maps.TravelMode.TRANSIT,
        transitOptions: { departureTime: depTime },
        provideRouteAlternatives: true,
      },
      (res, status) => {
        if (status === "OK" && res && res.routes && res.routes.length) {
          let best = { sec: Infinity, text: null };
          res.routes.forEach((rt) => {
            const leg = rt.legs && rt.legs[0];
            const sec = leg && leg.duration && leg.duration.value;
            if (sec != null && sec < best.sec) best = { sec, text: leg.duration.text };
          });
          resolve(best.text ? { min: Math.round(best.sec / 60), text: best.text } : null);
        } else if (status === "OVER_QUERY_LIMIT" && attempt < 3) {
          setTimeout(
            () => directionsTransit(google, origin, dest, depTime, attempt + 1).then(resolve),
            500 * Math.pow(2, attempt)
          );
        } else {
          resolve(null); // ZERO_RESULTS / REQUEST_DENIED(미설정) 등 → 지하철 없음
        }
      }
    );
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
  const depTime = departureTime();

  // 차량은 DistanceMatrix(한 번에), 지하철은 Directions(목적지별)로.
  const drive = await distanceMatrix(
    google, origin, dests, google.maps.TravelMode.DRIVING, depTime
  );
  const transitArr = await Promise.all(
    courses.map((c) =>
      directionsTransit(google, origin, { lat: c.lat, lng: c.lng }, depTime)
    )
  );

  courses.forEach((s, i) => {
    const d = drive.elements && drive.elements[i];
    const t = transitArr[i];
    result.set(s.id, {
      driveText: d && d.status === "OK" ? d.duration.text : null,
      driveMin: d && d.status === "OK" ? Math.round(d.duration.value / 60) : null,
      transitText: t ? t.text : null,
      transitMin: t ? t.min : null,
      error: drive.error || null, // 차량(기준)까지 실패하면 오류 표시
    });
  });

  // 차량 조회까지 실패하면 캐시하지 않음 → 설정 고친 뒤 새로고침으로 즉시 재시도.
  if (!drive.error) _cache.set(key, result);
  return result;
}

// 기준 숙소 선택 바 (타임라인 상단). 구글맵 키 없으면 null.
export function renderHotelSelector(ctx) {
  if (!hasGoogleMaps()) return null;
  const day = ctx.trip.schedule[ctx.dayIndex];
  const located = day.spots.filter((s) => s.lat != null && s.lng != null);

  const bar = el("div.hotel-bar");
  bar.appendChild(el("span.hb-icon", {}, ["🚩"]));
  bar.appendChild(el("span.hb-label", {}, ["출발 기준"]));

  if (located.length < 2) {
    bar.appendChild(
      el("span.hb-hint", {}, ["좌표 있는 스팟이 2곳 이상이면 출발 기준 이동시간을 보여줘요"])
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
