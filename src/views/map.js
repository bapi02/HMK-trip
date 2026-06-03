// views/map.js — Leaflet 지도 뷰. 그날의 핀 + 순서대로 폴리라인 동선.
// 핀 드래그로 좌표 갱신, 핀 클릭 시 요약 팝업. 좌표 없는 스팟은 하단 목록으로.
import { el, clear, toast } from "../util.js";
import { CATEGORIES, formatCost } from "../model.js";
import { centroid } from "../geo.js";

let _map = null;

function categoryPinIcon(spot, order) {
  const cat = CATEGORIES[spot.category] || CATEGORIES.etc;
  const html = `<div class="pin" style="background:${cat.color}"><span>${order}</span></div>`;
  return window.L.divIcon({
    html,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -26],
  });
}

// ctx: { trip, dayIndex, persist(), refresh() }
export function renderMap(container, ctx) {
  clear(container);
  // 이전 지도 인스턴스 정리
  if (_map) {
    _map.remove();
    _map = null;
  }

  const day = ctx.trip.schedule[ctx.dayIndex];
  const mapEl = el("div#map");
  container.appendChild(mapEl);
  container.appendChild(
    el("div.map-hint", {}, [
      "🖈 핀을 드래그하면 좌표가 갱신돼요. 선은 스팟 순서대로 이은 동선입니다.",
    ])
  );

  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  const unlocated = day.spots.filter((s) => s.lat == null || s.lng == null);

  // 좌표 미지정 스팟 안내 (타임라인에는 그대로 노출되지만 지도엔 빠짐 — 스펙 8)
  if (unlocated.length) {
    container.appendChild(
      el("div.map-noloc", {}, [
        el("b", {}, ["위치 미지정 "]),
        `${unlocated.length}곳: ` +
          unlocated.map((s) => s.title || "(제목 없음)").join(", "),
      ])
    );
  }

  // 지도 초기화 (다음 프레임 — 컨테이너 크기 확정 후)
  requestAnimationFrame(() => {
    const center = centroid(located) || { lat: 35.681, lng: 139.767 }; // 도쿄역 기본
    _map = window.L.map(mapEl, { scrollWheelZoom: true }).setView(
      [center.lat, center.lng],
      located.length ? 13 : 11
    );
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(_map);

    const latlngs = [];
    located.forEach((spot, i) => {
      const order = day.spots.indexOf(spot) + 1;
      const marker = window.L.marker([spot.lat, spot.lng], {
        draggable: true,
        icon: categoryPinIcon(spot, order),
      }).addTo(_map);

      const cat = CATEGORIES[spot.category] || CATEGORIES.etc;
      marker.bindPopup(
        `<div class="pp-title">${order}. ${spot.title || "(제목 없음)"}</div>` +
          `<div class="pp-meta">${cat.icon} ${cat.label}` +
          (spot.time ? ` · ${spot.time}` : "") +
          (spot.cost ? ` · ${formatCost(spot.cost)}` : "") +
          `</div>`
      );

      // 핀 드래그 → 좌표 갱신 후 저장.
      marker.on("dragend", async () => {
        const ll = marker.getLatLng();
        spot.lat = Number(ll.lat.toFixed(6));
        spot.lng = Number(ll.lng.toFixed(6));
        await ctx.persist();
        toast("좌표를 갱신했어요");
      });

      latlngs.push([spot.lat, spot.lng]);
    });

    // 순서대로 폴리라인 동선
    if (latlngs.length >= 2) {
      window.L.polyline(latlngs, {
        color: "#c8472b",
        weight: 3,
        opacity: 0.8,
        dashArray: "1 8",
        lineCap: "round",
      }).addTo(_map);
    }

    // 모든 핀이 보이게 fit
    if (latlngs.length >= 2) {
      _map.fitBounds(latlngs, { padding: [40, 40] });
    }
  });
}

// 뷰 전환·이탈 시 정리.
export function disposeMap() {
  if (_map) {
    _map.remove();
    _map = null;
  }
}
