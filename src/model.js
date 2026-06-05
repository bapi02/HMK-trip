// model.js — 데이터 모델 헬퍼 + 카테고리 정의 + 시드 데이터
// store 어댑터와 뷰가 공유하는 순수 데이터 유틸. (저장소 접근 없음)
import { toKRW, fmtKRW, fmtJPY } from "./currency.js";

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

// 출발일~도착일 사이 일수(당일 포함). 둘 다 있어야 계산.
export function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const a = new Date(startDate + "T00:00:00");
  const b = new Date(endDate + "T00:00:00");
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff >= 1 ? diff : 1;
}

// 빈 항공편 한 개. depart/arrive는 datetime-local 문자열 "YYYY-MM-DDTHH:mm".
export function newFlight(partial = {}) {
  return {
    airline: "",
    flightNo: "",
    from: "", // 출발 공항 코드 예: ICN
    to: "", // 도착 공항 코드 예: NRT
    depart: "", // 출발 일시
    arrive: "", // 도착 일시
    cost: null,
    ...partial,
  };
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
    placeId: null, // 구글 장소 ID (리뷰·사진 재조회용)
    groupId: null, // 같은 그룹 = "택1" 이동 선택지 묶음
    picked: false, // 그룹 내에서 선택된(실제 갈) 후보
    ...partial,
  };
}

// 새 여행 껍데기. 출발일~도착일(또는 days)로 빈 Day 배열 생성.
export function newTrip(partial = {}) {
  const startDate = partial.startDate || "";
  // days 결정: 출발/도착일이 둘 다 있으면 그 사이 일수, 아니면 days(기본 1).
  const days =
    daysBetween(startDate, partial.endDate) || partial.days || 1;
  // endDate 결정: 명시값 우선, 없으면 startDate + (days-1).
  const endDate =
    partial.endDate || (startDate ? addDays(startDate, days - 1) : "");
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
    endDate,
    days,
    cover: partial.cover || "",
    flights: partial.flights || {
      outbound: newFlight(), // 가는 편
      inbound: newFlight(), // 오는 편(귀국)
    },
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
  copy.endDate = "";
  copy.createdAt = nowISO();
  copy.updatedAt = nowISO();
  // 항공편 정보는 유지하되 날짜·시간만 비운다(스펙: 날짜만 비우기).
  if (copy.flights) {
    for (const k of Object.keys(copy.flights)) {
      copy.flights[k] = { ...copy.flights[k], depart: "", arrive: "" };
    }
  }
  copy.schedule = copy.schedule.map((day, i) => ({
    ...day,
    date: "",
    label: day.label || `Day ${i + 1}`,
    spots: day.spots.map((s) => ({ ...s, id: uid("spot") })),
  }));
  return copy;
}

// 항공권 비용 합계(가는 편 + 오는 편).
export function flightCost(trip) {
  if (!trip.flights) return 0;
  return Object.values(trip.flights).reduce(
    (s, f) => s + (Number(f && f.cost) || 0),
    0
  );
}

// 그룹(택1 선택지)에서 선택된 스팟 id. 아무도 안 골랐으면 첫 멤버.
export function pickedSpotId(day, groupId) {
  const members = day.spots.filter((s) => s.groupId === groupId);
  if (!members.length) return null;
  return (members.find((s) => s.picked) || members[0]).id;
}

// 합계·계획 계산용 스팟 목록: 그룹은 선택된 1곳만 포함(나머지 후보 제외).
export function effectiveSpots(day) {
  const seen = new Set();
  const out = [];
  for (const s of day.spots) {
    if (!s.groupId) {
      out.push(s);
      continue;
    }
    if (seen.has(s.groupId)) continue;
    seen.add(s.groupId);
    const pid = pickedSpotId(day, s.groupId);
    const picked = day.spots.find((x) => x.id === pid);
    if (picked) out.push(picked);
  }
  return out;
}

// 여행 전체 예상 비용 합계(스팟 + 항공권). 그룹은 선택된 후보만.
export function totalCost(trip) {
  const spots = trip.schedule.reduce((sum, day) => sum + dayCost(day), 0);
  return spots + flightCost(trip);
}

// 여행 전체 이동시간 합계(분). 그룹은 선택된 후보만.
export function totalMoveMin(trip) {
  return trip.schedule.reduce((sum, day) => sum + dayMoveMin(day), 0);
}

export function dayCost(day) {
  return effectiveSpots(day).reduce((s, sp) => s + (Number(sp.cost) || 0), 0);
}

export function dayMoveMin(day) {
  return effectiveSpots(day).reduce((s, sp) => s + (Number(sp.moveMin) || 0), 0);
}

// 그날 스팟을 시간순으로 정렬. 그룹(택1 선택지)은 한 덩어리로 유지(그룹 내 최소 시간 기준),
// 시간 없는 항목은 원래 순서대로 맨 뒤에.
export function sortDaySpotsByTime(day) {
  const items = [];
  const seen = new Set();
  for (const s of day.spots) {
    if (s.groupId) {
      if (seen.has(s.groupId)) continue;
      seen.add(s.groupId);
      const members = day.spots.filter((x) => x.groupId === s.groupId);
      const times = members.map((m) => m.time).filter(Boolean).sort();
      items.push({ members, time: times[0] || "" });
    } else {
      items.push({ members: [s], time: s.time || "" });
    }
  }
  const timed = items
    .filter((it) => it.time)
    .sort((a, b) => a.time.localeCompare(b.time));
  const untimed = items.filter((it) => !it.time);
  day.spots = [...timed, ...untimed].flatMap((it) => it.members);
  return day;
}

// 비용은 엔화로 저장하고, 표시는 원화(₩) 환산이 기본.
export function formatCost(yen) {
  return fmtKRW(toKRW(yen));
}
// 엔화 원본 표기 (입력/병기용).
export function formatYen(yen) {
  return fmtJPY(yen);
}

// "2026-07-10T09:30" → "7.10(목) 09:30" (한국어 요일)
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function formatDateTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d)) return dt;
  const w = WEEKDAYS[d.getDay()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}.${d.getDate()}(${w}) ${hh}:${mm}`;
}

// 항공편에 입력된 내용이 하나라도 있는지.
export function hasFlightInfo(f) {
  return Boolean(f && (f.airline || f.flightNo || f.from || f.to || f.depart || f.arrive));
}

// 첫 데이터로 "도쿄 3박 4일" 샘플 trip — 빈 화면 방지.
export function seedTrip() {
  const start = "2026-07-10";
  return {
    id: "trip_seed_tokyo",
    title: "도쿄 3박 4일",
    destination: "Tokyo, Japan",
    startDate: start,
    endDate: addDays(start, 3),
    days: 4,
    cover:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900&q=70",
    flights: {
      outbound: newFlight({
        airline: "대한항공",
        flightNo: "KE703",
        from: "ICN",
        to: "NRT",
        depart: `${start}T09:00`,
        arrive: `${start}T11:30`,
        cost: 220000,
      }),
      inbound: newFlight({
        airline: "대한항공",
        flightNo: "KE706",
        from: "NRT",
        to: "ICN",
        depart: `${addDays(start, 3)}T18:00`,
        arrive: `${addDays(start, 3)}T20:50`,
        cost: 0,
      }),
    },
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
