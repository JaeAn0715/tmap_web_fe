import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { fetchCarRoute, tmapDeepLink } from "@/lib/route";
import type { CongestionLevel } from "@/lib/route";
import type {
  TmapMap,
  TmapMarker,
  TmapPolyline,
  Tmapv2Namespace,
} from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * 실시간 교통상황 색상표.
 *  - 0 정보없음: 기본 파랑
 *  - 1 원활: 초록
 *  - 2 서행: 노랑
 *  - 3 지체: 주황
 *  - 4 정체: 빨강
 *
 * Reused for both the polylines on the map and the legend in the bottom card.
 */
const TRAFFIC_COLOR: Record<CongestionLevel, string> = {
  0: "#3b82f6",
  1: "#16a34a",
  2: "#facc15",
  3: "#f97316",
  4: "#dc2626",
};
const TRAFFIC_LABEL: Record<CongestionLevel, string> = {
  0: "정보 없음",
  1: "원활",
  2: "서행",
  3: "지체",
  4: "정체",
};

/** TMAP-hosted pin icons (same family used elsewhere in the app). */
const ICON_START = "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_g_m_s.png";
const ICON_END = "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_r_m_e.png";
/** Fallback if the `_s` / `_e` variants are unavailable on a given build. */
const ICON_START_FALLBACK = "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_b_m_p.png";
const ICON_END_FALLBACK = "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_r_m_p.png";

/**
 * Renders the active route as **native TMAP `Polyline` overlays** on the map,
 * subdivided by realtime congestion level (color-coded), plus dedicated
 * 출발/도착 markers.
 *
 * Lifecycle:
 *   - Mounted at App level whenever `ready` is true.
 *   - Returns `null` and removes overlays when `routeActive` is false or
 *     either endpoint is missing.
 *   - On (start, end) change, calls `fetchCarRoute` and rebuilds polylines
 *     and markers; the map is panned/zoomed to fit on success.
 */
