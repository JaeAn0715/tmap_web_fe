/**
 * When the map / geolocation center falls outside South Korea, recommendations
 * are anchored to Jongno-gu (Seoul) per product spec.
 */

/** 광화문·종각 일대 — 추천 검색 및 맵 고정용 앵커. */
export const JONGNO_GU_MAP_CENTER = { lat: 37.57295, lng: 126.98205 } as const;

/** 대한민국(제주 포함) 대략 경계 — 밖이면 종로구로 폴백. */
export function isLatLngInSouthKorea(lat: number, lng: number): boolean {
  return (
    lat >= 33.0 &&
    lat <= 38.75 &&
    lng >= 124.25 &&
    lng <= 132.35
  );
}

export function resolveRecommendationSearchCenter(lat: number, lng: number): {
  lat: number;
  lng: number;
  usedJongnoFallback: boolean;
} {
  if (isLatLngInSouthKorea(lat, lng)) {
    return { lat, lng, usedJongnoFallback: false };
  }
  return {
    lat: JONGNO_GU_MAP_CENTER.lat,
    lng: JONGNO_GU_MAP_CENTER.lng,
    usedJongnoFallback: true,
  };
}
