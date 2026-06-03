// components/spotEditor.js — 스팟 편집 사이드 시트(모바일=바텀 시트).
// 사진 URL·참고 링크 여러 개, 카테고리 컬러 피커, 좌표 직접 입력.
import { el, clear } from "../util.js";
import { CATEGORIES, CATEGORY_KEYS, MOVE_MODES } from "../model.js";

// openSpotEditor(spot, { onSave(updatedSpot), title })
export function openSpotEditor(spot, opts = {}) {
  // 편집용 복사본 — 취소 시 원본 유지.
  const draft = JSON.parse(JSON.stringify(spot));
  draft.links = draft.links || [];
  draft.photos = draft.photos || [];

  const backdrop = el("div.sheet-backdrop");
  const sheet = el("div.sheet");
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  function close() {
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => backdrop.remove(), 280);
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  // ── 카테고리 피커
  const catPicker = el("div.cat-picker");
  function renderCats() {
    clear(catPicker);
    CATEGORY_KEYS.forEach((key) => {
      const c = CATEGORIES[key];
      const active = draft.category === key;
      catPicker.appendChild(
        el(
          "button.cat-opt" + (active ? ".active" : ""),
          {
            type: "button",
            style: active ? { background: c.color } : {},
            onclick: () => {
              draft.category = key;
              renderCats();
            },
          },
          [`${c.icon} ${c.label}`]
        )
      );
    });
  }
  renderCats();

  // ── 이동수단 셀렉트
  const moveSelect = el("select", {
    onchange: (e) => (draft.moveMode = e.target.value),
  });
  Object.entries(MOVE_MODES).forEach(([key, m]) => {
    const o = el("option", { value: key }, [
      key === "" ? "이동수단 없음" : `${m.icon} ${m.label}`,
    ]);
    if (draft.moveMode === key) o.selected = true;
    moveSelect.appendChild(o);
  });

  // ── 링크 목록 (여러 개)
  const linksWrap = el("div.chip-list");
  function renderLinks() {
    clear(linksWrap);
    draft.links.forEach((url, i) => {
      linksWrap.appendChild(
        el("div.chip-row", {}, [
          el("input", {
            type: "url",
            value: url,
            placeholder: "https://…",
            oninput: (e) => (draft.links[i] = e.target.value),
          }),
          el(
            "button.icon-btn",
            {
              type: "button",
              title: "삭제",
              onclick: () => {
                draft.links.splice(i, 1);
                renderLinks();
              },
            },
            ["✕"]
          ),
        ])
      );
    });
    linksWrap.appendChild(
      el(
        "button.add-chip",
        {
          type: "button",
          onclick: () => {
            draft.links.push("");
            renderLinks();
          },
        },
        ["+ 링크 추가"]
      )
    );
  }
  renderLinks();

  // ── 사진 URL 목록 (여러 개) + 썸네일
  const photosWrap = el("div.chip-list");
  const thumbsWrap = el("div.thumbs-edit");
  function renderThumbs() {
    clear(thumbsWrap);
    draft.photos.forEach((src, i) => {
      if (!src) return;
      thumbsWrap.appendChild(
        el("div.t", {}, [
          el("img", { src }),
          el(
            "button",
            {
              type: "button",
              title: "삭제",
              onclick: () => {
                draft.photos.splice(i, 1);
                renderPhotos();
              },
            },
            ["✕"]
          ),
        ])
      );
    });
  }
  function renderPhotos() {
    clear(photosWrap);
    photosWrap.appendChild(
      el("div.chip-row", {}, [
        el("input", {
          type: "url",
          placeholder: "사진 URL 붙여넣고 Enter",
          onkeydown: (e) => {
            if (e.key === "Enter" && e.target.value.trim()) {
              draft.photos.push(e.target.value.trim());
              e.target.value = "";
              renderPhotos();
            }
          },
        }),
      ])
    );
    photosWrap.appendChild(thumbsWrap);
    renderThumbs();
  }
  renderPhotos();

  // ── 본문 폼
  const body = el("div.sheet-body", {}, [
    el("div.field-row", {}, [
      el("div.field", {}, [
        el("label", {}, ["시간"]),
        el("input", {
          type: "time",
          value: draft.time || "",
          oninput: (e) => (draft.time = e.target.value),
        }),
      ]),
      el("div.field", {}, [
        el("label", {}, ["예상 비용 (¥)"]),
        el("input", {
          type: "number",
          min: "0",
          value: draft.cost ?? "",
          placeholder: "0",
          oninput: (e) =>
            (draft.cost = e.target.value === "" ? null : Number(e.target.value)),
        }),
      ]),
    ]),
    el("div.field", {}, [
      el("label", {}, ["장소 이름"]),
      el("input", {
        type: "text",
        value: draft.title || "",
        placeholder: "예: 센소지",
        oninput: (e) => (draft.title = e.target.value),
      }),
    ]),
    el("div.field", {}, [el("label", {}, ["카테고리"]), catPicker]),
    el("div.field", {}, [
      el("label", {}, ["메모"]),
      el("textarea", {
        placeholder: "예약·팁·주의사항 등",
        oninput: (e) => (draft.memo = e.target.value),
        text: draft.memo || "",
      }),
    ]),
    el("div.field-row", {}, [
      el("div.field", {}, [
        el("label", {}, ["이동수단 (이전 스팟→여기)"]),
        moveSelect,
      ]),
      el("div.field", {}, [
        el("label", {}, ["이동시간 (분)"]),
        el("input", {
          type: "number",
          min: "0",
          value: draft.moveMin ?? "",
          placeholder: "자동 추정 보조",
          oninput: (e) =>
            (draft.moveMin =
              e.target.value === "" ? null : Number(e.target.value)),
        }),
      ]),
    ]),
    el("div.field-row", {}, [
      el("div.field", {}, [
        el("label", {}, ["위도 (lat)"]),
        el("input", {
          type: "number",
          step: "any",
          value: draft.lat ?? "",
          placeholder: "예: 35.7148",
          oninput: (e) =>
            (draft.lat = e.target.value === "" ? null : Number(e.target.value)),
        }),
      ]),
      el("div.field", {}, [
        el("label", {}, ["경도 (lng)"]),
        el("input", {
          type: "number",
          step: "any",
          value: draft.lng ?? "",
          placeholder: "예: 139.7967",
          oninput: (e) =>
            (draft.lng = e.target.value === "" ? null : Number(e.target.value)),
        }),
      ]),
    ]),
    el("div.coord-hint", {}, [
      "좌표는 지도 뷰에서 핀을 드래그해 채울 수도 있어요.",
    ]),
    el("div.field", {}, [el("label", {}, ["참고 링크"]), linksWrap]),
    el("div.field", {}, [el("label", {}, ["사진"]), photosWrap]),
  ]);

  sheet.appendChild(
    el("header", {}, [
      el("h3", {}, [opts.title || "스팟 편집"]),
      el("button.icon-btn", { title: "닫기", onclick: close }, ["✕"]),
    ])
  );
  sheet.appendChild(body);
  sheet.appendChild(
    el("footer", {}, [
      el("button.btn.ghost", { onclick: close }, ["취소"]),
      el("div.spacer"),
      el(
        "button.btn.primary",
        {
          onclick: () => {
            // 빈 링크 정리
            draft.links = draft.links.filter((l) => l && l.trim());
            opts.onSave?.(draft);
            close();
          },
        },
        ["저장"]
      ),
    ])
  );

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    sheet.classList.add("open");
  });

  return { close };
}
