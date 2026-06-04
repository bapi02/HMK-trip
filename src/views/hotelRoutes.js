// views/hotelRoutes.js — 숙소 기준 이동시간 패널.
// 그날 기준 숙소를 정하면, 각 코스까지 택시(자동차)·지하철(대중교통) 실제 소요시간을
// 구글 길찾기(DistanceMatrix)로 비교해 보여주고, 길찾기로 바로 이동/적용할 수 있다.
import { el, clear, toast } from "../util.js";
import { CATEGORIES } from "../model.js";
import { hasGoogleMaps, loadGoogleMaps } from "../mapsConfig.js";

// 구글 지도 길찾기 딥링크 (앱/웹에서 실제 내비게이션).
function dirUrl(o, d, mode) {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${o.lat},${o.lng}&destination=${d.lat},${d.lng}` +
    `&travelmode=${mode}`
  );
}

// 대중교통 출발시각 — 그날 오전 10시(미래) 기준, 지난 날짜면 1시간 뒤.
function departureTime(day) {
  const base = day.date ? new Date(day.date + "T10:00:00") : new Date();
  return base.getTime() > Date.now() ? base : new Date(Date.now() + 3600000);
}

function distanceMatrix(google, origin, destinations, mode, depTime) {
  return new Promise((resolve) => {
    const svc = new google.maps.DistanceMatrixService();
    const req = { origins: [origin], destinations, travelMode: mode };
    if (mode === google.maps.TravelMode.TRANSIT) {
      req.transitOptions = { departureTime: depTime };
    }
    svc.getDistanceMatrix(req, (res, status) => {
      if (status !== "OK" || !res) {
        resolve({ error: status });
        return;
      }
      resolve({ elements: res.rows[0].elements });
    });
  });
}

// renderHotelRoutes(ctx) → 패널 엘리먼트 (구글맵 키 없으면 null)
export function renderHotelRoutes(ctx) {
  if (!hasGoogleMaps()) return null;
  const day = ctx.trip.schedule[ctx.dayIndex];

  const located = day.spots.filter((s) => s.lat != null && s.lng != null);
  // 기준 숙소 후보: 좌표 있는 스팟 (숙소 카테고리 우선 정렬).
  const candidates = [...located].sort(
    (a, b) => (b.category === "hotel") - (a.category === "hotel")
  );

  const panel = el("details.hotel-routes");
  panel.appendChild(
    el("summary", {}, [
      el("span", {}, ["🏨 숙소 기준 이동시간"]),
      el("span.hr-sub", {}, ["택시·지하철 실제 소요시간 비교"]),
    ])
  );

  const bodyEl = el("div.hr-body");
  panel.appendChild(bodyEl);

  if (candidates.length < 2) {
    bodyEl.appendChild(
      el("div.hr-hint", {}, [
        "좌표가 있는 스팟이 2개 이상 필요해요. 지도에서 검색해 추가하거나 핀을 찍어보세요.",
      ])
    );
    return panel;
  }

  // 기준 숙소 선택 (day.hotelSpotId 기억).
  let hotelId =
    day.hotelSpotId && candidates.some((s) => s.id === day.hotelSpotId)
      ? day.hotelSpotId
      : candidates[0].id;

  const select = el("select.hr-select", {
    onchange: async (e) => {
      hotelId = e.target.value;
      day.hotelSpotId = hotelId;
      await ctx.persist();
    },
  });
  candidates.forEach((s) => {
    const cat = CATEGORIES[s.category] || CATEGORIES.etc;
    const o = el("option", { value: s.id }, [`${cat.icon} ${s.title || "(제목 없음)"}`]);
    if (s.id === hotelId) o.selected = true;
    select.appendChild(o);
  });

  const results = el("div.hr-results");
  const calcBtn = el(
    "button.btn.sm.primary",
    { onclick: () => calc() },
    ["이동시간 계산"]
  );

  bodyEl.appendChild(
    el("div.hr-controls", {}, [
      el("label", {}, ["기준 숙소"]),
      select,
      calcBtn,
    ])
  );
  bodyEl.appendChild(results);

  async function calc() {
    const hotel = candidates.find((s) => s.id === hotelId);
    const courses = located.filter((s) => s.id !== hotelId);
    if (!hotel || !courses.length) {
      toast("기준 숙소와 코스가 필요해요");
      return;
    }
    clear(results);
    results.appendChild(el("div.hr-loading", {}, ["계산 중…"]));

    try {
      const google = await loadGoogleMaps();
      const origin = { lat: hotel.lat, lng: hotel.lng };
      const dests = courses.map((s) => ({ lat: s.lat, lng: s.lng }));
      const depTime = departureTime(day);

      const [drive, transit] = await Promise.all([
        distanceMatrix(google, origin, dests, google.maps.TravelMode.DRIVING, depTime),
        distanceMatrix(google, origin, dests, google.maps.TravelMode.TRANSIT, depTime),
      ]);

      if (drive.error && transit.error) {
        clear(results);
        results.appendChild(
          el("div.hr-hint", {}, [
            `길찾기를 불러오지 못했어요 (${drive.error}). Google Cloud에서 "Distance Matrix API"와 "Directions API"를 사용 설정했는지 확인해주세요.`,
          ])
        );
        return;
      }

      clear(results);
      results.appendChild(
        el("div.hr-from", {}, [`📍 ${hotel.title || "숙소"} 에서`])
      );

      courses.forEach((s, i) => {
        const dEl = drive.elements && drive.elements[i];
        const tEl = transit.elements && transit.elements[i];
        const driveTxt =
          dEl && dEl.status === "OK" ? dEl.duration.text : "—";
        const transitTxt =
          tEl && tEl.status === "OK" ? tEl.duration.text : "—";
        const dest = { lat: s.lat, lng: s.lng };
        const cat = CATEGORIES[s.category] || CATEGORIES.etc;

        results.appendChild(
          el("div.hr-row", {}, [
            el("div.hr-dest", {}, [
              el("span.hr-cat", { style: { background: cat.color } }, [cat.icon]),
              el("span", {}, [s.title || "(제목 없음)"]),
            ]),
            el("div.hr-modes", {}, [
              el(
                "a.hr-mode.drive",
                { href: dirUrl(origin, dest, "driving"), target: "_blank", rel: "noopener", title: "택시 길찾기 열기" },
                [`🚕 ${driveTxt}`]
              ),
              el(
                "a.hr-mode.transit",
                { href: dirUrl(origin, dest, "transit"), target: "_blank", rel: "noopener", title: "지하철 길찾기 열기" },
                [`🚇 ${transitTxt}`]
              ),
            ]),
            el("div.hr-apply", {}, [
              dEl && dEl.status === "OK"
                ? el(
                    "button.icon-btn",
                    {
                      title: "이 스팟 이동정보를 택시 기준으로 저장",
                      onclick: () => applyMove(s, "car", dEl.duration.value),
                    },
                    ["🚕＋"]
                  )
                : null,
              tEl && tEl.status === "OK"
                ? el(
                    "button.icon-btn",
                    {
                      title: "이 스팟 이동정보를 지하철 기준으로 저장",
                      onclick: () => applyMove(s, "train", tEl.duration.value),
                    },
                    ["🚇＋"]
                  )
                : null,
            ]),
          ])
        );
      });

      results.appendChild(
        el("div.hr-attrib", {}, [
          "소요시간·경로 출처: Google · 지하철은 그날 오전 10시 출발 기준 예상치",
        ])
      );
    } catch (e) {
      console.warn(e);
      clear(results);
      results.appendChild(
        el("div.hr-hint", {}, ["길찾기를 불러오지 못했어요. 잠시 후 다시 시도해주세요."])
      );
    }
  }

  // 선택한 수단·시간을 그 스팟의 이동정보(moveMode/moveMin)로 저장.
  async function applyMove(spot, mode, durationSec) {
    spot.moveMode = mode;
    spot.moveMin = Math.round(durationSec / 60);
    await ctx.persist();
    toast(`"${spot.title}" 이동시간 ${spot.moveMin}분으로 저장`);
    ctx.refresh();
  }

  return panel;
}
