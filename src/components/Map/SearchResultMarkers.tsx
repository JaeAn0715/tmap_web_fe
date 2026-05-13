import { useEffect, useMemo, useRef } from "react";
import { useStore } from "@/store/useStore";
import type { POI } from "@/types";
import type { TmapMap, TmapMarker, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * Renders TMAP markers for *transient* POIs the user is currently exploring:
 *   - keyword search results (`searchResults`)
 *   - recommendation rows the user clicked (`spotlightPois`)
 *
 * Both surfaces share the same red pin so the visual model is "this is a
 * candidate I'm considering, not yet in any cluster". Click → select so
 * the matching side-panel row can scroll into view; the actual "add to
 * cluster" affordance lives on the side-panel row's `+` button.
 *
 * We deliberately filter out POIs already present in the active cluster so
 * we don't stack two markers on the same coordinate, and we dedupe between
 * the two transient sources by id.
 */
export function SearchResultMarkers({ map, Tmapv2 }: Props) {
  const results = useStore((s) => s.searchResults);
  const spotlight = useStore((s) => s.spotlightPois);
  const clusterPois = useStore((s) => s.pois);
  const selectPoi = useStore((s) => s.selectPoi);
  const markersRef = useRef<Map<string, TmapMarker>>(new Map());

  /** Union of search hits and spotlight, deduped by id. Search results win
   *  the slot when both contain the same POI (newer canonical metadata). */
  const transient = useMemo<POI[]>(() => {
    if (results.length === 0 && spotlight.length === 0) return [];
    const byId = new Map<string, POI>();
    for (const p of spotlight) byId.set(p.id, p);
    for (const p of results) byId.set(p.id, p);
    return Array.from(byId.values());
  }, [results, spotlight]);

  useEffect(() => {
    if (!map || !Tmapv2) return;
    const live = markersRef.current;
    const clusterIds = new Set(clusterPois.map((p) => p.id));
    const seen = new Set<string>();

    for (const poi of transient) {
      if (clusterIds.has(poi.id)) continue;
      seen.add(poi.id);
      let m = live.get(poi.id);
      if (!m) {
        m = new Tmapv2.Marker({
          position: new Tmapv2.LatLng(poi.lat, poi.lng),
          icon: "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_r_m_p.png",
          map,
          title: poi.name,
        });
        Tmapv2.event.addListener(m, "click", () => {
          selectPoi(poi.id);
        });
        live.set(poi.id, m);
      }
    }

    for (const [id, marker] of live.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        live.delete(id);
      }
    }
  }, [map, Tmapv2, transient, clusterPois, selectPoi]);

  useEffect(() => {
    return () => {
      for (const m of markersRef.current.values()) m.setMap(null);
      markersRef.current.clear();
    };
  }, []);

  return null;
}