export function RouteOverlay({ map, Tmapv2 }: Props) {
  const routeActive = useStore((s) => s.routeActive);
  const start = useStore((s) => s.routeStart);
  const end = useStore((s) => s.routeEnd);
  const setRouteActive = useStore((s) => s.setRouteActive);

  const [meta, setMeta] = useState<{ distance?: number; time?: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [legend, setLegend] = useState<Set<CongestionLevel>>(new Set());

  const polysRef = useRef<TmapPolyline[]>([]);
  const markersRef = useRef<TmapMarker[]>([]);

  const clearOverlays = () => {
    for (const p of polysRef.current) p.setMap(null);
    polysRef.current = [];
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
  };

  useEffect(() => {
    if (!map || !Tmapv2 || !routeActive || !start || !end) {
      clearOverlays();
      setMeta(null);
      setError(null);
      setLegend(new Set());
      return;
    }

    let cancelled = false;
    setError(null);
    setMeta(null);
    setLegend(new Set());

    fetchCarRoute(start, end)
      .then((r) => {
        if (cancelled) return;
        if (!r.segments.length || r.points.length < 2) {
          setError("경로 데이터를 받지 못했습니다.");
          return;
        }
        clearOverlays();

        /* One native polyline per traffic-colored segment. */
        const seenLevels = new Set<CongestionLevel>();
        for (const seg of r.segments) {
          if (seg.points.length < 2) continue;
          const path = seg.points.map(
            (p) => new Tmapv2.LatLng(p.lat, p.lng)
          );
          const poly = new Tmapv2.Polyline({
            path,
            strokeColor: TRAFFIC_COLOR[seg.congestion],
            strokeWeight: 6,
            strokeOpacity: 0.9,
            map,
          });
          polysRef.current.push(poly);
          seenLevels.add(seg.congestion);
        }
        setLegend(seenLevels);

        /* 출발 / 도착 마커. iconSize is approximate; SDK falls back gracefully. */
        markersRef.current.push(
          makeMarker(Tmapv2, map, start.lat, start.lng, ICON_START, "출발", ICON_START_FALLBACK)
        );
        markersRef.current.push(
          makeMarker(Tmapv2, map, end.lat, end.lng, ICON_END, "도착", ICON_END_FALLBACK)
        );

        setMeta({
          distance: r.totalDistanceMeters,
          time: r.totalTimeSeconds,
        });

        /* Pan/zoom to fit the route. Best-effort — older SDK builds may not
         * expose `fitBounds` / `LatLngBounds`. */
        try {
          if (map.fitBounds && Tmapv2.LatLngBounds) {
            const bounds = new Tmapv2.LatLngBounds();
            bounds.extend(new Tmapv2.LatLng(start.lat, start.lng));
            bounds.extend(new Tmapv2.LatLng(end.lat, end.lng));
            for (const p of r.points) {
              bounds.extend(new Tmapv2.LatLng(p.lat, p.lng));
            }
            map.fitBounds(bounds);
          }
        } catch {
          /* ignore */
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      clearOverlays();
    };
  }, [map, Tmapv2, routeActive, start, end]);

  if (!routeActive || !start || !end) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-white border rounded-lg shadow px-3 py-2 text-xs flex items-center gap-3 max-w-[92vw]">
      <div className="min-w-0">
        <div className="font-semibold truncate">
          🟢 {start.name} <span className="text-gray-400">→</span> 🔴 {end.name}
        </div>
        {meta && (meta.distance || meta.time) ? (
          <div className="text-gray-700">
            <span aria-hidden>🚗</span> 자동차 ·{" "}
            {meta.distance ? formatDistance(meta.distance) : ""}
            {meta.time ? ` · 약 ${formatDuration(meta.time)}` : ""}
          </div>
        ) : !error ? (
          <div className="text-gray-400">경로를 불러오는 중…</div>
        ) : null}
        {error && <div className="text-red-600">{error}</div>}
        {legend.size > 0 && <TrafficLegend levels={legend} />}
      </div>
      <a
        href={tmapDeepLink(end)}
        className="bg-brand text-white text-xs px-2 py-1 rounded hover:bg-brand-dark whitespace-nowrap"
      >
        티맵 안내 시작
      </a>
      <button
        className="text-gray-500 hover:text-gray-800 text-xs"
        onClick={() => setRouteActive(false)}
      >
        닫기
      </button>
    </div>
  );
}

function TrafficLegend({ levels }: { levels: Set<CongestionLevel> }) {
  /* Always present 1→4 in order so the legend is stable; "정보 없음"(0)
   * shown only when at least one segment falls into it. */
  const order: CongestionLevel[] = [1, 2, 3, 4, 0];
  const visible = order.filter((l) => levels.has(l));
  if (visible.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
      <span>실시간 교통:</span>
      {visible.map((l) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-2 rounded-sm"
            style={{ backgroundColor: TRAFFIC_COLOR[l] }}
            aria-hidden
          />
          {TRAFFIC_LABEL[l]}
        </span>
      ))}
    </div>
  );
}

function makeMarker(
  Tmapv2: Tmapv2Namespace,
  map: TmapMap,
  lat: number,
  lng: number,
  iconUrl: string,
  title: string,
  fallback?: string
): TmapMarker {
  try {
    const m = new Tmapv2.Marker({
      position: new Tmapv2.LatLng(lat, lng),
      icon: iconUrl,
      map,
      title,
    });
    /* If the icon never resolves (HTTP 404 against the CDN), some SDK builds
     * silently leave the marker iconless. We can't introspect that easily,
     * but we can swap to the fallback after a tick if available. */
    if (fallback) {
      window.setTimeout(() => {
        try {
          m.setIcon?.(iconUrl);
        } catch {
          try {
            m.setIcon?.(fallback);
          } catch {
            /* ignore */
          }
        }
      }, 0);
    }
    return m;
  } catch {
    return new Tmapv2.Marker({
      position: new Tmapv2.LatLng(lat, lng),
      icon: fallback ?? iconUrl,
      map,
      title,
    });
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds: number): string {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
