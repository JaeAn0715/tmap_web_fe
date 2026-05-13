import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

/** Match POI detail fly-to / search results framing. */
export const MAX_FIT_ZOOM = 17;

const BOUNDS_PAD_RATIO = 0.18;

/**
 * Fit the map camera so all POI pins are visible (padding + max zoom cap).
 * Same behavior as search-result framing — used for cluster list open and
 * cluster detail view.
 */
export function frameMapToPois(
  map: TmapMap,
  Tmapv2: Tmapv2Namespace,
  pois: POI[]
): void {
  if (pois.length === 0) return;

  if (pois.length === 1) {
    const p = pois[0];
    map.setCenter(new Tmapv2.LatLng(p.lat, p.lng));
    map.setZoom(MAX_FIT_ZOOM);
    return;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of pois) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const padLat = Math.max((maxLat - minLat) * BOUNDS_PAD_RATIO, 0.0005);
  const padLng = Math.max((maxLng - minLng) * BOUNDS_PAD_RATIO, 0.0005);
  const sw = new Tmapv2.LatLng(minLat - padLat, minLng - padLng);
  const ne = new Tmapv2.LatLng(maxLat + padLat, maxLng + padLng);

  if (Tmapv2.LatLngBounds && map.fitBounds) {
    try {
      const bounds = new Tmapv2.LatLngBounds();
      bounds.extend(sw);
      bounds.extend(ne);
      map.fitBounds(bounds);
      const z = map.getZoom?.();
      if (typeof z === "number" && z > MAX_FIT_ZOOM) {
        map.setZoom(MAX_FIT_ZOOM);
      }
      return;
    } catch {
      /* fall through */
    }
  }

  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  map.setCenter(new Tmapv2.LatLng(cLat, cLng));
  map.setZoom(14);
}
