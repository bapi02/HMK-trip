// geo.js — 거리·동선·이동시간 추정
// 직선거리(haversine) 기반 어림치. 추후 OSRM 등 라우팅 API로 교체할 수 있게 함수만 갈아끼우면 되도록 분리.

const R = 6371; // 지구 반지름(km)

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// 두 좌표 사이 직선거리(km). 좌표가 없으면 null.
export function haversineKm(a, b) {
  if (!a || !b) return null;
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 이동수단별 평균 속도(km/h) — 직선거리 기반 어림치 보정용.
const SPEED_KMH = {
  walk: 4.5,
  bus: 18,
  train: 32,
  car: 28,
  "": 20, // 미지정 기본
};

// 직선거리 + 이동수단으로 이동시간(분) 추정. 좌표 없으면 null.
// 도심 우회를 감안해 직선거리에 1.3배 보정 계수를 곱한다.
export function estimateMoveMin(prev, spot, mode = "") {
  const km = haversineKm(prev, spot);
  if (km == null) return null;
  const speed = SPEED_KMH[mode] ?? SPEED_KMH[""];
  const adjustedKm = km * 1.3;
  return Math.max(1, Math.round((adjustedKm / speed) * 60));
}

// km를 사람이 읽기 좋은 문자열로.
export function formatKm(km) {
  if (km == null) return "";
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// 분을 "1시간 20분" / "45분" 형태로.
export function formatMin(min) {
  if (min == null) return "";
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}시간 ${rem}분` : `${h}시간`;
}

// 좌표가 있는 스팟들의 중심점 — 지도 초기 뷰 계산용.
export function centroid(spots) {
  const pts = spots.filter((s) => s.lat != null && s.lng != null);
  if (!pts.length) return null;
  const lat = pts.reduce((sum, s) => sum + s.lat, 0) / pts.length;
  const lng = pts.reduce((sum, s) => sum + s.lng, 0) / pts.length;
  return { lat, lng };
}
