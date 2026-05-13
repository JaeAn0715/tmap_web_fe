import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import type {
  TmapLatLng,
  TmapMap,
  TmapMarker,
  Tmapv2Namespace,
} from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * Renders one TMAP marker per destination in the **active cluster**, syncing
 * add/remove with the store. Selected pin is drawn in blue, all others red.
 *
 * Pin click behaviour: select the destination so the side panel can scroll /
 * highlight the matching row. There is no longer a sticky note to spawn —
 * the cluster detail view is the only "card" surface for a destination.
 */
export function PinLayer({ map, Tmapv2 }: Props) {
  const pois = useStore((s) => s.pois);
  const selectedId = useStore((s) => s.selectedId);
  const selectPoi = useStore((s) => s.selectPoi);
  const markersRef = useRef<Map<string, TmapMarker>>(new Map());

  useEffect(() => {
    if (!map || !Tmapv2) return;
    const live = markersRef.current;
    const seen = new Set<string>();
    /** TMAP `setPosition` → `locateMarker` throws if projection isn't ready (e.g. `#/c/` on first paint). */
    const syncExistingMarker = (marker: TmapMarker, pos: TmapLatLng) => {
      const apply = () => {
        marker.setPosition(pos);
        marker.setMap(map);
      };
      try {
        apply();
      } catch {
        requestAnimationFrame(() => {
          try {
            apply();
          } catch {
            /* next effect run or user interaction will retry */
          }
        });
      }
    };

    for (const poi of pois) {
      seen.add(poi.id);
      let m = live.get(poi.id);
      const isSelected = poi.id === selectedId;
      const iconUrl = isSelected
        ? "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_b_m_p.png"
        : "https://tmapapi.tmapmobility.com/upload/tmap/marker/pin_r_m_p.png";

      const pos = new Tmapv2.LatLng(poi.lat, poi.lng);
      if (!m) {
        m = new Tmapv2.Marker({
          position: pos,
          icon: iconUrl,
          map,
          title: poi.name,
        });
        Tmapv2.event.addListener(m, "click", () => {
          selectPoi(poi.id);
        });
        live.set(poi.id, m);
      } else {
        const marker = m;
        let needMove = true;
        try {
          const cur = marker.getPosition();
          needMove =
            Math.abs(cur.lat() - poi.lat) > 1e-7 ||
            Math.abs(cur.lng() - poi.lng) > 1e-7;
        } catch {
          needMove = true;
        }
        if (needMove) syncExistingMarker(marker, pos);
        else {
          try {
            marker.setMap(map);
          } catch {
            requestAnimationFrame(() => {
              try {
                marker.setMap(map);
              } catch {
                /* noop */
              }
            });
          }
        }
        marker.setIcon?.(iconUrl);
      }
    }

    /* Drop markers for POIs that have been removed from the cluster. */
    for (const [id, marker] of live.entries()) {
      if (!seen.has(id)) {
        marker.setMap(null);
        live.delete(id);
      }
    }
  }, [map, Tmapv2, pois, selectedId, selectPoi]);

  useEffect(() => {
    return () => {
      for (const m of markersRef.current.values()) m.setMap(null);
      markersRef.current.clear();
    };
  }, []);

  return null;
}
