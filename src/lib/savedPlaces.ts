import type { POI } from "@/types";
import { apiMode } from "./apiConfig";
import { getAuthToken } from "./http";
import { apiGetSavedPlaces, apiPutSavedPlaces } from "./meApi";

/**
 * "집" / "직장" — quick-pick shortcut destinations. With `VITE_API_BASE_URL`,
 * reads/writes mirror the API (localStorage keeps a cache for sync `get`).
 */

const KEY = "tmap_saved_places_v1";

export type SavedSlot = "home" | "work";

interface SavedPlaces {
  home: POI | null;
  work: POI | null;
}

function read(): SavedPlaces {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { home: null, work: null };
    const v = JSON.parse(raw);
    return {
      home: (v && v.home) || null,
      work: (v && v.work) || null,
    };
  } catch {
    return { home: null, work: null };
  }
}

function write(v: SavedPlaces) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* quota exceeded or private mode — non-fatal */
  }
}

export function getSavedPlaces(): SavedPlaces {
  return read();
}

export function setSavedPlace(slot: SavedSlot, poi: POI | null): void {
  const cur = read();
  cur[slot] = poi;
  write(cur);
  if (apiMode() && getAuthToken()) {
    void apiPutSavedPlaces(cur).catch((e) => {
      console.error("saved-places PUT failed", e);
    });
  }
}

/** Pull server state into local cache (call after login). */
export async function syncSavedPlacesFromBackend(): Promise<void> {
  if (!apiMode() || !getAuthToken()) return;
  const data = await apiGetSavedPlaces();
  write({
    home: data.home ?? null,
    work: data.work ?? null,
  });
}

export function clearSavedPlace(slot: SavedSlot): void {
  setSavedPlace(slot, null);
}

export const SAVED_PLACE_LABEL: Record<SavedSlot, string> = {
  home: "집",
  work: "직장",
};

export const SAVED_PLACE_EMOJI: Record<SavedSlot, string> = {
  home: "🏠",
  work: "🏢",
};
