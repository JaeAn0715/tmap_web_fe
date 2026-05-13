/**
 * POI photo URL — resolved via **tmap_web_be** (`POST /ai/poi-photo`) using
 * Gemini + Google Search grounding on the server. Requires `VITE_API_BASE_URL`
 * and a logged-in session (Bearer token).
 *
 * Client-side cache (TTL) matches the old behaviour so repeat navigations stay fast.
 */

import type { POI } from "@/types";
import { apiMode } from "./apiConfig";
import { apiFetch } from "./http";
import { getAuthToken } from "./http";

const CACHE_KEY = "tmap_poi_photo_cache_v5_gemini";
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedEntry {
  url: string | null;
  ts: number;
}

function readCache(): Record<string, CachedEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(c: Record<string, CachedEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota */
  }
}

const inFlight = new Map<string, Promise<string | null>>();

export async function fetchPoiPhoto(poi: POI): Promise<string | null> {
  const cache = readCache();
  const cached = cache[poi.id];
  if (cached) {
    const age = Date.now() - cached.ts;
    const ttl = cached.url !== null ? HIT_TTL_MS : MISS_TTL_MS;
    if (age < ttl) return cached.url;
  }

  if (!apiMode() || !getAuthToken()) {
    return null;
  }

  const existing = inFlight.get(poi.id);
  if (existing) return existing;

  const job = (async () => {
    let url: string | null = null;
    try {
      const res = await apiFetch<{ url: string | null }>("/ai/poi-photo", {
        method: "POST",
        json: { poi },
      });
      url = res.url ?? null;
    } catch {
      url = null;
    }
    const c = readCache();
    c[poi.id] = { url, ts: Date.now() };
    writeCache(c);
    return url;
  })().finally(() => {
    inFlight.delete(poi.id);
  });

  inFlight.set(poi.id, job);
  return job;
}
