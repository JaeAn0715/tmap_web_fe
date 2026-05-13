import { useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "@/store/useStore";
import { flyToPoi } from "@/lib/mapAnimate";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/* Same bounds the wheel handler uses — keeps the +/− buttons consistent
 * with mouse-wheel zoom. */
const MIN_ZOOM = 7;
const MAX_ZOOM = 20;

/** Zoom level we glide to when the user taps the "현재 위치로 이동" button.
 *  17 felt too tight (block-level), 14 too loose; 16 reads as "neighborhood
 *  with street labels" which matches what apps like Naver/Kakao do. */
const MY_LOCATION_ZOOM = 16;

/**
 * In-map control overlay.
 *
 * Two stacks, both absolutely positioned inside the `<main>` map area:
 *
 *   - **Bottom-left**: vertical zoom stack — `+` and `−` buttons only.
 *     Replaces the SDK's right-edge built-in `zoomControl` (we opt out of
 *     it in `useTmapMap`). Per spec, the previously-added "current zoom
 *     level" indicator was rolled back; only the +/− buttons remain at
 *     the bottom-left. We still subscribe to `zoom_changed` so the
 *     buttons can disable themselves at the zoom range edges (no point
 *     enabling `+` at MAX_ZOOM).
 *   - **Bottom-right**: ◎ 현재 위치로 이동. Shown only once geolocation
 *     has resolved a position (`userLocation` non-null) — when location
 *     access is denied we leave the existing "위치 권한 거부" banner in
 *     that corner instead of stacking a non-functional disabled button.
 *
 * The +/− buttons go through plain `map.setZoom`, NOT `programmaticSetZoom`,
 * so the resulting `zoom_changed` event is correctly counted by
 * `useMapCenter` as a user move (matching wheel-zoom behaviour). The
 * "current location" button uses `flyToPoi`, whose programmatic setZoom
 * is suppressed via `consumeProgrammaticZoom` — so gliding back to the
 * user's location does NOT pop the recommendations refresh button by
 * itself (the user explicitly chose this destination).
 */
export function MapControls({ map, Tmapv2 }: Props) {
  const userLocation = useStore((s) => s.userLocation);
  /* We track the zoom level locally only to drive the +/− disable state
   * at the MIN/MAX bounds — the value isn't displayed any more (rolled
   * back per spec). Re-reading via `map.getZoom()` on each `zoom_changed`
   * keeps wheel/+−/flyToPoi/fitBounds in sync without any per-source
   * special handling. */
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (!map || !Tmapv2) return;
    const readZoom = () => {
      try {
        setZoom(map.getZoom());
      } catch {
        /* SDK transient — keep the previous reading. */
      }
    };
    readZoom();
    let handle: unknown = null;
    try {
      handle = Tmapv2.event.addListener(map, "zoom_changed", readZoom);
    } catch {
      /* event not supported on this SDK build — buttons stay enabled
       * indefinitely; not a fatal degradation. */
    }
    return () => {
      if (handle) {
        try {
          Tmapv2.event.removeListener(handle);
        } catch {
          /* ignore */
        }
      }
    };
  }, [map, Tmapv2]);

  if (!map || !Tmapv2) return null;

  const onZoomIn = () => {
    try {
      const cur = map.getZoom();
      if (cur < MAX_ZOOM) map.setZoom(cur + 1);
    } catch {
      /* SDK rejected — nothing to do, the next click will retry. */
    }
  };

  const onZoomOut = () => {
    try {
      const cur = map.getZoom();
      if (cur > MIN_ZOOM) map.setZoom(cur - 1);
    } catch {
      /* SDK rejected — nothing to do. */
    }
  };

  const onMyLocation = () => {
    if (!userLocation) return;
    flyToPoi(map, Tmapv2, userLocation.lat, userLocation.lng, {
      zoom: MY_LOCATION_ZOOM,
    });
  };

  const zoomInDisabled = zoom != null && zoom >= MAX_ZOOM;
  const zoomOutDisabled = zoom != null && zoom <= MIN_ZOOM;

  return (
    <>
      {/* Bottom-left: zoom controls (+ / −).
       *  No level-number display in between — that was rolled back per
       *  user spec ("줌레벨 보여주는 ui는 이전버전으로 롤백하고 위치는
       *  지금 위치로 해줘"). The two buttons sit directly adjacent. */}
      <div
        className="absolute bottom-3 left-3 z-30 flex flex-col bg-white rounded-md shadow border overflow-hidden select-none divide-y"
        role="group"
        aria-label="줌 컨트롤"
      >
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoomInDisabled}
          className={clsx(
            "w-9 h-9 flex items-center justify-center text-lg leading-none transition",
            zoomInDisabled
              ? "text-gray-300 cursor-not-allowed"
              : "hover:bg-gray-100 active:bg-gray-200 text-gray-700"
          )}
          aria-label="줌인"
          title="줌인"
        >
          +
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoomOutDisabled}
          className={clsx(
            "w-9 h-9 flex items-center justify-center text-lg leading-none transition",
            zoomOutDisabled
              ? "text-gray-300 cursor-not-allowed"
              : "hover:bg-gray-100 active:bg-gray-200 text-gray-700"
          )}
          aria-label="줌아웃"
          title="줌아웃"
        >
          −
        </button>
      </div>

      {/* Bottom-right: 현재 위치로 이동.
       *  Rendered only when geolocation has resolved a position; otherwise
       *  the existing "위치 권한 거부" amber banner (in `App.tsx`) sits in
       *  this corner and there's no useful action to expose.  */}
      {userLocation && (
        <button
          type="button"
          onClick={onMyLocation}
          className="absolute bottom-3 right-3 z-30 w-10 h-10 rounded-full bg-white border shadow flex items-center justify-center text-base transition hover:bg-blue-50 active:scale-95 text-blue-600"
          aria-label="현재 위치로 이동"
          title="현재 위치로 이동"
        >
          ◎
        </button>
      )}
    </>
  );
}
