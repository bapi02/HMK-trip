// sw.js — 서비스 워커 (오프라인 지원).
// 전략: 동일 출처(앱 파일)는 network-first → 항상 최신을 받되, 오프라인이면 캐시로 폴백.
//       (캐시 우선이 아니라 네트워크 우선이라, 평소 업데이트 반영이 늦어지지 않음)
// 구글맵/파이어베이스/타일 등 외부 실시간 요청은 건드리지 않음(네트워크 필요).

const CACHE = "tripplanner-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./src/styles.css",
  "./src/main.js",
  "./src/store.js",
  "./src/firebase.js",
  "./src/model.js",
  "./src/geo.js",
  "./src/util.js",
  "./src/currency.js",
  "./src/weather.js",
  "./src/mapsConfig.js",
  "./src/views/library.js",
  "./src/views/trip.js",
  "./src/views/timeline.js",
  "./src/views/map.js",
  "./src/views/hotelRoutes.js",
  "./src/components/spotCard.js",
  "./src/components/spotEditor.js",
  "./src/components/placeSheet.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 동일 출처(앱 파일)만 처리. 외부(CDN·구글·파이어베이스)는 기본 동작에 맡김.
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((m) => m || caches.match("./index.html"))
      )
  );
});
