// views/map.js — 지도 뷰.
//  · googleMapsApiKey가 있으면 구글맵(한국어 + 장소 검색 + 평점/리뷰 + 일정 추가)
//  · 없으면 Leaflet(CartoDB) 한국어 핀 지도로 폴백 — 키 없이도 동작.
import { el, clear, toast } from "../util.js";
import { CATEGORIES, formatCost, newSpot } from "../model.js";
import { centroid } from "../geo.js";
import { hasGoogleMaps, loadGoogleMaps } from "../mapsConfig.js";
import { openPlaceSheet } from "../components/placeSheet.js";

// Place Details에서 가져올 필드 (리뷰·사진 포함)
const DETAIL_FIELDS = [
  "place_id",
  "name",
  "geometry",
  "rating",
  "user_ratings_total",
  "reviews",
  "photos",
  "formatted_address",
  "opening_hours",
  "url",
];

let _map = null; // Leaflet 인스턴스
let _gmap = null; // 구글맵 인스턴스

// ctx: { trip, dayIndex, persist(), refresh() }
export function renderMap(container, ctx) {
  clear(container);
  disposeMap();
  if (hasGoogleMaps()) renderGoogleMap(container, ctx);
  else renderLeafletMap(container, ctx);
}

// 좌표 미지정 스팟 안내 (타임라인엔 노출되지만 지도엔 빠짐).
function appendNoLoc(container, unlocated) {
  if (!unlocated.length) return;
  container.appendChild(
    el("div.map-noloc", {}, [
      el("b", {}, ["위치 미지정 "]),
      `${unlocated.length}곳: ` +
        unlocated.map((s) => s.title || "(제목 없음)").join(", "),
    ])
  );
}

