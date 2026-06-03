// main.js — 라우팅 + 앱 부트.
// 해시 라우팅(#/ , #/trip/:id) — 정적 호스팅/로컬 file:// 에서도 그대로 동작.
import { getStore } from "./store.js";
import { renderLibrary } from "./views/library.js";
import { renderTrip } from "./views/trip.js";
import { el, clear } from "./util.js";

let _store = null;
let _appRoot = null;

export function navigate(path) {
  const target = "#" + (path.startsWith("/") ? path : "/" + path);
  if (location.hash === target) router();
  else location.hash = target;
}

function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const m = hash.match(/^\/trip\/(.+)$/);
  if (m) return { name: "trip", id: decodeURIComponent(m[1]) };
  return { name: "library" };
}

async function router() {
  const route = parseRoute();
  // 이전 뷰 정리 훅 (구독 해제·지도 정리 등)
  if (_appRoot && _appRoot._cleanup) {
    try {
      _appRoot._cleanup();
    } catch {}
    _appRoot._cleanup = null;
  }
  clear(_appRoot);
  _appRoot.scrollTop = 0;
  window.scrollTo(0, 0);

  if (route.name === "trip") {
    await renderTrip(_appRoot, _store, route.id);
  } else {
    await renderLibrary(_appRoot, _store);
  }
}

async function boot() {
  _store = await getStore();

  const app = document.getElementById("app");
  clear(app);

  // 상단바 — 모드 배지로 local/firebase 표시.
  app.appendChild(
    el("header.topbar", {}, [
      el(
        "div.brand",
        {
          onclick: () => navigate("/"),
          style: { cursor: "pointer" },
        },
        [el("span.seal", {}, ["旅"]), el("span", {}, ["Trip Planner"])]
      ),
      el("div.spacer"),
      el("div.mode-badge", {}, [
        _store.mode === "firebase" ? "☁ 동기화" : "📁 로컬 저장",
      ]),
    ])
  );

  _appRoot = el("main.view");
  app.appendChild(_appRoot);

  window.addEventListener("hashchange", router);
  await router();
}

boot().catch((err) => {
  console.error(err);
  const app = document.getElementById("app");
  if (app)
    app.innerHTML =
      '<div class="loading">앱을 불러오지 못했어요. 콘솔을 확인해주세요.</div>';
});
