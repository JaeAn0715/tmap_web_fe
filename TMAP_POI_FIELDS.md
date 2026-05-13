# TMAP POI API — 표시 가능한 정보 가이드

> **목적**: 사용자에게 보여줄 수 있는 POI 정보가 무엇인지, 어디에서 오는지, 현재 우리 앱에서 어디까지 노출 중인지를 한 곳에서 정리한다. 디자이너/PM/AI 프롬프트 설계 시 참고용.
>
> **출처**: TMAP Web SDK v2 공식 문서 (https://tmapapi.tmapmobility.com), POI 검색/상세 REST 가이드, 그리고 우리 앱이 실제로 받아본 응답 샘플을 기반으로 정리.
>
> ⚠️ TMAP 응답 필드는 환경/POI 종류/계약 등급에 따라 일부가 비어 있을 수 있음. 모든 필드가 항상 채워지지는 않는다.

---

## 1. 우리 앱이 호출하는 엔드포인트

| 엔드포인트 | 메서드 | 용도 | 위치 |
|---|---|---|---|
| `https://apis.openapi.sk.com/tmap/pois` | GET | **통합 POI 검색** (이름/주소/카테고리 키워드) | `src/lib/search.ts` |
| `https://apis.openapi.sk.com/tmap/routes` | POST | 자동차 경로 | `src/lib/route.ts` |

> ❗ 추가로 가능한 호출:
> - `GET /tmap/pois/{pkey}` — POI 상세 (현재 미사용)
> - `GET /tmap/pois/search/around` — 좌표 주변 POI
> - `GET /tmap/pois/search/category` — 카테고리 코드 기반 검색
> - `POST /tmap/routes/pedestrian` — 보행자 경로
> - `POST /tmap/routes/transit` — 대중교통

---

## 2. POI Search 응답에서 제공되는 필드 전체 목록

### 2-1. 식별자 / 이름

| 필드 | 의미 | 예시 | 우리 앱 노출 |
|---|---|---|---|
| `id` | POI 식별자 (검색 결과 단위) | `"1234567"` | ✅ 내부 키 |
| `pkey` | POI 상세 조회용 영구 키 | `"100002309"` | ❌ 미사용 (상세 API 미호출) |
| `name` | POI 이름 | `"스타벅스 강남대로점"` | ✅ Note 헤더 |
| `bldnm` | 건물명 | `"강남빌딩"` | ❌ 미노출 (대부분 비어 있음) |

### 2-2. 주소 — 지번주소(법정동)

TMAP은 한국 행정주소 위계를 4단계로 쪼개서 반환한다. 합쳐서 표시할 때는 공백으로 join.

| 필드 | 의미 | 예시 |
|---|---|---|
| `upperAddrName` | 시·도 | `"서울특별시"` |
| `middleAddrName` | 시·군·구 | `"강남구"` |
| `lowerAddrName` | 읍·면·동 | `"역삼동"` |
| `detailAddrName` | 상세(번지) | `"123-4"` |
| `firstNo` / `secondNo` | 본번-부번 (지번) | `"123" / "4"` |

→ 우리 앱: `poi.address`로 `upperAddrName + middleAddrName + lowerAddrName + detailAddrName`을 합쳐 노출.

### 2-3. 주소 — 도로명주소

| 필드 | 의미 | 예시 |
|---|---|---|
| `roadName` | 도로명 | `"강남대로"` |
| `buildingNo1` / `buildingNo2` | 건물 본번-부번 | `"123" / "0"` |
| `newAddressList[].newAddress[].fullAddressRoad` | 도로명 전체 주소 (가공된 문자열) | `"서울특별시 강남구 강남대로 123"` |

→ 우리 앱: `poi.roadAddress`로 `fullAddressRoad`를 우선 사용하고, 없으면 `upperAddrName + middleAddrName + roadName + buildingNo1`로 fallback. Note 본문 메인에 📍 아이콘과 함께 노출.

### 2-4. 좌표

| 필드 | 의미 | 사용 위치 |
|---|---|---|
| `noorLat` / `noorLon` | **대표점**(건물 중심) | 지도 핀 표시 |
| `frontLat` / `frontLon` | **출입구 앞 좌표** (네비 도착점에 적합) | 우리 앱 기본 좌표(있으면 우선) |
| `radius` | 반경 (대형 시설) | ❌ 미노출 |

→ 우리 앱: `lat = frontLat || noorLat`, `lng = frontLon || noorLon`. 상세 패널에 `🌐 좌표 37.49xxx, 127.02xxx`로 노출.

### 2-5. 업종 / 카테고리

| 필드 | 의미 | 예시 |
|---|---|---|
| `bizCatName` | **단일 업종명** (가장 자주 쓰이는 표시값) | `"카페"` |
| `upperBizName` | 대분류 | `"음식점"` |
| `middleBizName` | 중분류 | `"카페·디저트"` |
| `lowerBizName` | 소분류 | `"커피전문점"` |
| `detailBizName` | 상세 업종 | `"스타벅스"` (브랜드) |
| `mlClass` | 다중 분류 코드 | `"1"` |
| `rpFlag` | 대표 POI 여부 | `"Y"` |

→ 우리 앱:
- 카드 본문에 🏷 `bizCatName` (간단 한 줄).
- 상세 패널에 📂 `upperBizName > middleBizName > lowerBizName` (계층 표시).

### 2-6. 연락처

| 필드 | 의미 | 우리 앱 노출 |
|---|---|---|
| `telNo` | 대표 전화번호 | ✅ 📞 클릭 시 `tel:` 링크 |

> 이메일/홈페이지/SNS는 POI Search에 없음. **POI Detail API**(`/tmap/pois/{pkey}`)에서 일부 제공될 수 있음.

### 2-7. 부가 속성 / 시설 정보

검색 결과에 일관되게 들어오는 건 아니지만, POI에 따라 채워져서 들어오는 필드들.

| 필드 | 의미 | 우리 앱 |
|---|---|---|
| `parkFlag` | 주차 가능(`"Y"`/`"N"`) | ✅ 상세 패널 🅿️ |
| `evChargerCnt` | EV 충전기 개수 | ✅ 상세 패널 ⚡ |
| `evChargeYn` | EV 충전 가능 여부 | ❌ (`evChargerCnt`로 대체) |
| `routeFlag` | 경로 안내 가능 여부 | ❌ |
| `detailInfoFlag` | 상세 정보 존재 여부 (Y면 detail API 호출 가치 있음) | ❌ |

### 2-8. 검색 메타

검색 결과 단위에 함께 따라오는 검색 컨텍스트. UI에 직접 노출하기보다 정렬/페이지네이션에 사용.

| 필드 | 의미 |
|---|---|
| `searchPoiInfo.totalCount` | 전체 검색 결과 수 |
| `searchPoiInfo.count` | 이번 페이지 결과 수 |
| `searchPoiInfo.page` | 현재 페이지 |

---

## 3. POI Detail API (`/tmap/pois/{pkey}`) — 추가로 얻을 수 있는 정보

> 현재 우리 앱은 검색 결과(`/tmap/pois`)만 호출하고 detail은 호출하지 않는다. 필요 시 `searchPois`가 반환한 `pkey`로 `GET /tmap/pois/{pkey}`를 호출해 다음 정보들을 추가로 노출할 수 있다.

| 카테고리 | 필드(예시) | 비고 |
|---|---|---|
| 영업시간 | `weekdayBusinessHour`, `weekendBusinessHour`, `holidayBusinessHour` | 요일별 운영 시간 |
| 휴무일 | `holidayInfo` | "매월 첫째 화요일" 등 자유 텍스트 가능 |
| 메뉴 / 가격 | `menuList[]` | 음식점·카페 한정. 모든 매장에 있는 건 아님 |
| 사진 | `imageInfoList[].imageUrl` | 대형 프랜차이즈 위주 |
| 부대시설 | `facilityInfoList[]` | "와이파이/금연/주차/예약 가능" 등 플래그성 |
| 결제수단 | `paymentInfoList[]` | "카드/현금/모바일결제" |
| 외부 평점/리뷰 | (미제공) | TMAP 자체 리뷰는 노출되지 않음. 외부 API 결합 필요 |

→ **권장 우선순위**: 영업시간 > 사진 > 부대시설 > 메뉴. 상세 API가 비싼 편이므로 사용자가 노트를 펼쳤을 때만 lazy fetch하는 패턴 권장.

---

## 4. 다른 TMAP API와의 결합으로 표시 가능한 정보

| 정보 | 호출 API | 우리 앱 |
|---|---|---|
| **소요 시간 / 거리** (특정 지점에서) | `POST /tmap/routes` | ✅ 출발/도착 지정 시 RouteOverlay에서 표시 |
| 보행자 / 대중교통 ETA | `/tmap/routes/pedestrian`, `/tmap/routes/transit` | ❌ |
| **주변 POI** (이 POI 근처에 뭐 있나) | `/tmap/pois/search/around` | ❌ |
| **카테고리 검색** (카페 / 약국 / 주유소 …) | `/tmap/pois/search/category` | ❌ (현재는 freetext만) |
| **자동완성** | `/tmap/pois/search/auto` | ❌ |
| **역지오코딩** (좌표 → 주소) | `/tmap/geo/reversegeocoding` | ❌ |
| **지오코딩** (주소 → 좌표) | `/tmap/geo/fullAddrGeo` | ❌ |
| 실시간 교통 정보 | `/tmap/traffic` | ❌ |

---

## 5. AI(Gemini)로 보강해서 보여주는 정보

POI Search/Detail에서 직접 얻을 수 없거나, 정성적 판단이 필요한 정보는 Gemini Flash Lite로 생성. 자세한 흐름은 `raedme.me`의 "AI 흐름" 섹션 참고.

| 정보 | 출처 | 우리 앱 |
|---|---|---|
| AI 장소 소개 (한 단락 요약) | `geminiOverview` | ✅ Note의 ✨ 박스 |
| 추천 follow-up 토픽 3개 | `geminiOverview` | ✅ 알약 버튼 |
| 토픽별 후속 답변 (예: "대표 메뉴", "주차 팁") | `geminiDrillDown` | ✅ 🔎 박스 누적 |

> Gemini 프롬프트에는 POI Search의 `name / address / roadAddress / category / bizCategory / tel`이 자동으로 컨텍스트로 주입된다(Context-Aware).

---

## 6. 우리가 의도적으로 노출하지 않는 필드

`poi.raw`(개발자용 `<details>`)에 포함되지만 일반 사용자에게는 의미가 없어 메인 UI에 띄우지 않는 것들.

| 필드 | 미노출 이유 |
|---|---|
| `id`, `pkey`, `mlClass`, `rpFlag`, `routeFlag`, `detailInfoFlag` | 내부 식별자/플래그 |
| `noorLat/Lon` | `frontLat/Lon`으로 대체 |
| `firstNo`, `secondNo` | 합쳐진 `address`로 충분 |
| `radius` | 대부분 0 또는 의미 없는 값 |
| `searchPoiInfo.bizCategoriesCode` | 코드 자체는 사용자에게 무의미 |

---

## 7. UI 가이드 — 어떤 필드를 어디에 보여줄까

현재 우리의 `StickyNote` + `PoiDetails` 레이아웃을 기준으로 한 권장 매핑.

```
┌─ Sticky Note (헤더) ────────────────────────┐
│ ★ {name}                              ×     │
├─ 메인 (항상 노출) ──────────────────────────┤
│ [photo if any]                              │
│ 📍 {roadAddress || address}                  │
│ 📞 {telNo}                                   │
│ 🏷 {bizCatName}                              │
├─ 메모 (사용자 입력) ─────────────────────────┤
│ [textarea]                                  │
├─ AI 영역 ───────────────────────────────────┤
│ ✨ AI 장소소개  → overview                   │
│ [토픽1] [토픽2] [토픽3]                     │
│ 🔎 토픽별 답변들                            │
├─ 상세 정보 (▾ 펼침) ─────────────────────────┤
│ 🏠 지번 주소                                 │
│ 📍 도로명 주소                               │
│ 🏢 건물 번호                                 │
│ 📞 전화                                      │
│ 🏷 업종 / 📂 분류                            │
│ 🌐 좌표                                      │
│ 🅿️ 주차 / ⚡ EV 충전기                       │
│ ▸ Raw 데이터 (개발자용)                     │
├─ 액션 ──────────────────────────────────────┤
│ [출발] [도착]                               │
└─────────────────────────────────────────────┘
```

### 향후 확장 시 우선 검토 필드

POI Detail API를 연동하면 추가될 수 있는 영역.

```
├─ ⏰ 영업시간 (요일 토글)                    │
│   평일 09:00~22:00                          │
│   주말 10:00~20:00                          │
│   휴무 매주 월요일                           │
├─ 🍽 메뉴 / 가격 (음식점·카페)                │
│   • 아메리카노 — 4,500원                     │
├─ 📷 사진 갤러리 (imageInfoList)              │
├─ 🛎 편의시설 (facilityInfoList)             │
│   ✓ 와이파이  ✓ 금연  ✓ 예약                │
└─────────────────────────────────────────────┘
```

---

## 8. 참고 — 실제 응답 샘플 (요약)

```json
{
  "searchPoiInfo": {
    "totalCount": "120",
    "count": "1",
    "page": "1",
    "pois": {
      "poi": [
        {
          "id": "1234567",
          "pkey": "100002309",
          "name": "스타벅스 강남대로점",
          "telNo": "02-1234-5678",
          "frontLat": "37.49812",
          "frontLon": "127.02765",
          "noorLat":  "37.49810",
          "noorLon":  "127.02770",
          "upperAddrName": "서울특별시",
          "middleAddrName": "강남구",
          "lowerAddrName": "역삼동",
          "detailAddrName": "823-1",
          "roadName": "강남대로",
          "buildingNo1": "390",
          "buildingNo2": "0",
          "newAddressList": {
            "newAddress": [
              { "fullAddressRoad": "서울특별시 강남구 강남대로 390" }
            ]
          },
          "bizCatName": "카페",
          "upperBizName": "음식점",
          "middleBizName": "카페·디저트",
          "lowerBizName": "커피전문점",
          "parkFlag": "Y",
          "rpFlag": "Y",
          "mlClass": "1"
        }
      ]
    }
  }
}
```

---

## 9. 자주 묻는 질문

**Q. 왜 검색 결과에 사진이 안 보이나요?**
A. POI Search 응답에는 보통 사진 URL이 없습니다. 사진은 POI Detail (`/tmap/pois/{pkey}`)에서 일부 POI에 한해 제공됩니다. 우리 앱은 현재 detail API를 호출하지 않으므로 `poi.photoUrl`은 거의 항상 비어 있습니다.

**Q. 영업시간/메뉴는 어디서 오나요?**
A. POI Detail에서만 옵션으로 제공됩니다. 모든 POI에 있는 건 아니며, 프랜차이즈/대형 시설에 편중되어 있습니다.

**Q. `noorLat`과 `frontLat`의 차이는?**
A. `noor`(누리)는 건물 대표점(중심), `front`는 도보/차량 진입에 자연스러운 출입구 앞 좌표입니다. 지도 핀 표시는 `noor`, 네비 도착점은 `front`가 일반적이지만, 두 값이 거의 같은 POI도 많습니다. 우리 앱은 `front`를 우선 사용합니다.

**Q. 카테고리로 검색하고 싶어요 ("카페", "약국" 등 빠른 필터).**
A. 현재 freetext 검색만 노출되어 있습니다. `/tmap/pois/search/category` + 카테고리 코드 테이블을 연동하면 카테고리 dropdown을 만들 수 있습니다 — `raedme.me` § Partially Implemented E.

**Q. 라이선스는?**
A. TMAP API 사용 약관에 따라 표시 시 **"Powered by TMAP" 또는 동등한 attribution**이 권장됩니다. 운영 배포 전에 약관 확인 필요.
