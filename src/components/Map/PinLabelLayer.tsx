import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/store/useStore";
import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * HTML label layer that draws POI names below each search-result pin.
 * Labels are rendered **permanently** (no hover required) so users always
 * see what's nearby — matches the spec ("호버 없이도 이름이 나오도록").
 *
 * ### Performance design
 *
 * Earlier each label owned its own `useProjectionLine` hook, which meant N
 * labels × ~7 TMAP/window event subscriptions and N independent React
 * setState + RAF loops per camera change. With ~15 search results this made
 * zoom/drag visibly stutter.
 *
 * This rewrite uses **one subscription, one RAF tick** for ALL labels, and
 * pushes new positions to the DOM via refs + `transform: translate3d` so
 * React isn't involved during pan/zoom at all. Reconciliation only runs when
 * the *list* of labels changes (search results updated, cluster membership
 * changed) — never on map interaction.
 *
 * Coalesced event flow:
 *   zoom_changed / center_changed / drag → schedule(): dedupes via flag,
 *     reads `getProjection()` once, walks the labels array, writes
 *     `el.style.transform` directly. GPU compositing keeps it cheap even
 *     for dozens of labels.
 *   dragstart → starts a per-frame RAF tick (single loop, not per-label).
 *   dragend  → cancels it.
 *
 * `zoom` (continuous, fires per-animation-frame on some SDK builds) is
 * deliberately omitted — `zoom_changed` plus the RAF loop during interaction
 * is enough and avoids doubling the work.
 */
export function PinLabelLayer({ map, Tmapv2 }: Props) {
  const results = useStore((s) => s.searchResults);
  const spotlight = useStore((s) => s.spotlightPois);
  const clusterPois = useStore((s) => s.pois);

  /** Stable filtered list — recomputed only when inputs actually change.
   *  Mirrors `SearchResultMarkers`: union of search hits + spotlight, minus
   *  anything already pinned by the active cluster. */
  const labels = useMemo<POI[]>(() => {
    if (results.length === 0 && spotlight.length === 0) return [];
    const clusterIds = new Set(clusterPois.map((p) => p.id));
    const byId = new Map<string, POI>();
    for (const p of spotlight) {
      if (!clusterIds.has(p.id)) byId.set(p.id, p);
    }
    for (const p of results) {
      if (!clusterIds.has(p.id)) byId.set(p.id, p);
    }
    return Array.from(byId.values());
  }, [results, spotlight, clusterPois]);

  /** poiId → DOM element. Populated via the per-item `ref` callback. */
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!map || !Tmapv2 || labels.length === 0) return;

    /** Position + visibility update. Single sweep across all labels using
     *  one `getProjection()` call. */
    const update = () => {
      const proj = map.getProjection?.();
      if (!proj) return;
      for (const p of labels) {
        const el = itemRefs.current.get(p.id);
        if (!el) continue;
        try {
          const ll = new Tmapv2.LatLng(p.lat, p.lng);
          const px = proj.fromCoordToContainerPixel(ll) as {
            _x?: number;
            _y?: number;
            x?: number;
            y?: number;
          };
          const x = px._x ?? px.x ?? 0;
          const y = px._y ?? px.y ?? 0;
          /* `translate3d` opts the element into a GPU layer so the browser
           * doesn't recompute layout for each move. The trailing
           * `translateX(-50%)` horizontally centres the label under its
           * pin without needing a separate measurement pass. */
          el.style.transform = `translate3d(${x}px, ${y + 18}px, 0) translateX(-50%)`;
          if (el.style.opacity !== "1") el.style.opacity = "1";
        } catch {
          /* swallow per-label errors so one bad point doesn't kill the rest */
        }
      }
    };

    /** Coalesce many events that arrive in the same frame into one update. */
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        update();
      });
    };

    /* Initial paint — without this the labels would flash in at (0,0)
     * before the first event fires. */
    update();

    const handles: unknown[] = [];
    /* `zoom_changed` covers wheel + pinch finalisation; `center_changed`
     * covers programmatic recenter; `drag` covers continuous pan. */
    for (const ev of ["zoom_changed", "center_changed", "drag", "dragend"]) {
      try {
        handles.push(Tmapv2.event.addListener(map, ev, schedule));
      } catch {
        /* event may not be supported by this SDK build */
      }
    }

    /* Single RAF loop during drag, regardless of label count. */
    let raf = 0;
    let dragging = false;
    const onDragStart = () => {
      if (dragging) return;
      dragging = true;
      const tick = () => {
        if (!dragging) return;
        update();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const onDragEnd = () => {
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      schedule();
    };
    try {
      handles.push(Tmapv2.event.addListener(map, "dragstart", onDragStart));
      handles.push(Tmapv2.event.addListener(map, "dragend", onDragEnd));
    } catch {
      /* ignore */
    }

    const onWindowResize = () => schedule();
    window.addEventListener("resize", onWindowResize);

    return () => {
      for (const h of handles) {
        try {
          Tmapv2.event.removeListener(h);
        } catch {
          /* ignore */
        }
      }
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
    };
  }, [map, Tmapv2, labels]);

  if (labels.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {labels.map((p) => (
        <div
          key={p.id}
          ref={(el) => {
            if (el) itemRefs.current.set(p.id, el);
            else itemRefs.current.delete(p.id);
          }}
          /* `top:0; left:0` + JS-driven `translate3d` is the canonical
           * pattern for cheap GPU-composited movement. Horizontal centering
           * (`translateX(-50%)`) is appended in the same JS transform so it
           * isn't overridden by the inline style. */
          className="absolute top-0 left-0 will-change-transform bg-white/95 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] shadow-sm whitespace-nowrap"
          style={{ opacity: 0 }}
        >
          {p.name}
        </div>
      ))}
    </div>
  );
}
