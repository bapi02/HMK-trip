// views/library.js — 보관함: 여행 카드 그리드 + 새로 만들기 / 복제 / 삭제.
import { el, clear, toast, confirmAction } from "../util.js";
import {
  newTrip,
  cloneTrip,
  totalCost,
  formatCost,
  CATEGORIES,
} from "../model.js";
import { navigate } from "../main.js";

function fmtRange(trip) {
  if (!trip.startDate) return `${trip.days}일 · 날짜 미정`;
  const start = new Date(trip.startDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + (trip.days - 1));
  const f = (d) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${f(start)} – ${f(end)} · ${trip.days}일`;
}

function tripCard(trip, { onClone, onDelete }) {
  const cover = trip.cover
    ? el("div.cover", { style: { backgroundImage: `url('${trip.cover}')` } }, [
        el("span.days-chip", {}, [`${trip.days}일`]),
      ])
    : el("div.cover.empty", {}, ["旅"]);

  const card = el("article.trip-card", {}, [
    cover,
    el("div.body", {}, [
      el("h3", {}, [trip.title]),
      el("div.meta", {}, [
        el("span", {}, [trip.destination || "목적지 미정"]),
        el("span.dot", {}, ["·"]),
        el("span", {}, [fmtRange(trip)]),
      ]),
      el("div.meta", {}, [
        el("span", {}, [`예상 ${formatCost(totalCost(trip))}`]),
      ]),
      el("div.actions", {}, [
        el(
          "button.btn.sm",
          {
            onclick: (e) => {
              e.stopPropagation();
              navigate(`/trip/${trip.id}`);
            },
          },
          ["열기"]
        ),
        el("div.spacer"),
        el(
          "button.btn.sm.ghost",
          {
            title: "복제",
            onclick: (e) => {
              e.stopPropagation();
              onClone(trip);
            },
          },
          ["⧉ 복제"]
        ),
        el(
          "button.btn.sm.ghost.danger",
          {
            title: "삭제",
            onclick: (e) => {
              e.stopPropagation();
              onDelete(trip);
            },
          },
          ["🗑"]
        ),
      ]),
    ]),
  ]);
  card.addEventListener("click", () => navigate(`/trip/${trip.id}`));
  return card;
}

// 새 여행 만들기 모달.
function openNewTripModal(onCreate) {
  const draft = { title: "", destination: "", startDate: "", endDate: "", cover: "" };
  const backdrop = el("div.modal-backdrop");
  const close = () => {
    backdrop.classList.remove("open");
    setTimeout(() => backdrop.remove(), 200);
  };

  const modal = el("div.modal", {}, [
    el("header", {}, [el("h3", {}, ["새 여행"])]),
    el("div.modal-body", {}, [
      el("div.field", {}, [
        el("label", {}, ["여행 제목"]),
        el("input", {
          type: "text",
          placeholder: "예: 도쿄 3박 4일",
          oninput: (e) => (draft.title = e.target.value),
        }),
      ]),
      el("div.field", {}, [
        el("label", {}, ["목적지"]),
        el("input", {
          type: "text",
          placeholder: "예: Tokyo, Japan",
          oninput: (e) => (draft.destination = e.target.value),
        }),
      ]),
      el("div.field-row", {}, [
        el("div.field", {}, [
          el("label", {}, ["출발일"]),
          el("input", {
            type: "date",
            oninput: (e) => (draft.startDate = e.target.value),
          }),
        ]),
        el("div.field", {}, [
          el("label", {}, ["도착일(귀국)"]),
          el("input", {
            type: "date",
            oninput: (e) => (draft.endDate = e.target.value),
          }),
        ]),
      ]),
      el("div.field", {}, [
        el("label", {}, ["커버 이미지 URL (선택)"]),
        el("input", {
          type: "url",
          placeholder: "https://…",
          oninput: (e) => (draft.cover = e.target.value),
        }),
      ]),
    ]),
    el("footer", {}, [
      el("button.btn.ghost", { onclick: close }, ["취소"]),
      el("div.spacer"),
      el(
        "button.btn.primary",
        {
          onclick: () => {
            const trip = newTrip({
              title: draft.title.trim() || "새 여행",
              destination: draft.destination.trim(),
              startDate: draft.startDate,
              endDate: draft.endDate,
              cover: draft.cover.trim(),
            });
            close();
            onCreate(trip);
          },
        },
        ["만들기"]
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

// 보관함 렌더링. root: 컨테이너, store: 어댑터.
export async function renderLibrary(root, store) {
  clear(root);

  const head = el("div.library-head", {}, [
    el("div", {}, [
      el("h1", {}, ["여행 보관함"]),
      el("p", {}, ["일정을 짜고, 복제해 다음 여행에 다시 쓰세요."]),
    ]),
  ]);

  const grid = el("div.grid.stagger");
  root.appendChild(head);
  root.appendChild(grid);

  async function reload() {
    clear(grid);
    const trips = await store.listTrips();

    // 새 여행 카드
    grid.appendChild(
      el(
        "button.new-card",
        {
          onclick: () =>
            openNewTripModal(async (trip) => {
              await store.saveTrip(trip);
              navigate(`/trip/${trip.id}`);
            }),
        },
        [el("span.plus", {}, ["＋"]), el("span", {}, ["새 여행"])]
      )
    );

    trips.forEach((trip) => {
      grid.appendChild(
        tripCard(trip, {
          onClone: async (t) => {
            const copy = cloneTrip(t);
            await store.saveTrip(copy);
            toast("여행을 복제했어요 (날짜는 비워둠)");
            reload();
          },
          onDelete: async (t) => {
            if (!confirmAction(`"${t.title}" 여행을 삭제할까요?`)) return;
            await store.deleteTrip(t.id);
            toast("여행을 삭제했어요");
            reload();
          },
        })
      );
    });
  }

  await reload();
}
