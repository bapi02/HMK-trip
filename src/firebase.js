// firebase.js — Firebase 설정 + 초기화
// config가 비어 있으면 local 모드, 채워져 있으면 Firestore 동기화 모드로 승격된다.
//
// 동기화를 켜려면 아래 firebaseConfig 값을 채운다. (배포 타깃: bapi02 계정 패턴)
// 모든 값이 비어 있으면 store.js가 자동으로 localStorage 어댑터를 선택한다.

export const firebaseConfig = {
  apiKey: "AIzaSyClVYZGlsFRZY12ZZIX_aP-DWDNDPzMvGc",
  authDomain: "hmk-trip.firebaseapp.com",
  projectId: "hmk-trip",
  storageBucket: "hmk-trip.firebasestorage.app",
  messagingSenderId: "114364444156",
  appId: "1:114364444156:web:9a265c5099d4c6248dd679",
};

// config가 의미 있게 채워졌는지 판단 (projectId + apiKey 기준).
export function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

// Firebase SDK를 ESM CDN에서 동적 로드한다.
// config가 없으면 절대 import하지 않으므로 로컬/오프라인에서 바로 뜬다.
let _appPromise = null;

export async function initFirebase() {
  if (!hasFirebaseConfig()) return null;
  if (_appPromise) return _appPromise;

  _appPromise = (async () => {
    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
    );
    const firestore = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const app = initializeApp(firebaseConfig);
    const db = firestore.getFirestore(app);
    return { app, db, firestore };
  })();

  return _appPromise;
}