// ─────────────────────────────────────────────
// 구글맵 (검색·리뷰·일정 추가)
// ─────────────────────────────────────────────
function renderGoogleMap(container, ctx) {
  const day = ctx.trip.schedule[ctx.dayIndex];

  // 검색 바 + 결과 카드 영역
  const searchInput = el("input.map-search-input", {
    type: "search",
    placeholder: "장소·주소 검색 (대충 쳐도 연관 결과가 떠요)",
    enterkeyhint: "search",
    autocomplete: "off",
  });
  const resultBox = el("div.map-search-result");
  container.appendChild(
    el("div.map-search", {}, [el("span.mi", {}, ["🔍"]), searchInput])
  );
  container.appendChild(resultBox);

  const mapEl = el("div#map");
  container.appendChild(mapEl);
  container.appendChild(
    el("div.map-hint", {}, [
      "🔍 위에서 장소를 검색해 평점·리뷰를 보고 “일정에 추가”하세요. 핀은 드래그로 좌표 보정.",
    ])
  );

  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  appendNoLoc(container, day.spots.filter((s) => s.lat == null || s.lng == null));

  loadGoogleMaps()
    .then((google) => {
      const center = centroid(located) || { lat: 35.681, lng: 139.767 };
      _gmap = new google.maps.Map(mapEl, {
        center,
        zoom: located.length ? 13 : 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        // 구글맵 앱과 동일한 제스처: 한 손가락 이동, 핀치 줌,
        // 더블탭 후 드래그 줌, 휠 스크롤 줌(Ctrl 불필요).
        gestureHandling: "greedy",
      });

      const info = new google.maps.InfoWindow();
      const bounds = new google.maps.LatLngBounds();
      const path = [];
      const service = new google.maps.places.PlacesService(_gmap);

      // 장소를 현재 Day 일정에 추가 (장소ID·좌표·구글링크 포함).
      async function addSpotFromPlace(place, coord) {
        day.spots.push(
          newSpot({
            title: place.name || "새 장소",
            lat: Number(coord.lat.toFixed(6)),
            lng: Number(coord.lng.toFixed(6)),
            memo: place.rating ? `구글 평점 ${place.rating.toFixed(1)} / 5` : "",
            links: place.url ? [place.url] : [],
            placeId: place.place_id || null,
          })
        );
        await ctx.persist();
        toast(`"${place.name}" 일정에 추가됨`);
        ctx.refresh();
      }

      // 장소 상세(리뷰·사진)를 받아 인앱 시트로 표시.
      function openDetails(placeId, coord) {
        if (!placeId) {
          toast("이 장소는 구글 상세 정보가 없어요");
          return;
        }
        service.getDetails({ placeId, fields: DETAIL_FIELDS }, (d, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && d) {
            openPlaceSheet(d, {
              onAdd: (detail) => {
                const loc = detail.geometry?.location;
                addSpotFromPlace(detail, {
                  lat: loc ? loc.lat() : coord.lat,
                  lng: loc ? loc.lng() : coord.lng,
                });
              },
            });
          } else {
            toast("상세 정보를 불러오지 못했어요");
          }
        });
      }

      located.forEach((spot) => {
        const order = day.spots.indexOf(spot) + 1;
        const cat = CATEGORIES[spot.category] || CATEGORIES.etc;
        const marker = new google.maps.Marker({
          position: { lat: spot.lat, lng: spot.lng },
          map: _gmap,
          label: { text: String(order), color: "#fff", fontWeight: "700", fontSize: "12px" },
          title: spot.title || "",
          draggable: true,
        });
        marker.addListener("click", () => {
          info.setContent(
            `<div class="pp-title">${order}. ${escapeHtml(spot.title) || "(제목 없음)"}</div>` +
              `<div class="pp-meta">${cat.icon} ${cat.label}` +
              (spot.time ? ` · ${spot.time}` : "") +
              (spot.cost ? ` · ${formatCost(spot.cost)}` : "") +
              `</div>` +
              (spot.placeId
                ? `<button class="pp-btn" data-review="1">📸 리뷰·사진 보기</button>`
                : spot.links && spot.links[0]
                ? `<div style="margin-top:4px"><a href="${spot.links[0]}" target="_blank" rel="noopener">구글에서 보기 ↗</a></div>`
                : "")
          );
          info.open(_gmap, marker);
          // InfoWindow 버튼은 DOM 렌더 후 핸들러 연결.
          if (spot.placeId) {
            google.maps.event.addListenerOnce(info, "domready", () => {
              document
                .querySelector('.pp-btn[data-review="1"]')
                ?.addEventListener("click", () =>
                  openDetails(spot.placeId, { lat: spot.lat, lng: spot.lng })
                );
            });
          }
        });
        marker.addListener("dragend", async () => {
          const p = marker.getPosition();
          spot.lat = Number(p.lat().toFixed(6));
          spot.lng = Number(p.lng().toFixed(6));
          await ctx.persist();
          toast("좌표를 갱신했어요");
        });
        path.push({ lat: spot.lat, lng: spot.lng });
        bounds.extend({ lat: spot.lat, lng: spot.lng });
      });

      // 순서대로 동선 폴리라인
      if (path.length >= 2) {
        new google.maps.Polyline({
          path,
          map: _gmap,
          strokeColor: "#c8472b",
          strokeOpacity: 0.85,
          strokeWeight: 3,
        });
        _gmap.fitBounds(bounds, 48);
      }

      // ── 장소 검색 (Places Autocomplete)
      const ac = new google.maps.places.Autocomplete(searchInput, {
        fields: [
          "place_id",
          "name",
          "geometry",
          "rating",
          "user_ratings_total",
          "url",
          "formatted_address",
          "types",
        ],
      });
      ac.bindTo("bounds", _gmap);
      let tempMarker = null;
      let lastQuery = "";

      function showPlace(place) {
        const loc = place.geometry.location;
        _gmap.panTo(loc);
        _gmap.setZoom(16);
        if (tempMarker) tempMarker.setMap(null);
        tempMarker = new google.maps.Marker({
          position: loc,
          map: _gmap,
          animation: google.maps.Animation.DROP,
        });
        lastQuery = searchInput.value.trim();
        showSearchResult(place, { lat: loc.lat(), lng: loc.lng() });
      }

      // 자동완성을 안 골라도(엔터/직접 입력) 연관 결과 여러 개를 찾아 목록으로 보여준다.
      // textSearch는 오타·부정확한 검색어도 관련 장소를 잘 찾아준다(구글 검색과 동일 엔진).
      function runTextSearch(q) {
        q = (q || "").trim();
        if (!q || q === lastQuery) return;
        lastQuery = q;
        service.textSearch(
          { query: q, bounds: _gmap.getBounds() || undefined },
          (results, status) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              results &&
              results.length
            ) {
              const hits = results.filter((r) => r.geometry && r.geometry.location);
              if (hits.length === 1) showPlace(hits[0]);
              else showResultList(hits.slice(0, 5));
            } else {
              toast("검색 결과가 없어요");
            }
          }
        );
      }

      // 연관 검색 결과 목록 (구글 연관성 순). 행을 누르면 지도 이동, 각 행에서 리뷰·추가 가능.
      function showResultList(places) {
        clear(resultBox);
        const listEl = el("div.sr-list", {}, [
          el("div.sr-list-head", {}, [`연관 결과 ${places.length}곳`]),
        ]);
        places.forEach((p) => {
          const loc = p.geometry.location;
          const coord = { lat: loc.lat(), lng: loc.lng() };
          const stars = p.rating
            ? `★ ${p.rating.toFixed(1)}` +
              (p.user_ratings_total ? ` (${p.user_ratings_total.toLocaleString()})` : "")
            : "";
          listEl.appendChild(
            el("div.sr-row", { onclick: () => showPlace(p) }, [
              el("div.sr-main", {}, [
                el("div.sr-name", {}, [p.name || "이름 없음"]),
                el("div.sr-addr", {}, [
                  [stars, p.formatted_address].filter(Boolean).join(" · "),
                ]),
              ]),
              el("div.sr-actions", {}, [
                el(
                  "button.btn.sm.ghost",
                  {
                    onclick: (e) => {
                      e.stopPropagation();
                      openDetails(p.place_id, coord);
                    },
                  },
                  ["📸"]
                ),
                el(
                  "button.btn.sm.primary",
                  {
                    onclick: (e) => {
                      e.stopPropagation();
                      addSpotFromPlace(p, coord);
                    },
                  },
                  ["➕"]
                ),
              ]),
            ])
          );
        });
        resultBox.appendChild(listEl);
      }

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place && place.geometry && place.geometry.location) {
          showPlace(place);
        } else {
          // 자동완성에서 선택 안 하고 입력만 한 경우 → 텍스트 검색
          runTextSearch((place && place.name) || searchInput.value);
        }
      });
      // 엔터로도 검색 (자동완성 선택 없이)
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") setTimeout(() => runTextSearch(searchInput.value), 350);
      });
      searchInput.addEventListener("input", () => {
        lastQuery = "";
      });

      // ── 검색 결과 카드 (평점·리뷰 링크 + 일정 추가)
      function showSearchResult(place, coord) {
        clear(resultBox);
        const stars = place.rating
          ? `★ ${place.rating.toFixed(1)}` +
            (place.user_ratings_total ? ` (${place.user_ratings_total.toLocaleString()})` : "")
          : "평점 정보 없음";
        resultBox.appendChild(
          el("div.sr-card", {}, [
            el("div.sr-main", {}, [
              el("div.sr-name", {}, [place.name || "이름 없음"]),
              el("div.sr-rating", {}, [stars]),
              place.formatted_address
                ? el("div.sr-addr", {}, [place.formatted_address])
                : null,
            ]),
            el("div.sr-actions", {}, [
              el(
                "button.btn.sm.ghost",
                { onclick: () => openDetails(place.place_id, coord) },
                ["📸 리뷰·사진"]
              ),
              el(
                "button.btn.sm.primary",
                { onclick: () => addSpotFromPlace(place, coord) },
                ["➕ 일정에 추가"]
              ),
            ]),
          ])
        );
      }
    })
    .catch((e) => {
      console.warn(e);
      // 구글맵 로드 실패 시 Leaflet로 폴백.
      clear(container);
      renderLeafletMap(container, ctx);
      toast("구글맵을 불러오지 못해 기본 지도로 표시해요");
    });
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────
// Leaflet 폴백 (CartoDB · 한국어 핀)
// ─────────────────────────────────────────────
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

