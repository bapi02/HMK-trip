// mapsConfig.js — 구글맵 설정.
// googleMapsApiKey가 채워져 있으면 지도 뷰가 구글맵(검색·리뷰·장소추가)으로 승격된다.
// 비어 있으면 Leaflet(한국어 핀) 폴백으로 동작 — 키 없이도 앱이 안 깨진다.
//
// 키 발급: Google Cloud Console(= Firebase 프로젝트) → "Maps JavaScript API" 사용 설정
//          → 사용자 인증 정보 → API 키. (HTTP 리퍼러 제한 권장)

export const googleMapsApiKey = "";

export function hasGoogleMaps() {
  return Boolean(googleMapsApiKey);
}

// 구글맵 JS SDK를 동적 로드(1회). 한국어(language=ko)·한국 리전·places 라이브러리 포함.
let _gmapsPromise = null;
export function loadGoogleMaps() {
  if (window.google && window.google.maps) return Promise.resolve(window.google);
  if (_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((resolve, reject) => {
    const cb = "__gmapsReady";
    window[cb] = () => resolve(window.google);
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(googleMapsApiKey)}` +
      "&libraries=places&language=ko&region=KR&loading=async" +
      `&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error("구글맵 로드 실패"));
    document.head.appendChild(s);
  });
  return _gmapsPromise;
}
