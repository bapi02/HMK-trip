// model.js — 데이터 모델 헬퍼 + 카테고리 정의 + 시드 데이터
// store 어댑터와 뷰가 공유하는 순수 데이터 유틸. (저장소 접근 없음)

// 카테고리 정의 — 컬러/라벨/아이콘을 한 곳에서. 타임라인·지도 핀에 일관 적용.
export const CATEGORIES = {
  sightseeing: { label: "관광", color: "#3a5a8c", icon: "⛩" },
  food: { label: "식사", color: "#c8472b", icon: "🍜" },
  transport: { label: "이동", color: "#2f7d6e", icon: "🚃" },
  hotel: { label: "숙소", color: "#8a6d3b", icon: "🛏" },
  shopping: { label: "쇼핑", color: "#b8902a", icon: "🛍" },
  etc: { label: "기타", color: "#6b6660", icon: "📍" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export const MOVE_MODES = {
  "": { label: "—", icon: "" },
  walk: { label: "도보", icon: "🚶" },
  train: { label: "전철", icon: "🚃" },
  bus: { label: "버스", icon: "🚌" },
  car: { label: "차량", icon: "🚗" },
};

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

// "2026-07-10"에 days 더한 날짜 문자열.
export function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// 빈 스팟 한 개.
export function newSpot(partial = {}) {
  return {
    id: uid("spot"),
    time: "",
    title: "새 장소",
    category: "sightseeing",
    lat: null,
    lng: null,
    memo: "",
    cost: null,
    moveMode: "",
    moveMin: null,
    links: [],
    photos: [],
    ...partial,
  };
}

// 새 여행 껍데기. startDate/days 기준으로 빈 Day 배열 생성.
export function newTrip(partial = {}) {
  const startDate = partial.startDate || "";
  const days = partial.days || 1;
  const schedule =
    partial.schedule ||
    Array.from({ length: days }, (_, i) => ({
      date: startDate ? addDays(startDate, i) : "",
      label: `Day ${i + 1}`,
      spots: [],
    }));
  return {
    id: partial.id || uid("trip"),
    title: partial.title || "새 여행",
    destination: partial.destination || "",
    startDate,
    days,
    cover: partial.cover || "",
    createdAt: partial.createdAt || nowISO(),
    updatedAt: nowISO(),
    schedule,
  };
}

// 여행 복제 — 일정은 그대로, 날짜만 비운다. (스펙: 복제는 일정 그대로 가져오고 날짜만 비우기)
export function cloneTrip(trip) {
  const copy = JSON.parse(JSON.stringify(trip));
  copy.id = uid("trip");
  copy.title = `${trip.title} (복사본)`;
  copy.startDate = "";
  copy.createdAt = nowISO();
  copy.updatedAt = nowISO();
  copy.schedule = copy.schedule.map((day, i) => ({
    ...day,
    date: "",
    label: day.label || `Day ${i + 1}`,
    spots: day.spots.map((s) => ({ ...s, id: uid("spot") })),
  }));
  return copy;
}

// 여행 전체 예상 비용 합계.
export function totalCost(trip) {
  return trip.schedule.reduce(
    (sum, day) =>
      sum + day.spots.reduce((s, sp) => s + (Number(sp.cost) || 0), 0),
    0
  );
}

// 여행 전체 이동시간 합계(분).
export function totalMoveMin(trip) {
  return trip.schedule.reduce(
    (sum, day) =>
      sum + day.spots.reduce((s, sp) => s + (Number(sp.moveMin) || 0), 0),
    0
  );
}

export function dayCost(day) {
  return day.spots.reduce((s, sp) => s + (Number(sp.cost) || 0), 0);
}

export function dayMoveMin(day) {
  return day.spots.reduce((s, sp) => s + (Number(sp.moveMin) || 0), 0);
}

export function formatCost(n) {
  if (!n) return "¥0";
  return "¥" + Number(n).toLocaleString("ja-JP");
}

// 첫 데이터로 "도쿄 3박 4일" 샘플 trip — 빈 화면 방지.
export function seedTrip() {
  const start = "2026-07-10";
  return {
    id: "trip_seed_tokyo",
    title: "도쿄 3박 4일",
    destination: "Tokyo, Japan",
    startDate: start,
    days: 4,
    cover:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900&q=70",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    schedule: [
      {
        date: addDays(start, 0),
        label: "Day 1 · 아사쿠사",
        spots: [
          newSpot({
            time: "10:30",
            title: "센소지",
            category: "sightseeing",
            lat: 35.7148,
            lng: 139.7967,
            memo: "나카미세 거리 구경하며 천천히",
            cost: 0,
            links: ["https://www.senso-ji.jp/"],
          }),
          newSpot({
            time: "12:30",
            title: "아사쿠사 텐동 점심",
            category: "food",
            lat: 35.7119,
            lng: 139.7965,
            memo: "에도마에 텐동",
            cost: 1800,
            moveMode: "walk",
            moveMin: 8,
          }),
          newSpot({
            time: "15:00",
            title: "도쿄 스카이트리",
            category: "sightseeing",
            lat: 35.7101,
            lng: 139.8107,
            memo: "전망대 예약 권장",
            cost: 2100,
            moveMode: "walk",
            moveMin: 20,
          }),
          newSpot({
            time: "19:00",
            title: "호텔 체크인 (아사쿠사)",
            category: "hotel",
            lat: 35.7115,
            lng: 139.7945,
            cost: 0,
            moveMode: "train",
            moveMin: 12,
          }),
        ],
      },
      {
        date: addDays(start, 1),
        label: "Day 2 · 시부야·하라주쿠",
        spots: [
          newSpot({
            time: "10:00",
            title: "메이지 신궁",
            category: "sightseeing",
            lat: 35.6764,
            lng: 139.6993,
            memo: "숲길 산책",
            cost: 0,
          }),
          newSpot({
            time: "12:00",
            title: "타케시타 거리",
            category: "shopping",
            lat: 35.6716,
            lng: 139.7031,
            cost: 5000,
            moveMode: "walk",
            moveMin: 10,
          }),
          newSpot({
            time: "16:00",
            title: "시부야 스크램블",
            category: "sightseeing",
            lat: 35.6595,
            lng: 139.7004,
            memo: "스크램블 스퀘어 전망",
            cost: 2200,
            moveMode: "train",
            moveMin: 6,
          }),
          newSpot({
            time: "19:30",
            title: "이자카야 저녁",
            category: "food",
            lat: 35.6598,
            lng: 139.6985,
            cost: 4500,
            moveMode: "walk",
            moveMin: 7,
          }),
        ],
      },
      {
        date: addDays(start, 2),
        label: "Day 3 · 신주쿠·우에노",
        spots: [
          newSpot({
            time: "10:30",
            title: "신주쿠 교엔",
            category: "sightseeing",
            lat: 35.6852,
            lng: 139.71,
            cost: 500,
          }),
          newSpot({
            time: "13:00",
            title: "라멘 점심 (신주쿠)",
            category: "food",
            lat: 35.6938,
            lng: 139.7036,
            cost: 1200,
            moveMode: "walk",
            moveMin: 15,
          }),
          newSpot({
            time: "15:30",
            title: "우에노 공원·박물관",
            category: "sightseeing",
            lat: 35.7156,
            lng: 139.7745,
            cost: 1000,
            moveMode: "train",
            moveMin: 25,
          }),
        ],
      },
      {
        date: addDays(start, 3),
        label: "Day 4 · 긴자·귀국",
        spots: [
          newSpot({
            time: "10:00",
            title: "긴자 쇼핑",
            category: "shopping",
            lat: 35.6717,
            lng: 139.765,
            cost: 8000,
          }),
          newSpot({
            time: "13:00",
            title: "공항 이동 (나리타)",
            category: "transport",
            lat: 35.772,
            lng: 140.3929,
            memo: "나리타 익스프레스",
            cost: 3070,
            moveMode: "train",
            moveMin: 80,
          }),
        ],
      },
    ],
  };
}
