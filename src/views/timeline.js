// views/timeline.js — Day별 타임라인. 스팟 카드 + 드래그 순서 변경 + 이동 정보.
import { el, clear, confirmAction, toast } from "../util.js";
import { spotCard, moveRow } from "../components/spotCard.js";
import { openSpotEditor } from "../components/spotEditor.js";
import {
  newSpot,
  dayCost,
  dayMoveMin,
  formatCost,
  uid,
  pickedSpotId,
} from "../model.js";
import { estimateMoveMin, haversineKm, formatKm, formatMin } from "../geo.js";
import { hasGoogleMaps } from "../mapsConfig.js";
import {
  renderHotelSelector,
  computeHotelTimes,
  pickHotelId,
  dirUrl,
} from "./hotelRoutes.js";

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

  // 기준 숙소 선택 바 (구글맵 키 있을 때만)
  const hotelMode = hasGoogleMaps();
  const hotelId = hotelMode ? pickHotelId(day) : null;
  const selector = renderHotelSelector(ctx);
  if (selector) container.appendChild(selector);

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

  // "숙소에서 X분" 줄을 계산 결과로 채운다.
  function fillFromRow(row, r, hotel, spot) {
    clear(row);
    row.appendChild(el("span.rail"));
    if (r.error) {
      const hint =
        r.error === "REQUEST_DENIED"
          ? "키 제한 또는 API 미설정"
          : r.error === "OVER_QUERY_LIMIT"
          ? "할당량 초과/결제 확인"
          : r.error === "ZERO_RESULTS"
          ? "경로 없음"
          : "";
      row.appendChild(
        el("span.sf-text.err", {}, [
          `🚩 출발 기준 길찾기 실패 (${r.error}${hint ? " · " + hint : ""})`,
        ])
      );
      return;
    }
    const o = { lat: hotel.lat, lng: hotel.lng };
    const d = { lat: spot.lat, lng: spot.lng };

    const chips = [el("span.sf-from", {}, ["🚩 출발 기준에서"])];
    // 택시(차량): 항상 표기
    if (r.driveMin != null) {
      chips.push(
        el(
          "a.sf-mode.drive",
          { href: dirUrl(o, d, "driving"), target: "_blank", rel: "noopener", title: "택시 길찾기" },
          [`🚕 ${r.driveText}`]
        )
      );
    }
    // 지하철(대중교통): 가장 빠른 시간. 경로 없으면 — 로 표기하되 눌러서 길찾기 가능.
    if (r.transitMin != null) {
      chips.push(
        el(
          "a.sf-mode.transit",
          { href: dirUrl(o, d, "transit"), target: "_blank", rel: "noopener", title: "지하철 길찾기" },
          [`🚇 ${r.transitText}`]
        )
      );
    } else {
      chips.push(
        el(
          "a.sf-mode.transit.muted",
          { href: dirUrl(o, d, "transit"), target: "_blank", rel: "noopener", title: "지하철 길찾기 열기" },
          ["🚇 —"]
        )
      );
    }
    row.appendChild(el("span.sf-modes", {}, chips));
  }

  // "🏨 숙소에서 …" 자리표시 줄 (비동기로 채워짐).
  function fromPlaceholder(spotId) {
    return el("div.spot-from", { dataset: { from: spotId } }, [
      el("span.rail"),
      el("span.sf-text", {}, ["🚩 출발 기준에서 이동시간 계산 중…"]),
    ]);
  }

  // 이 스팟을 윗 스팟과 "택1 선택지"로 묶기.
  async function groupWithPrev(spot) {
    const idx = day.spots.findIndex((s) => s.id === spot.id);
    if (idx <= 0) {
      toast("위에 묶을 스팟이 없어요");
      return;
    }
    const prev = day.spots[idx - 1];
    if (prev.id === hotelId) {
      toast("출발 기준 스팟은 선택지로 묶을 수 없어요");
      return;
    }
    const gid = prev.groupId || spot.groupId || uid("grp");
    prev.groupId = gid;
    spot.groupId = gid;
    const members = day.spots.filter((s) => s.groupId === gid);
    if (!members.some((s) => s.picked)) members[0].picked = true;
    await ctx.persist();
    ctx.refresh();
  }

  // 선택지에서 빼기.
  async function ungroup(spot) {
    const gid = spot.groupId;
    spot.groupId = null;
    spot.picked = false;
    const rest = day.spots.filter((s) => s.groupId === gid);
    if (rest.length === 1) {
      rest[0].groupId = null;
      rest[0].picked = false;
    } else if (rest.length && !rest.some((s) => s.picked)) {
      rest[0].picked = true;
    }
    await ctx.persist();
    ctx.refresh();
  }

  // 그룹에서 이 후보를 선택(실제 갈 곳).
  async function pick(spot) {
    const gid = spot.groupId;
    day.spots.forEach((s) => {
      if (s.groupId === gid) s.picked = s.id === spot.id;
    });
    await ctx.persist();
    ctx.refresh();
  }

  // 한 그룹(택1 선택지) 클러스터 렌더.
  function renderCluster(members) {
    const pid = pickedSpotId(day, members[0].groupId);
    const cluster = el("li.choice-cluster", {}, [
      el("div.cc-head", {}, [
        el("span", {}, ["🔀 이동 선택지"]),
        el("span.cc-sub", {}, [`${members.length}곳 중 택1`]),
      ]),
    ]);
    members.forEach((m) => {
      const picked = m.id === pid;
      const body = el("div.ci-body");
      if (m.lat != null && m.lng != null && hotelId && m.id !== hotelId) {
        body.appendChild(fromPlaceholder(m.id));
      }
      body.appendChild(
        spotCard(m, {
          onEdit: editSpot,
          onDelete: deleteSpot,
          extraActions: [
            { icon: "⎇", title: "선택지에서 빼기", onClick: () => ungroup(m) },
          ],
        })
      );
      cluster.appendChild(
        el("div.choice-item" + (picked ? ".picked" : ""), {}, [
          el(
            "button.pick-radio",
            { title: picked ? "선택됨" : "이걸로 선택", onclick: () => pick(m) },
            [picked ? "◉" : "○"]
          ),
          body,
        ])
      );
    });
    return cluster;
  }

  if (hotelMode) {
    // 숙소 기준 모드: 그룹은 클러스터로, 나머지는 개별 + 숙소 기준 시간.
    const renderedGroups = new Set();
    day.spots.forEach((spot) => {
      if (spot.groupId) {
        if (renderedGroups.has(spot.groupId)) return;
        renderedGroups.add(spot.groupId);
        list.appendChild(
          renderCluster(day.spots.filter((s) => s.groupId === spot.groupId))
        );
        return;
      }
      if (spot.id === hotelId) {
        list.appendChild(
          el("li.hotel-base", {}, ["🚩 출발 기준 · 여기서 각 스팟까지 이동시간"])
        );
      } else if (spot.lat != null && spot.lng != null && hotelId) {
        list.appendChild(fromPlaceholder(spot.id));
      }
      const idx = day.spots.findIndex((s) => s.id === spot.id);
      const canGroup = idx > 0 && day.spots[idx - 1].id !== hotelId;
      list.appendChild(
        spotCard(spot, {
          onEdit: editSpot,
          onDelete: deleteSpot,
          extraActions: canGroup
            ? [{ icon: "⎇", title: "윗 스팟과 선택지로 묶기", onClick: () => groupWithPrev(spot) }]
            : [],
        })
      );
    });
  } else {
    // 폴백(키 없음): 이전 스팟 → 이 스팟 직선거리 어림치
    day.spots.forEach((spot, i) => {
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
  }

  container.appendChild(list);

  // 숙소 기준 이동시간 비동기 계산 후 각 줄에 채우기.
  if (hotelMode && hotelId) {
    const located = day.spots.filter((s) => s.lat != null && s.lng != null);
    const hotel = located.find((s) => s.id === hotelId);
    if (hotel && located.length >= 2) {
      computeHotelTimes(day, hotelId)
        .then((map) => {
          map.forEach((r, spotId) => {
            const row = list.querySelector(`.spot-from[data-from="${spotId}"]`);
            if (!row) return;
            const spot = day.spots.find((s) => s.id === spotId);
            fillFromRow(row, r, hotel, spot);
          });
        })
        .catch(() => {});
    }
  }

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
      filter: ".spot-move, .spot-from, .hotel-base",
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