function renderLeafletMap(container, ctx) {
  const day = ctx.trip.schedule[ctx.dayIndex];
  const mapEl = el("div#map");
  container.appendChild(mapEl);
  container.appendChild(
    el("div.map-hint", {}, [
      "🖈 핀을 드래그하면 좌표가 갱신돼요. 선은 스팟 순서대로 이은 동선입니다.",
    ])
  );

  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  appendNoLoc(container, day.spots.filter((s) => s.lat == null || s.lng == null));

  requestAnimationFrame(() => {
    const center = centroid(located) || { lat: 35.681, lng: 139.767 };
    _map = window.L.map(mapEl, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([center.lat, center.lng], located.length ? 13 : 11);
    window.L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap · © CARTO" }
    ).addTo(_map);
    if (_map.zoomControl) {
      _map.zoomControl.setZoomInTitle?.("확대");
      _map.zoomControl.setZoomOutTitle?.("축소");
    }

    const latlngs = [];
    located.forEach((spot) => {
      const order = day.spots.indexOf(spot) + 1;
      const marker = window.L.marker([spot.lat, spot.lng], {
        draggable: true,
        icon: categoryPinIcon(spot, order),
      }).addTo(_map);

      if (spot.title) {
        marker.bindTooltip(spot.title, {
          permanent: true,
          direction: "right",
          offset: [10, -10],
          className: "pin-label",
        });
      }

      const cat = CATEGORIES[spot.category] || CATEGORIES.etc;
      marker.bindPopup(
        `<div class="pp-title">${order}. ${spot.title || "(제목 없음)"}</div>` +
          `<div class="pp-meta">${cat.icon} ${cat.label}` +
          (spot.time ? ` · ${spot.time}` : "") +
          (spot.cost ? ` · ${formatCost(spot.cost)}` : "") +
          `</div>`
      );

      marker.on("dragend", async () => {
        const ll = marker.getLatLng();
        spot.lat = Number(ll.lat.toFixed(6));
        spot.lng = Number(ll.lng.toFixed(6));
        await ctx.persist();
        toast("좌표를 갱신했어요");
      });

      latlngs.push([spot.lat, spot.lng]);
    });

    if (latlngs.length >= 2) {
      window.L.polyline(latlngs, {
        color: "#c8472b",
        weight: 3,
        opacity: 0.8,
        dashArray: "1 8",
        lineCap: "round",
      }).addTo(_map);
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
  _gmap = null; // 구글맵은 DOM 제거 시 GC됨
}
