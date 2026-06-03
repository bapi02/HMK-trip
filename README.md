# Trip Planner · 여행 플래너

여행 일정을 짜고, 여러 기기에서 동기화하며, 다음 여행에도 복제해 재사용하는 웹앱.
빌드툴 없이 **정적 호스팅**으로 바로 뜬다. 지도·저장 모두 **키 없이 로컬에서 즉시** 동작한다.

## 빠르게 보기

```bash
# 정적 서버 아무거나
npx serve .
# 또는
python3 -m http.server 8080
```

브라우저에서 열면 첫 화면에 **"도쿄 3박 4일" 샘플 여행**이 시드로 들어가 있다.

> ES 모듈을 쓰므로 `file://` 직접 열기 대신 로컬 HTTP 서버로 띄우는 걸 권장한다.

## 저장 모드 (자동 선택)

데이터 접근은 `src/store.js` 어댑터 한 겹을 거친다.

1. `src/firebase.js`의 `firebaseConfig`가 채워져 있으면 → **Firestore (동기화 모드)**
2. 비어 있으면 → **localStorage (로컬 단독 모드)**

config만 채우면 코드 수정 없이 멀티 기기 동기화로 승격된다. 뷰 코드는 절대
firebase/localStorage를 직접 호출하지 않는다.

## 기술 스택

- 단일 페이지 웹앱 (ES 모듈, 빌드 산출물 없음)
- Firebase **Firestore** (멀티 기기 동기화, 선택)
- **Leaflet + OpenStreetMap** (지도, API 키 불필요)
- **SortableJS** (드래그 재배치)
- **Firebase Hosting** 배포

## 주요 기능

- 여행 보관함: 카드 그리드, 새로 만들기 / **복제(날짜만 비움)** / 삭제
- Day별 타임라인: 스팟 추가·편집·삭제, **드래그로 순서·날짜 간 이동**, 카테고리 컬러
- 타임라인 ↔ 지도 토글: 그날의 핀 + 순서대로 폴리라인 동선, **핀 드래그로 좌표 입력**
- 이동시간/거리: 인접 스팟 직선거리(haversine) 자동 어림치 + 수동 보정
- 스팟 첨부: 사진 URL·참고 링크 여러 개
- 합계: Day별/여행 전체 예상 비용·이동시간 합산

## 파일 구조

```
index.html
src/
  main.js          # 라우팅·앱 부트 (해시 라우터)
  store.js         # 저장 어댑터 (firebase/local 자동 선택)
  firebase.js      # config + 초기화
  model.js         # 데이터 모델·카테고리·시드
  geo.js           # haversine·동선·이동시간 추정
  util.js          # DOM 헬퍼·토스트
  views/
    library.js     # 보관함
    trip.js        # 상세 (타임라인+지도 토글)
    timeline.js
    map.js         # Leaflet
  components/
    spotCard.js
    spotEditor.js
  styles.css
firebase.json      # Hosting 설정
firestore.rules    # (선택) Firestore 보안 규칙
```

## 배포 (Firebase Hosting)

```bash
firebase login
firebase use bapi02            # 또는 해당 프로젝트 ID
firebase deploy --only hosting
```

동기화까지 켜려면 `src/firebase.js`의 config를 채우고
`firebase deploy --only firestore:rules`로 규칙을 함께 배포한다.

## 이동시간 안내

표시되는 이동시간/거리는 **직선거리 기반 어림치**다(도심 우회 1.3배 보정).
정밀 라우팅은 추후 `src/geo.js`의 함수만 OSRM 등으로 교체하면 된다.
