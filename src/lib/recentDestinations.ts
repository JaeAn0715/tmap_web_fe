import type { POI } from "@/types";
import { apiMode } from "./apiConfig";
import { getAuthToken } from "./http";
import {
  apiDeleteRecentDestination,
  apiGetRecentDestinations,
  apiPostRecentDestination,
} from "./meApi";

/**
 * Ring buffer of POIs — localStorage cache; with API + token, syncs to server.
 */

const KEY = "tmap_recent_destinations_v1";
const MAX = 20;

interface Entry {
  poi: POI;
  ts: number;
}

function read(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Entry[]) : [];
  } catch {
    return [];
  }
}

function write(arr: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* quota exceeded — non-fatal */
  }
}

export function recordRecentDestination(poi: POI): void {
  if (!poi || !poi.id) return;
  const cur = read().filter((e) => e.poi.id !== poi.id);
  cur.unshift({ poi, ts: Date.now() });
  write(cur.slice(0, MAX));
  if (apiMode() && getAuthToken()) {
    void apiPostRecentDestination(poi).catch((e) =>
      console.error("recent-destination POST failed", e)
    );
  }
}

export function getRecentDestinations(limit?: number): POI[] {
  const arr = read();
  const sliced = typeof limit === "number" ? arr.slice(0, limit) : arr;
  return sliced.map((e) => e.poi);
}

export function clearRecentDestinations(): void {
  write([]);
}

export function removeRecentDestination(id: string): void {
  write(read().filter((e) => e.poi.id !== id));
  if (apiMode() && getAuthToken()) {
    void apiDeleteRecentDestination(id).catch((e) =>
      console.error("recent-destination DELETE failed", e)
    );
  }
}

export async function syncRecentDestinationsFromBackend(): Promise<void> {
  if (!apiMode() || !getAuthToken()) return;
  const pois = await apiGetRecentDestinations(MAX);
  const entries: Entry[] = pois.map((poi, i) => ({
    poi,
    ts: Date.now() - i * 1000,
  }));
  write(entries);
}
