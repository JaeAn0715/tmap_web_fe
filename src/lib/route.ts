import type { POI } from "@/types";

export interface RouteResultPoint {
  lat: number;
  lng: number;
}

/**
 * Real-time traffic congestion level for a stretch of polyline.
 * Source: TMAP routes API `geometry.traffic[i][2]` (`[startIdx, endIdx, level, speedKmh]`).
 *  - 0 정보없음 (gray/blue, no real-time data)
 *  - 1 원활 (green)
 *  - 2 서행 (yellow)
 *  - 3 지체 (orange)
 *  - 4 정체 (red)
 */
export type CongestionLevel = 0 | 1 | 2 | 3 | 4;

/**
 * One color-segment of the polyline. Each segment is a contiguous slice of
 * coordinates with the same congestion level — RouteOverlay draws each as a
 * separate `Tmapv2.Polyline` so colors render natively on the map.
 */
export interface RouteSegment {
  points: RouteResultPoint[];
  congestion: CongestionLevel;
  /** Average speed (km/h) for the segment when reported by TMAP. */
  speedKmh?: number;
}

export interface RouteResult {
  /** Flat list of every coordinate (used for fitBounds). */
  points: RouteResultPoint[];
  /** Per-traffic-bucket subdivision — feed this to the polyline renderer. */
  segments: RouteSegment[];
  totalDistanceMeters?: number;
  totalTimeSeconds?: number;
}

/**
 * Calls TMAP routes API (자동차 경로). Returns geometry for drawing **plus**
 * per-segment realtime traffic congestion when available.
 *
 * The API: https://apis.openapi.sk.com/tmap/routes?version=1
 *
 * IMPORTANT: We pass `appKey` as a URL query parameter (not as a custom HTTP
 * header). Sending `appKey` in the headers triggers a CORS preflight OPTIONS
 * request that the TMAP routes endpoint historically does not respond to with
 * the right headers from arbitrary browser origins, so the polyline silently
 * never loaded. URL auth avoids preflight entirely (a "simple" POST with a
 * `text/plain` Content-Type bypasses the spec's preflight requirement).
 *
 * Traffic info: `trafficInfo: "Y"` makes TMAP attach `geometry.traffic` to
 * every road LineString. The shape is `[[startIdx, endIdx, level, speed], …]`
 * indexing into the LineString's `coordinates` array. We slice each
 * LineString into consecutive `RouteSegment`s based on those indices so the
 * caller can color each stretch by its real-time congestion level.
 */
export async function fetchCarRoute(
  start: POI,
  end: POI
): Promise<RouteResult> {
  const appKey = import.meta.env.VITE_TMAP_APP_KEY as string | undefined;
  if (!appKey) throw new Error("VITE_TMAP_APP_KEY is missing");

  const url =
    `https://apis.openapi.sk.com/tmap/routes?version=1&format=json` +
    `&appKey=${encodeURIComponent(appKey)}`;

  const body = JSON.stringify({
    startX: start.lng,
    startY: start.lat,
    endX: end.lng,
    endY: end.lat,
    reqCoordType: "WGS84GEO",
    resCoordType: "WGS84GEO",
    startName: start.name,
    endName: end.name,
    /* 실시간 교통정보 포함. */
    trafficInfo: "Y",
  });

  // text/plain Content-Type keeps the request a CORS-simple POST. TMAP
  // accepts a JSON body regardless of declared Content-Type as long as it
  // parses cleanly.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TMAP route failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    features?: Array<{
      geometry: {
        type: string;
        coordinates: number[] | number[][];
        /** Optional realtime traffic — array of [startIdx, endIdx, level, speed]. */
        traffic?: number[][];
      };
      properties?: { totalDistance?: number; totalTime?: number };
    }>;
  };

  const features = json.features ?? [];
  const points: RouteResultPoint[] = [];
  const segments: RouteSegment[] = [];
  let totalDistanceMeters: number | undefined;
  let totalTimeSeconds: number | undefined;

  for (const f of features) {
    if (f.properties?.totalDistance) totalDistanceMeters = f.properties.totalDistance;
    if (f.properties?.totalTime) totalTimeSeconds = f.properties.totalTime;
    const g = f.geometry;
    if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      const lineCoords: RouteResultPoint[] = [];
      for (const c of g.coordinates as number[][]) {
        if (Array.isArray(c) && c.length >= 2) {
          lineCoords.push({ lng: c[0], lat: c[1] });
        }
      }
      if (lineCoords.length === 0) continue;
      points.push(...lineCoords);
      const lineSegments = sliceLineByTraffic(lineCoords, g.traffic);
      segments.push(...lineSegments);
    } else if (g.type === "Point" && Array.isArray(g.coordinates)) {
      const c = g.coordinates as number[];
      if (c.length >= 2) points.push({ lng: c[0], lat: c[1] });
    }
  }
  return { points, segments, totalDistanceMeters, totalTimeSeconds };
}

/**
 * Convert one LineString + its traffic spans into colored sub-segments.
 *
 * Traffic spans are non-overlapping `[startIdx, endIdx]` slices of the
 * LineString's coordinate array. Coordinates that fall outside any span (or
 * the entire line if `traffic` is missing/empty) are emitted as level-0
 * "no info" segments so the renderer still draws them in the default color.
 *
 * Each emitted segment **shares its boundary coordinate** with the previous
 * one — that visual overlap of one point hides any anti-aliasing gap between
 * adjacent polylines on the map.
 */
function sliceLineByTraffic(
  coords: RouteResultPoint[],
  traffic: number[][] | undefined
): RouteSegment[] {
  if (coords.length < 2) return [];
  if (!traffic || traffic.length === 0) {
    return [{ points: coords, congestion: 0 }];
  }
  /* Sort spans by startIdx so we can walk the line monotonically. */
  const spans = traffic
    .filter(
      (t) =>
        Array.isArray(t) && t.length >= 3 && Number.isFinite(t[0]) && Number.isFinite(t[1])
    )
    .map((t) => ({
      start: Math.max(0, Math.floor(t[0])),
      end: Math.min(coords.length - 1, Math.floor(t[1])),
      level: clampLevel(t[2]),
      speed: typeof t[3] === "number" ? t[3] : undefined,
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const out: RouteSegment[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) {
      // Fill the unmarked gap with a level-0 segment.
      out.push({
        points: coords.slice(cursor, s.start + 1),
        congestion: 0,
      });
    }
    out.push({
      points: coords.slice(s.start, s.end + 1),
      congestion: s.level,
      speedKmh: s.speed,
    });
    cursor = s.end;
  }
  if (cursor < coords.length - 1) {
    out.push({
      points: coords.slice(cursor),
      congestion: 0,
    });
  }
  return out.filter((seg) => seg.points.length >= 2);
}

function clampLevel(n: unknown): CongestionLevel {
  const v = Math.round(Number(n));
  if (v >= 0 && v <= 4) return v as CongestionLevel;
  return 0;
}

/** TMAP app deep link for navigation. */
export function tmapDeepLink(end: POI): string {
  const params = new URLSearchParams({
    name: end.name,
    lon: String(end.lng),
    lat: String(end.lat),
  });
  return `tmap://route?goalname=${encodeURIComponent(end.name)}&goalx=${end.lng}&goaly=${end.lat}&${params.toString()}`;
}
