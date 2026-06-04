// currency.js — 엔화(¥) → 원화(₩) 환산.
// 비용은 엔화로 입력하고, 화면엔 실시간 환율로 환산한 원화를 함께 보여준다.
// 환율은 키 없는 무료 API에서 1일 1회 받아 localStorage에 캐시. 실패 시 기본값 폴백.

const FX_KEY = "tripPlanner.fx.jpykrw.v1";
const FALLBACK = 9.3; // 1 JPY ≈ 9.3 KRW (네트워크 실패 시 어림 기본값)

let _rate = FALLBACK;
let _asOf = ""; // 환율 기준일 (YYYY-MM-DD), 빈 값이면 폴백 사용 중

export function getRate() {
  return _rate;
}
export function rateAsOf() {
  return _asOf;
}

// 엔화 → 원화(반올림). null/빈값은 null.
export function toKRW(yen) {
  if (yen == null || yen === "") return null;
  return Math.round(Number(yen) * _rate);
}

export function fmtKRW(won) {
  if (won == null) return "₩0";
  return "₩" + Number(won).toLocaleString("ko-KR");
}
export function fmtJPY(yen) {
  if (!yen) return "¥0";
  return "¥" + Number(yen).toLocaleString("ja-JP");
}

const today = () => new Date().toISOString().slice(0, 10);

// 환율 로드: 같은 날 캐시가 있으면 그대로, 없으면 fetch. 항상 _rate를 채운다.
export async function loadRate() {
  try {
    const c = JSON.parse(localStorage.getItem(FX_KEY) || "null");
    if (c && c.date === today() && c.rate) {
      _rate = c.rate;
      _asOf = c.date;
      return _rate;
    }
  } catch {}

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/JPY");
    const data = await res.json();
    const krw = data && data.rates && data.rates.KRW;
    if (krw) {
      _rate = krw;
      _asOf = today();
      localStorage.setItem(FX_KEY, JSON.stringify({ rate: _rate, date: _asOf }));
    }
  } catch (e) {
    console.warn("환율 로드 실패 — 기본값 사용", e);
  }
  return _rate;
}
