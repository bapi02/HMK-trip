// components/spotCard.js — 타임라인의 스팟 카드 한 개 렌더링.
import { el } from "../util.js";
import { CATEGORIES, MOVE_MODES, formatCost, formatYen } from "../model.js";
import { formatMin } from "../geo.js";

// spot: Spot, opts: { onEdit, onDelete }
export function spotCard(spot, opts = {}) {
  const cat = CATEGORIES[spot.category] || CATEGORIES.etc;

  const badges = [];
  if (spot.cost != null && spot.cost !== "") {
    badges.push(
      el("span.b.cost", {}, [
        formatCost(spot.cost),
        el("span.yen", {}, [` ${formatYen(spot.cost)}`]),
      ])
    );
  }
  if (spot.lat == null || spot.lng == null) {
    badges.push(el("span.b.noloc", {}, ["위치 미지정"]));
  }
  if (spot.links && spot.links.length) {
    badges.push(el("span.b", {}, [`🔗 ${spot.links.length}`]));
  }

  const main = el("div.main", {}, [
    el("div.title-row", {}, [
      el("span.title", {}, [spot.title || "(제목 없음)"]),
      el("span.cat-chip", { style: { background: cat.color } }, [
        `${cat.icon} ${cat.label}`,
      ]),
    ]),
    spot.memo ? el("div.memo", {}, [spot.memo]) : null,
    badges.length ? el("div.badges", {}, badges) : null,
    spot.photos && spot.photos.length
      ? el(
          "div.thumbs",
          {},
          spot.photos.slice(0, 4).map((src) => el("img", { src, loading: "lazy" }))
        )
      : null,
  ]);

  const card = el(
    "li.spot-card",
    { style: { "--cat": cat.color }, dataset: { id: spot.id } },
    [
      el("div.handle", { title: "드래그로 이동" }, ["⠿"]),
      el(
        "div.time" + (spot.time ? "" : ".empty"),
        {},
        [spot.time || "--:--"]
      ),
      main,
      el("div.row-actions", {}, [
        el(
          "button.icon-btn",
          { title: "편집", onclick: () => opts.onEdit?.(spot) },
          ["✏️"]
        ),
        el(
          "button.icon-btn",
          { title: "삭제", onclick: () => opts.onDelete?.(spot) },
          ["🗑"]
        ),
      ]),
    ]
  );
  return card;
}

// 이전 스팟 → 이 스팟 이동 정보 줄 (거리/시간/수단).
// info: { moveMode, moveMin, estMin, km }
export function moveRow(info) {
  const mode = MOVE_MODES[info.moveMode] || MOVE_MODES[""];
  const parts = [];
  if (info.moveMode) parts.push(`${mode.icon} ${mode.label}`);
  if (info.moveMin != null) parts.push(formatMin(info.moveMin));
  const manual = parts.join(" · ");

  const bits = [el("span.rail")];
  if (manual) bits.push(el("span", {}, [manual]));
  if (info.estMin != null) {
    bits.push(
      el("span.est", { title: "직선거리 기반 어림치(정밀 라우팅은 추후)" }, [
        `≈ ${formatMin(info.estMin)}${info.km != null ? ` · ${info.kmLabel}` : ""} 예상`,
      ])
    );
  }
  if (bits.length === 1) return null; // 정보 없음
  return el("div.spot-move", {}, bits);
}
