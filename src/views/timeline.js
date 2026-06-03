// views/timeline.js — Day별 타임라인. 스팟 카드 + 드래그 순서 변경 + 이동 정보.
import { el, clear, confirmAction, toast } from "../util.js";
import { spotCard, moveRow } from "../components/spotCard.js";
import { openSpotEditor } from "../components/spotEditor.js";
import {
  newSpot,
  dayCost,
  dayMoveMin,
  formatCost,
} from "../model.js";
import { estimateMoveMin, haversineKm, formatKm, formatMin } from "../geo.js";

// ctx: { trip, dayIndex, persist(), refresh() }
export function renderTimeline(container, ctx) {
  clear(container);
  const day = ctx.trip.schedule[ctx.dayIndex];
  if (!day) {
    container.appendChild(el("div.empty-day", {}, ["일정이 없습니다."]));
    return;
  }

  // Day 헤더 + 합계
  container.appendChild(
    el("div.day-meta", {}, [
      el("h2", {}, [day.label || `Day ${ctx.dayIndex + 1}`]),
      day.date ? el("span.date", {}, [day.date]) : null,
      el("div.totals", {}, [
        el("span", {}, [`💴 ${formatCost(dayCost(day))}`]),
        el("span", {}, [`⏱ ${formatMin(dayMoveMin(day)) || "0분"}`]),
      ]),
    ])
  );

  const list = el("ul.spot-list");

  if (day.spots.length === 0) {
    container.appendChild(
      el("div.empty-day", {}, ["아직 스팟이 없어요. 아래에서 추가해보세요."])
    );
  }

  // 스팟 편집 핸들러
  function editSpot(spot) {
    openSpotEditor(spot, {
      title: "스팟 편집",
      onSave: async (updated) => {
        const idx = day.spots.findIndex((s) => s.id === spot.id);
        if (idx >= 0) day.spots[idx] = updated;
        await ctx.persist();
        ctx.refresh();
      },
    });
  }

  async function deleteSpot(spot) {
    if (!confirmAction(`"${spot.title}" 스팟을 삭제할까요?`)) return;
    const idx = day.spots.findIndex((s) => s.id === spot.id);
    if (idx >= 0) day.spots.splice(idx, 1);
    await ctx.persist();
    ctx.refresh();
  }

  day.spots.forEach((spot, i) => {
    // 이전 스팟 → 이 스팟 이동 정보 (index 0 제외)
    if (i > 0) {
      const prev = day.spots[i - 1];
      const km = haversineKm(prev, spot);
      const est = estimateMoveMin(prev, spot, spot.moveMode);
      const row = moveRow({
        moveMode: spot.moveMode,
        moveMin: spot.moveMin,
        estMin: est,
        km,
        kmLabel: formatKm(km),
      });
      if (row) list.appendChild(row);
    }
    list.appendChild(spotCard(spot, { onEdit: editSpot, onDelete: deleteSpot }));
  });

  container.appendChild(list);

  // 스팟 추가 버튼
  container.appendChild(
    el(
      "button.add-spot-btn",
      {
        onclick: () => {
          const spot = newSpot({ title: "" });
          openSpotEditor(spot, {
            title: "새 스팟",
            onSave: async (updated) => {
              day.spots.push(updated);
              await ctx.persist();
              ctx.refresh();
            },
          });
        },
      },
      ["＋ 스팟 추가"]
    )
  );

  // 드래그 순서 변경 (SortableJS, 핸들 기준). 끝나면 DOM 순서로 데이터 재정렬.
  if (window.Sortable) {
    window.Sortable.create(list, {
      handle: ".handle",
      animation: 160,
      group: { name: "spots", pull: true, put: true },
      filter: ".spot-move",
      draggable: ".spot-card",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: async (evt) => {
        // 같은 리스트 내 이동만 여기서 처리 (다른 Day로의 이동은 tab onAdd가 처리).
        if (evt.from !== evt.to) return;
        const ids = Array.from(list.querySelectorAll(".spot-card")).map(
          (li) => li.dataset.id
        );
        day.spots.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        await ctx.persist();
        ctx.refresh();
      },
    });
  }

  // 다른 Day로 끌어와 놓는 경우(=다른 리스트에서 이 Day로): trip.js의 탭 드롭이 처리하므로
  // 여기서는 별도 onAdd 불필요. (탭이 더 큰 드롭 타깃)
}
