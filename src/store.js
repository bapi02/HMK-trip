// store.js — 저장 어댑터 (firebase / local 자동 선택)
//
// 우선순위:
//   1) firebaseConfig가 채워져 있으면 → Firestore (동기화 모드)
//   2) 비어 있으면 → localStorage (로컬 단독 모드)
//
// 모든 뷰는 이 어댑터만 호출한다. firebase/localStorage 직접 호출 금지(스펙 8).
// 인터페이스는 firebase/local 모두 async로 통일:
//   listTrips(), getTrip(id), saveTrip(trip), deleteTrip(id), subscribe(tripId, cb)

import { hasFirebaseConfig, initFirebase } from "./firebase.js";
import { seedTrip, nowISO } from "./model.js";

const LS_KEY = "tripPlanner.trips.v1";
const LS_SEEDED = "tripPlanner.seeded.v1";

// ─────────────────────────────────────────────
// localStorage 어댑터
// ─────────────────────────────────────────────
function createLocalStore() {
  // 구독 콜백 레지스트리 — local 모드는 저장 시 같은 탭에서 즉시 통지.
  const subs = new Map(); // tripId -> Set<cb>

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeAll(map) {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  }

  // 최초 1회 시드 주입 — 빈 화면 방지(스펙 8).
  function ensureSeed() {
    if (localStorage.getItem(LS_SEEDED)) return;
    const map = readAll();
    if (Object.keys(map).length === 0) {
      const t = seedTrip();
      map[t.id] = t;
      writeAll(map);
    }
    localStorage.setItem(LS_SEEDED, "1");
  }

  function notify(tripId) {
    const set = subs.get(tripId);
    if (!set) return;
    const map = readAll();
    const trip = map[tripId] || null;
    set.forEach((cb) => cb(trip));
  }

  ensureSeed();

  return {
    mode: "local",

    async listTrips() {
      const map = readAll();
      return Object.values(map).sort(
        (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")
      );
    },

    async getTrip(id) {
      return readAll()[id] || null;
    },

    async saveTrip(trip) {
      const map = readAll();
      trip.updatedAt = nowISO();
      map[trip.id] = trip;
      writeAll(map);
      notify(trip.id);
      return trip;
    },

    async deleteTrip(id) {
      const map = readAll();
      delete map[id];
      writeAll(map);
      notify(id);
    },

    // local 모드: 즉시 1회 호출 + 이후 saveTrip 시 통지. 해제 함수 반환.
    subscribe(tripId, cb) {
      if (!subs.has(tripId)) subs.set(tripId, new Set());
      subs.get(tripId).add(cb);
      this.getTrip(tripId).then(cb);
      return () => subs.get(tripId)?.delete(cb);
    },
  };
}

// ─────────────────────────────────────────────
// Firestore 어댑터
// ─────────────────────────────────────────────
async function createFirestoreStore() {
  const { db, firestore } = await initFirebase();
  const {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
  } = firestore;

  const col = collection(db, "trips");

  return {
    mode: "firebase",

    async listTrips() {
      const q = query(col, orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async getTrip(id) {
      const snap = await getDoc(doc(db, "trips", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    async saveTrip(trip) {
      trip.updatedAt = nowISO();
      await setDoc(doc(db, "trips", trip.id), trip);
      return trip;
    },

    async deleteTrip(id) {
      await deleteDoc(doc(db, "trips", id));
    },

    // Firestore: onSnapshot 실시간 구독. 해제 함수 반환.
    subscribe(tripId, cb) {
      return onSnapshot(doc(db, "trips", tripId), (snap) => {
        cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      });
    },
  };
}

// ─────────────────────────────────────────────
// 자동 선택 + 싱글톤
// ─────────────────────────────────────────────
let _storePromise = null;

export function getStore() {
  if (_storePromise) return _storePromise;
  _storePromise = (async () => {
    if (hasFirebaseConfig()) {
      try {
        return await createFirestoreStore();
      } catch (e) {
        console.warn("Firestore 초기화 실패 — local 모드로 폴백", e);
        return createLocalStore();
      }
    }
    return createLocalStore();
  })();
  return _storePromise;
}
