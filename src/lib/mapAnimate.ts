import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

/**
 * Smooth pan-and-zoom helper for TMAP V2.
 *
 * The SDK exposes only synchronous `setCenter` / `setZoom` (no animated
 * `panTo` / `flyTo`), so we build the animation ourselves: interpolate the
 * map center over `durationMs` using easeOutCubic, then snap to the target
 * zoom in a single call at the *end* of the pan.
 *
 * Why "zoom only at the end" instead of co-animating zoom every frame:
 *   - Each `setZoom()` triggers a tile-pyramid reload. Zooming N times in
 *     animation frames thrashes the network and produces visible flicker
 *     (the same root cause as the wheel-zoom stutter we already fixed in
 *     `attachDebouncedWheelZoom`).
 *   - `setCenter()` is cheap — no tile reload, just viewport translation —
 *     so calling it ~60 times per second is fine.
 *   - End result feels like Apple Maps' "tap a result → glide" behaviour:
 *     a smooth pan, then a single crisp zoom-in once you're roughly there.
 *
 * Cancellation: returning a `cancel()` lets a follow-up flyTo abort an
 * in-progress one (e.g. user clicks two results in quick succession). We
 * also short-circuit if the destination is essentially where we already
 * are — no point burning frames for a sub-pixel move.
 */

export interface FlyToOptions {
  /** Total animation duration in ms. Default 380. */
  durationMs?: number;
  /**
   * Target zoom level. If `undefined`, zoom is left untouched. If less
   * than the current zoom, we still respect it (caller might want to fit
   * a wider view).
   */
  zoom?: number;
  /**
   * If true, applies the zoom *before* the pan starts. Useful when you
   * want the user to immediately see street-level tiles for the source
   * area first. Default false (zoom at end → pan stays smooth).
   */
  zoomFirst?: boolean;
}

interface CancelHandle {
  cancel: () => void;
}

/** easeOutCubic — fast start, gentle settle. Matches what feels natural for
 *  "I clicked a thing and the map is moving to it." */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ----------------------- programmatic zoom signal ------------------------
 *
 * `flyToPoi`'s deferred `setZoom` fires the SDK's `zoom_changed` event,
 * which is otherwise indistinguishable from a real user wheel/+/− zoom
 * (the SDK doesn't tell us who initiated the change).
 *
 * We need that distinction in `useMapCenter` so the recommendations
 * section's "user moved the map → show 새로고침 button" detector doesn't
 * fire spuriously every time `PoiDetailView`'s mount/unmount flies the
 * camera. The convention:
 *
 *   - Right before `flyToPoi` calls `map.setZoom(z)` it bumps
 *     `pendingProgrammaticZooms`.
 *   - When `useMapCenter`'s `zoom_changed` listener fires, it calls
 *     `consumeProgrammaticZoom()`. If the counter was > 0, the listener
 *     treats this as system-initiated (no userMoves bump). Otherwise the
 *     event came from a wheel scroll / +/− button / pinch — i.e. real
 *     user intent — and counts.
 *
 * Module-scope counter (not store) because it's a low-level detail of
 * the SDK adapter and has no UI surface; nothing else cares.
 */
let pendingProgrammaticZooms = 0;

/**
 * Called by `useMapCenter` when a `zoom_changed` event fires. Returns
 * `true` if the event corresponds to one of our own `flyToPoi`-initiated
 * `setZoom` calls (and decrements the counter), `false` otherwise.
 */
export function consumeProgrammaticZoom(): boolean {
  if (pendingProgrammaticZooms > 0) {
    pendingProgrammaticZooms--;
    return true;
  }
  return false;
}

/**
 * Wrapper around `map.setZoom` that registers the call as a "system-
 * initiated" zoom for downstream consumers. If the SDK throws, the
 * optimistic increment is reversed because `zoom_changed` won't fire
 * (and otherwise the counter would leak, swallowing a future real
 * user zoom).
 */
function programmaticSetZoom(map: TmapMap, zoom: number): void {
  pendingProgrammaticZooms++;
  try {
    map.setZoom(zoom);
  } catch {
    pendingProgrammaticZooms--;
  }
}

/**
 * Animate the map to (lat, lng) and optionally to `zoom`. Returns a handle
 * with a `cancel()` so a follow-up flight can preempt this one.
 *
 * No-ops cleanly when the SDK isn't ready or the camera is already at the
 * target (within ~1e-7 degrees on both axes and exact zoom match).
 */
export function flyToPoi(
  map: TmapMap | null,
  Tmapv2: Tmapv2Namespace | null,
  lat: number,
  lng: number,
  options: FlyToOptions = {}
): CancelHandle {
  const noop: CancelHandle = { cancel: () => {} };
  if (!map || !Tmapv2) return noop;

  const { durationMs = 380, zoom, zoomFirst = false } = options;

  let startLat: number;
  let startLng: number;
  let startZoom: number;
  try {
    const c = map.getCenter();
    startLat = c.lat();
    startLng = c.lng();
    startZoom = map.getZoom();
  } catch {
    return noop;
  }

  /** Squared-degree distance is a reasonable proxy for "is the move worth
   *  animating?" The map projection is approximately conformal at city scale,
   *  so 1e-7 ≈ 1cm at 37°N — well below pixel resolution. */
  const dLat = lat - startLat;
  const dLng = lng - startLng;
  const negligibleMove = Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7;
  const sameZoom = zoom == null || zoom === startZoom;

  if (negligibleMove && sameZoom) return noop;

  /* Single-frame fast path: if the move is tiny but the zoom changes, just
   * call setZoom and skip the pan animation entirely. */
  if (negligibleMove && !sameZoom) {
    if (zoom != null) programmaticSetZoom(map, zoom);
    return noop;
  }

  if (zoomFirst && zoom != null && zoom !== startZoom) {
    programmaticSetZoom(map, zoom);
  }

  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - t0) / durationMs);
    const k = easeOutCubic(t);
    const curLat = startLat + dLat * k;
    const curLng = startLng + dLng * k;
    try {
      map.setCenter(new Tmapv2.LatLng(curLat, curLng));
    } catch {
      /* swallow — map could have been torn down mid-animation */
      return;
    }
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      /* Apply the (deferred) zoom now that the pan landed. The single late
       * setZoom triggers exactly one tile reload, matching what the +/- zoom
       * buttons do. We funnel through `programmaticSetZoom` so the
       * resulting `zoom_changed` event is suppressed from the user-moves
       * counter (otherwise PoiDetailView's enter/exit fly would pop the
       * recommendations refresh button). */
      if (!zoomFirst && zoom != null && zoom !== startZoom) {
        programmaticSetZoom(map, zoom);
      }
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    cancel: () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/**
 * Instant pan + zoom for system positioning (e.g. recommendations when the
 * camera is outside Korea). `zoom_changed` is marked programmatic so
 * `useMapCenter` does not treat it as a user move.
 */
export function snapMapProgrammatically(
  map: TmapMap | null,
  Tmapv2: Tmapv2Namespace | null,
  lat: number,
  lng: number,
  zoom = 15
): void {
  if (!map || !Tmapv2) return;
  try {
    map.setCenter(new Tmapv2.LatLng(lat, lng));
  } catch {
    return;
  }
  programmaticSetZoom(map, zoom);
}
