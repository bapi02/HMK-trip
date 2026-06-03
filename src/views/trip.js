// views/trip.js — 여행 상세. 헤더 + 합계 + 뷰 토글(타임라인/지도) + Day 탭 + 콘텐츠.
// Day 탭은 스팟을 다른 날로 끌어 옮기는 드롭 타깃이기도 하다.
import { el, clear, toast, confirmAction } from "../util.js";
import {
  totalCost,
  totalMoveMin,
  formatCost,
  addDays,
} from "../model.js";
import { formatMin } from "../geo.js";
import { renderTimeline } from "./timeline.js";
import { renderMap, disposeMap } from "./map.js";
import { navigate } from "../main.js";

export async function renderTrip(root, store, tripId) {
  clear(root);

  const state = {
    trip: null,
    view: "timeline", // "timeline" | "map"
    dayIndex: 0,
    suppress: 0, // 자기 저장으로 인한 subscribe 콜백 무시 카운터
    unsub: null,
  };

  // 화면 이탈 시 구독 해제 + 지도 정리.
  root._cleanup = () => {
    state.unsub?.();
    disposeMap();
  };

  // 저장: 자기 저장은 subscribe 재렌더를 막아 지도/스크롤 튐 방지.
  async function persist() {
    state.suppress++;
    await store.saveTrip(state.trip);
  }

  const ctx = {
    get trip() {
      return state.trip;
    },
    get dayIndex() {
      return state.dayIndex;
    },
    persist,
    refresh: () => renderAll(),
  };

  // 콘텐츠(타임라인/지도) 영역만 다시 그린다.
  const content = el("div.trip-content");

  function renderContent() {
    if (state.view === "map") {
      renderMap(content, ctx);
    } else {
      disposeMap();
      renderTimeline(content, ctx);
    }
  }

  // 전체 다시 그리기 (헤더·합계·탭·콘텐츠). view/dayIndex는 보존.
  function renderAll() {
    if (!state.trip) return;
    const trip = state.trip;
    if (state.dayIndex >= trip.schedule.length)
      state.dayIndex = trip.schedule.length - 1;
    if (state.dayIndex < 0) state.dayIndex = 0;

    clear(root);

    // 헤더
    root.appendChild(
      el("div.trip-head", {}, [
        el(
          "a.back",
          {
            href: "#/",
            onclick: (e) => {
              e.preventDefault();
              navigate("/");
            },
          },
          ["← 보관함"]
        ),
        el("h1", {}, [trip.title]),
        el("div.sub", {}, [
          el("span", {}, [trip.destination || "목적지 미정"]),
          el("span", {}, [
            trip.startDate ? `${trip.startDate} 시작` : "날짜 미정",
          ]),
          el("span", {}, [`${trip.days}일`]),
          el(
            "button.btn.sm.ghost",
            { onclick: () => openTripSettings() },
            ["⚙ 설정"]
          ),
        ]),
      ])
    );

    // 합계 바 (여행 전체)
    root.appendChild(
      el("div.summary-bar", {}, [
        stat("총 예상 비용", formatCost(totalCost(trip))),
        stat("총 이동시간", formatMin(totalMoveMin(trip)) || "0분"),
        stat("스팟 수", String(trip.schedule.reduce((n, d) => n + d.spots.length, 0))),
      ])
    );

    // 뷰 토글 + Day 탭
    root.appendChild(
      el("div.toolbar", {}, [
        el("div.toggle", {}, [
          el(
            "button" + (state.view === "timeline" ? ".active" : ""),
            {
              onclick: () => {
                state.view = "timeline";
                renderAll();
              },
            },
            ["📋 타임라인"]
          ),
          el(
            "button" + (state.view === "map" ? ".active" : ""),
            {
              onclick: () => {
                state.view = "map";
                renderAll();
              },
            },
            ["🗺 지도"]
          ),
        ]),
      ])
    );

    root.appendChild(renderTabs());
    root.appendChild(content);
    renderContent();
  }

  function stat(k, v) {
    return el("div.stat", {}, [el("div.k", {}, [k]), el("div.v", {}, [v])]);
  }

  // Day 탭 — 선택 + 다른 날로 스팟 드롭 타깃.
  function renderTabs() {
    const tabs = el("div.day-tabs");
    state.trip.schedule.forEach((day, i) => {
      const tab = el(
        "button.day-tab" + (i === state.dayIndex ? ".active" : ""),
        {
          dataset: { day: String(i) },
          onclick: () => {
            state.dayIndex = i;
            renderAll();
          },
        },
        [
          el("span.d", {}, [`D${i + 1}`]),
          el("span", {}, [
            "  " +
              (day.label ? day.label.replace(/^Day\s*\d+\s*·?\s*/, "") : "") ,
          ]),
          el("span", {}, [`  (${day.spots.length})`]),
        ]
      );

      // 드롭 타깃: 다른 Day에서 끌어온 스팟을 이 Day로 이동.
      if (window.Sortable) {
        window.Sortable.create(tab, {
          group: { name: "spots", pull: false, put: true },
          sort: false,
          onAdd: async (evt) => {
            const id = evt.item.dataset.id;
            evt.item.remove(); // 실제 DOM은 refresh가 다시 만든다.
            moveSpotToDay(id, i);
          },
          onDragOver: () => {},
        });
        // 드래그 중 시각 피드백
        tab.addEventListener("dragenter", () => tab.classList.add("drag-over"));
        tab.addEventListener("dragleave", () => tab.classList.remove("drag-over"));
      }
      tabs.appendChild(tab);
    });
    return tabs;
  }

  async function moveSpotToDay(spotId, targetDayIdx) {
    let moved = null;
    for (const day of state.trip.schedule) {
      const idx = day.spots.findIndex((s) => s.id === spotId);
      if (idx >= 0) {
        moved = day.spots.splice(idx, 1)[0];
        break;
      }
    }
    if (!moved) return;
    state.trip.schedule[targetDayIdx].spots.push(moved);
    await persist();
    toast(`Day ${targetDayIdx + 1}로 옮겼어요`);
    renderAll();
  }

  // ── 여행 설정 모달 (제목·목적지·날짜·기간·커버 + Day 라벨)
  function openTripSettings() {
    const trip = state.trip;
    const draft = {
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      days: trip.days,
      cover: trip.cover,
    };
    const backdrop = el("div.modal-backdrop");
    const close = () => {
      backdrop.classList.remove("open");
      setTimeout(() => backdrop.remove(), 200);
    };
    const modal = el("div.modal", {}, [
      el("header", {}, [el("h3", {}, ["여행 설정"])]),
      el("div.modal-body", {}, [
        el("div.field", {}, [
          el("label", {}, ["제목"]),
          el("input", {
            type: "text",
            value: draft.title,
            oninput: (e) => (draft.title = e.target.value),
          }),
        ]),
        el("div.field", {}, [
          el("label", {}, ["목적지"]),
          el("input", {
            type: "text",
            value: draft.destination,
            oninput: (e) => (draft.destination = e.target.value),
          }),
        ]),
        el("div.field-row", {}, [
          el("div.field", {}, [
            el("label", {}, ["시작일"]),
            el("input", {
              type: "date",
              value: draft.startDate || "",
              oninput: (e) => (draft.startDate = e.target.value),
            }),
          ]),
          el("div.field", {}, [
            el("label", {}, ["기간 (일)"]),
            el("input", {
              type: "number",
              min: "1",
              max: "30",
              value: String(draft.days),
              oninput: (e) =>
                (draft.days = Math.max(1, Number(e.target.value) || 1)),
            }),
          ]),
        ]),
        el("div.field", {}, [
          el("label", {}, ["커버 이미지 URL"]),
          el("input", {
            type: "url",
            value: draft.cover || "",
            oninput: (e) => (draft.cover = e.target.value),
          }),
        ]),
      ]),
      el("footer", {}, [
        el(
          "button.btn.ghost.danger",
          {
            onclick: async () => {
              if (!confirmAction(`"${trip.title}" 여행을 삭제할까요?`)) return;
              close();
              await store.deleteTrip(trip.id);
              navigate("/");
            },
          },
          ["여행 삭제"]
        ),
        el("div.spacer"),
        el("button.btn.ghost", { onclick: close }, ["취소"]),
        el(
          "button.btn.primary",
          {
            onclick: async () => {
              applyTripSettings(draft);
              close();
            },
          },
          ["저장"]
        ),
      ]),
    ]);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("open"));
  }

  async function applyTripSettings(draft) {
    const trip = state.trip;
    trip.title = draft.title.trim() || "새 여행";
    trip.destination = draft.destination.trim();
    trip.cover = draft.cover.trim();
    const oldStart = trip.startDate;
    trip.startDate = draft.startDate;

    // 기간 변경: 늘면 빈 Day 추가, 줄면 뒤 Day 제거(스팟 있으면 확인).
    const newDays = draft.days;
    if (newDays > trip.schedule.length) {
      for (let i = trip.schedule.length; i < newDays; i++) {
        trip.schedule.push({
          date: trip.startDate ? addDays(trip.startDate, i) : "",
          label: `Day ${i + 1}`,
          spots: [],
        });
      }
    } else if (newDays < trip.schedule.length) {
      const dropped = trip.schedule.slice(newDays);
      const hasSpots = dropped.some((d) => d.spots.length);
      if (
        hasSpots &&
        !confirmAction("줄인 날짜의 스팟이 삭제됩니다. 계속할까요?")
      ) {
        return; // 취소
      }
      trip.schedule = trip.schedule.slice(0, newDays);
    }
    trip.days = newDays;

    // 시작일 바뀌면 각 Day 날짜 재계산 (라벨은 유지).
    if (trip.startDate && trip.startDate !== oldStart) {
      trip.schedule.forEach((day, i) => {
        day.date = addDays(trip.startDate, i);
      });
    }

    await persist();
    renderAll();
  }

  // ── 데이터 구독 (firebase=onSnapshot, local=즉시 1회 + 저장 시)
  state.unsub = store.subscribe(tripId, (trip) => {
    if (!trip) {
      // 삭제됨 → 보관함으로
      clear(root);
      root.appendChild(
        el("div.loading", {}, ["여행을 찾을 수 없어요. 보관함으로 이동합니다…"])
      );
      setTimeout(() => navigate("/"), 900);
      return;
    }
    // 자기 저장으로 인한 콜백은 렌더 생략 (상태만 갱신).
    if (state.suppress > 0) {
      state.suppress--;
      state.trip = trip;
      return;
    }
    state.trip = trip;
    renderAll();
  });
}
