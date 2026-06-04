// components/placeSheet.js — 구글 장소 상세를 앱 안에서 보여주는 시트.
// 사진 갤러리 + 리뷰(작성자·별점·내용, 구글 관련성 순) + "일정에 추가".
import { el, clear } from "../util.js";

function stars(rating) {
  if (!rating) return "평점 없음";
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full)) + ` ${rating.toFixed(1)}`;
}

// openPlaceSheet(detail, { onAdd(detail) })
// detail: google PlaceResult (name, rating, user_ratings_total, photos[], reviews[],
//          formatted_address, opening_hours, url, geometry ...)
export function openPlaceSheet(detail, opts = {}) {
  const backdrop = el("div.sheet-backdrop");
  const sheet = el("div.sheet.place-sheet");
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => backdrop.remove(), 280);
  };
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  // 사진 갤러리 (가로 스크롤)
  const photos = (detail.photos || []).slice(0, 10);
  const gallery = photos.length
    ? el(
        "div.ps-photos",
        {},
        photos.map((p) =>
          el("img", {
            src: p.getUrl ? p.getUrl({ maxWidth: 480, maxHeight: 360 }) : p,
            loading: "lazy",
          })
        )
      )
    : null;

  // 영업시간
  const hours =
    detail.opening_hours && detail.opening_hours.weekday_text
      ? el(
          "details.ps-hours",
          {},
          [
            el("summary", {}, [
              detail.opening_hours.isOpen?.() === false ? "영업 정보" : "영업시간",
            ]),
            el(
              "div",
              {},
              detail.opening_hours.weekday_text.map((t) => el("div", {}, [t]))
            ),
          ]
        )
      : null;

  // 리뷰 목록 (구글 관련성 순 — getDetails 기본 정렬)
  const reviews = detail.reviews || [];
  const reviewEls = reviews.map((r) =>
    el("div.ps-review", {}, [
      el("div.ps-rv-head", {}, [
        r.profile_photo_url
          ? el("img.ps-rv-ava", { src: r.profile_photo_url, loading: "lazy" })
          : el("div.ps-rv-ava.ph", {}, [(r.author_name || "?")[0]]),
        el("div", {}, [
          el("div.ps-rv-author", {}, [r.author_name || "익명"]),
          el("div.ps-rv-meta", {}, [
            `${stars(r.rating)} · ${r.relative_time_description || ""}`,
          ]),
        ]),
      ]),
      r.text ? el("div.ps-rv-text", {}, [r.text]) : null,
    ])
  );

  sheet.appendChild(
    el("header", {}, [
      el("h3", {}, [detail.name || "장소"]),
      el("button.icon-btn", { title: "닫기", onclick: close }, ["✕"]),
    ])
  );

  sheet.appendChild(
    el("div.sheet-body", {}, [
      el("div.ps-rating", {}, [
        stars(detail.rating),
        detail.user_ratings_total
          ? el("span.ps-count", {}, [
              ` 리뷰 ${detail.user_ratings_total.toLocaleString()}개`,
            ])
          : null,
      ]),
      detail.formatted_address
        ? el("div.ps-addr", {}, ["📍 " + detail.formatted_address])
        : null,
      gallery,
      hours,
      reviews.length
        ? el("div.ps-reviews", {}, [
            el("div.ps-section", {}, ["리뷰 (구글 관련성 순)"]),
            ...reviewEls,
            el("div.ps-attrib", {}, [
              "리뷰·사진 출처: Google · ",
              detail.url
                ? el("a", { href: detail.url, target: "_blank", rel: "noopener" }, [
                    "구글 지도에서 더 보기 ↗",
                  ])
                : "",
            ]),
          ])
        : el("div.ps-empty", {}, ["표시할 리뷰가 없어요."]),
    ])
  );

  sheet.appendChild(
    el("footer", {}, [
      el("button.btn.ghost", { onclick: close }, ["닫기"]),
      el("div.spacer"),
      el(
        "button.btn.primary",
        {
          onclick: () => {
            opts.onAdd?.(detail);
            close();
          },
        },
        ["➕ 일정에 추가"]
      ),
    ])
  );

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    sheet.classList.add("open");
  });
  return { close };
}
