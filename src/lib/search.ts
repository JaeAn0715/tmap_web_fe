import type { POI } from "@/types";

/**
 * Calls TMAP POI free-text search REST API.
 * Endpoint: https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=...
 *
 * Notes:
 * - Requires TMAP appKey via `appKey` header.
 * - This module intentionally lives outside React; UI hooks in `useSearch`
 *   adapt the result.
 */

const ENDPOINT = "https://apis.openapi.sk.com/tmap/pois";

export interface SearchOptions {
  keyword: string;
  count?: number;
  /** Optional center bias: lat/lng to bias relevance toward. */
  centerLat?: number;
  centerLng?: number;
  /** Search type: 'all' | 'name' | 'address' (TMAP supports `searchType`). */
  searchType?: "all" | "name" | "address";
}

interface TmapPoiRaw {
  id: string;
  /** POI surrogate key used by Detail lookup (`findOption=key`). See SK OpenAPI. */
  pkey?: string;
  /** 입구점 일련번호 — optional on Detail 요청 (`findOption=id`) */
  navSeq?: string;
  name: string;
  upperAddrName?: string;
  middleAddrName?: string;
  lowerAddrName?: string;
  detailAddrName?: string;
  roadName?: string;
  buildingNo1?: string;
  buildingNo2?: string;
  newAddressList?: { newAddress: Array<{ fullAddressRoad?: string }> };
  telNo?: string;
  bizCatName?: string;
  upperBizName?: string;
  middleBizName?: string;
  lowerBizName?: string;
  noorLat: string;
  noorLon: string;
  frontLat: string;
  frontLon: string;
}

function fullAddress(p: TmapPoiRaw): string {
  return [p.upperAddrName, p.middleAddrName, p.lowerAddrName, p.detailAddrName]
    .filter(Boolean)
    .join(" ");
}

function roadAddress(p: TmapPoiRaw): string | undefined {
  const newRoad = p.newAddressList?.newAddress?.[0]?.fullAddressRoad;
  if (newRoad) return newRoad;
  if (p.roadName) {
    return [p.upperAddrName, p.middleAddrName, p.roadName, p.buildingNo1]
      .filter(Boolean)
      .join(" ");
  }
  return undefined;
}

export async function searchPois(opts: SearchOptions): Promise<POI[]> {
  const appKey = import.meta.env.VITE_TMAP_APP_KEY as string | undefined;
  if (!appKey) throw new Error("VITE_TMAP_APP_KEY is missing");
  if (!opts.keyword.trim()) return [];

  const params = new URLSearchParams({
    version: "1",
    searchKeyword: opts.keyword,
    resCoordType: "WGS84GEO",
    reqCoordType: "WGS84GEO",
    count: String(opts.count ?? 15),
    searchType: opts.searchType ?? "all",
  });
  if (opts.centerLat && opts.centerLng) {
    params.set("centerLat", String(opts.centerLat));
    params.set("centerLon", String(opts.centerLng));
  }

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { appKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TMAP search failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    searchPoiInfo?: { pois?: { poi?: TmapPoiRaw[] } };
  };
  const list = json.searchPoiInfo?.pois?.poi ?? [];
  return list.map<POI>((p) => ({
    id: p.id,
    name: p.name,
    address: fullAddress(p),
    roadAddress: roadAddress(p),
    tel: p.telNo,
    category: p.bizCatName,
    bizCategory: [p.upperBizName, p.middleBizName, p.lowerBizName]
      .filter(Boolean)
      .join(" > "),
    lowerBizName: p.lowerBizName?.trim() || undefined,
    lat: parseFloat(p.frontLat || p.noorLat),
    lng: parseFloat(p.frontLon || p.noorLon),
    raw: p as unknown as Record<string, unknown>,
  }));
}
