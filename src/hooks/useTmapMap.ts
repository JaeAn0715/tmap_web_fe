import { useEffect, useRef, useState } from "react";
import { loadTmapSdk } from "@/lib/tmapLoader";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Options {
  center?: { lat: number; lng: number };
  zoom?: number;
}

interface MapHandle {
  /** Container ref to attach to a div. */
  containerRef: React.RefObject<HTMLDivElement>;
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
  ready: boolean;
  error: string | null;
}

/**
 * Initializes a TMAP v2 map instance against `window.Tmapv2`.
 *
 * Why useEffect:
 *   - SSR-safety: `window.Tmapv2` only exists at runtime in the browser.
 *   - StrictMode double-mount in dev: we destroy on cleanup so re-mount doesn't leak.
 *   - The SDK is loaded async, so creating the map must happen *after* the script
 *     resolves; doing it in a render body would race the SDK load.
 */
export function useTmapMap({
  center = { lat: 37.5665, lng: 126.978 }, // Seoul City Hall
  zoom = 14,
}: Options = {}): MapHandle {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<TmapMap | null>(null);
  const [Tmapv2, setTmapv2] = useState<Tmapv2Namespace | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Holds the wheel-zoom listener cleanup so the effect can detach it on unmount. */
  const detachWheelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const appKey = import.meta.env.VITE_TMAP_APP_KEY as string | undefined;

    loadTmapSdk(appKey)
      .then((NS) => {
        if (cancelled || !containerRef.current) return;
        const m = new NS.Map(containerRef.current, {
          center: new NS.LatLng(center.lat, center.lng),
          width: "100%",
          height: "100%",
          zoom,
          /* SDK's built-in `zoomControl` (right edge, +/− only) is replaced
           * by the custom `<MapControls />` overlay (`src/components/Map/
           * MapControls.tsx`) which lives at the bottom-left of the map
           * area and additionally shows the *current* zoom level — per
           * spec: "지도 오른쪽에 줌 레벨을 보여주는 인터페이스를 화면
           * 왼쪽 아래로 이동한다." */
          zoomControl: false,
          /* We disable the SDK's built-in wheel zoom and replace it with our
           * own debounced handler below. The native handler fires `setZoom`
           * once per wheel delta event — which on macOS trackpads/Magic Mouse
           * is 10–20+ events per physical scroll, each one reloading the
           * tile pyramid and triggering `zoom_changed`. The debounced version
           * coalesces a whole scroll burst into a single `setZoom(target)`,
           * which is what the click-on-zoom-button path already does. */
          scrollwheel: false,
          httpsMode: true,
        });
        setTmapv2(NS);
        setMap(m);
        setReady(true);

        detachWheelRef.current = attachDebouncedWheelZoom(m, containerRef.current);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      // Detach the custom wheel listener BEFORE wiping the container so we
      // don't leak event handlers on the persistent container element across
      // StrictMode double-mounts.
      detachWheelRef.current?.();
      detachWheelRef.current = null;
      // Best-effort teardown. The SDK's destroy API isn't formally typed, so
      // we feature-detect and fall back to clearing the container.
      setMap((prev) => {
        try {
          prev?.destroy?.();
        } catch {
          /* no-op */
        }
        return null;
      });
      if (containerRef.current) containerRef.current.innerHTML = "";
      setReady(false);
    };
    // We intentionally only run once; map center/zoom are imperative after init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, map, Tmapv2, ready, error };
}

/* ------------------------------------------------------------------------ */
/* Debounced wheel zoom                                                     */
/* ------------------------------------------------------------------------ */

const MIN_ZOOM = 7;
const MAX_ZOOM = 20;
/** ms of "no wheel events" we wait before applying the accumulated zoom. */
const WHEEL_DEBOUNCE_MS = 50;
/** Pixels of accumulated `deltaY` that translate into one zoom level. Tuned
 *  so a single trackpad flick or one mouse-wheel notch ≈ 1 step. */
const PX_PER_LEVEL = 100;
/** Hard cap so an aggressive flick can't jump 8 levels at once (which would
 *  feel like teleportation and force a huge tile reload anyway). */
const MAX_STEP_PER_BURST = 4;

/**
 * Replaces TMAP's per-event wheel zoom with a debounced one.
 *
 * macOS sends a flurry of high-resolution wheel events for one physical
 * scroll (especially on trackpads / Magic Mouse). The native SDK handler
 * applies `setZoom(z + 1)` per event, which means a single user gesture can
 * trigger 10+ tile-pyramid reloads and 10+ `zoom_changed` events. That's the
 * stutter the user reported.
 *
 * Strategy:
 *   - Capture wheel events on the map container.
 *   - Accumulate `deltaY`, normalised across `deltaMode` (Firefox uses lines).
 *   - After {@link WHEEL_DEBOUNCE_MS} of silence, compute one target zoom
 *     and call `map.setZoom(target)` exactly once. The SDK then fires
 *     `zoom_changed` once and reloads the tile pyramid once — the same
 *     code path that the +/- zoom buttons exercise (which the user reports
 *     as smooth).
 *   - Pinch zoom on Chromium injects `ctrlKey: true` on wheel events; we
 *     treat those identically.
 *
 * Returns a detach function for cleanup.
 */
function attachDebouncedWheelZoom(map: TmapMap, container: HTMLDivElement): () => void {
  let accumulated = 0;
  let timer: number | null = null;

  const apply = () => {
    timer = null;
    if (accumulated === 0) return;
    /* Wheel down (positive deltaY) means zoom out by convention. */
    const direction = accumulated > 0 ? -1 : 1;
    const magnitude = Math.min(
      MAX_STEP_PER_BURST,
      Math.max(1, Math.round(Math.abs(accumulated) / PX_PER_LEVEL))
    );
    accumulated = 0;
    let cur = 14;
    try {
      cur = map.getZoom();
    } catch {
      /* fall back to default */
    }
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cur + direction * magnitude));
    if (next === cur) return;
    try {
      map.setZoom(next);
    } catch {
      /* SDK rejected the call — nothing to do, the next gesture will retry */
    }
  };

  const onWheel = (e: WheelEvent) => {
    /* preventDefault stops the page from scrolling and stops any bubbling
     * handler (including the SDK's, in case scrollwheel:false didn't take
     * on this build) from doubling the work. */
    e.preventDefault();
    /* Normalise: line mode (Firefox) ≈ 16px per line; page mode rare. */
    const px =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    accumulated += px;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(apply, WHEEL_DEBOUNCE_MS);
  };

  /* `passive: false` is required because we call preventDefault. Capture
   * phase ensures we run before any descendant handler the SDK may have
   * attached (defence-in-depth alongside scrollwheel:false). */
  container.addEventListener("wheel", onWheel, { passive: false, capture: true });

  return () => {
    container.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
