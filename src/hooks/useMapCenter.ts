import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { consumeProgrammaticZoom } from "@/lib/mapAnimate";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

export interface MapMovement {
  /** Current map center, or null until the map is ready. */
  center: { lat: number; lng: number } | null;
  /**
   * Counter that bumps on user-driven camera changes — `dragend` (pan),
   * pointer-drag on the map container (when provided), wheel zoom, +/−.
   *
   * Programmatic `setCenter` / `setZoom` calls do NOT count:
   *   - `setCenter` because we don't subscribe to `center_changed` at all.
   *   - `setZoom` is trickier because the SDK fires `zoom_changed` for
   *     *every* zoom change, programmatic or user. We filter those out
   *     for `flyToPoi`-initiated zooms via `consumeProgrammaticZoom`
   *     (see `lib/mapAnimate.ts`). Wheel and button zoom go through
   *     plain `setZoom` and are correctly counted as user moves.
   *
   * Consumers (e.g. `RecommendationsSection`) compare current `userMoves`
   * against a saved snapshot to decide whether the user has interacted
   * with the map since some checkpoint.
   */
  userMoves: number;
}

/**
 * Returns the map's current center and a counter of user-driven camera
 * interactions. We listen to `dragend` (not `drag`) to avoid a re-render storm
 * during pan, `zoom_changed` (filtered to exclude system flyToPoi zooms), and
 * — when `mapContainerRef` is provided — **pointer drag** on the map DOM
 * (covers touch / builds where `dragend` on the map instance is flaky).
 */
export function useMapCenter(
  map: TmapMap | null,
  Tmapv2: Tmapv2Namespace | null,
  mapContainerRef?: RefObject<HTMLDivElement | null>
): MapMovement {
  const [state, setState] = useState<MapMovement>({
    center: null,
    userMoves: 0,
  });
  const lastBumpMsRef = useRef(0);

  useEffect(() => {
    if (!map || !Tmapv2) return;

    const readCenter = (): { lat: number; lng: number } | null => {
      try {
        const c = map.getCenter();
        return { lat: c.lat(), lng: c.lng() };
      } catch {
        return null;
      }
    };

    // Seed with the current center but DON'T bump userMoves.
    setState((prev) => ({
      center: readCenter() ?? prev.center,
      userMoves: prev.userMoves,
    }));

    /** Coalesce dragend + pointer + zoom bursts so one gesture ≈ one bump. */
    const bumpUserMove = () => {
      const now = Date.now();
      if (now - lastBumpMsRef.current < 280) return;
      lastBumpMsRef.current = now;
      setState((prev) => ({
        center: readCenter() ?? prev.center,
        userMoves: prev.userMoves + 1,
      }));
    };

    const onDragEnd = () => {
      bumpUserMove();
    };

    const onZoomChanged = () => {
      /* Filter out our own `flyToPoi`-initiated zooms — they shouldn't
       * count as the user moving the map. Wheel zoom / +/− buttons go
       * through plain `setZoom` (no counter bump in flyToPoi) so they
       * still flow through the `else` branch and bump `userMoves`. */
      const programmatic = consumeProgrammaticZoom();
      if (programmatic) {
        setState((prev) => ({
          center: readCenter() ?? prev.center,
          userMoves: prev.userMoves,
        }));
        return;
      }
      bumpUserMove();
    };

    const handles: unknown[] = [];
    try {
      handles.push(Tmapv2.event.addListener(map, "dragend", onDragEnd));
    } catch {
      /* event may not be supported */
    }
    try {
      handles.push(
        Tmapv2.event.addListener(map, "zoom_changed", onZoomChanged)
      );
    } catch {
      /* event may not be supported */
    }

    const el = mapContainerRef?.current;
    let down: { x: number; y: number } | null = null;
    const PX2 = 12 * 12; // ~12px movement counts as a pan

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!e.isPrimary || !down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (dx * dx + dy * dy < PX2) return;
      bumpUserMove();
    };

    if (el) {
      el.addEventListener("pointerdown", onPointerDown, { capture: true });
      window.addEventListener("pointerup", onPointerUp, { capture: true });
    }

    return () => {
      for (const h of handles) {
        try {
          Tmapv2.event.removeListener(h);
        } catch {
          /* ignore */
        }
      }
      if (el) {
        el.removeEventListener("pointerdown", onPointerDown, {
          capture: true,
        } as EventListenerOptions);
        window.removeEventListener("pointerup", onPointerUp, {
          capture: true,
        } as EventListenerOptions);
      }
    };
  }, [map, Tmapv2, mapContainerRef]);

  return state;
}

/** Approximate ground distance between two lat/lng points (in km). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // earth radius km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
