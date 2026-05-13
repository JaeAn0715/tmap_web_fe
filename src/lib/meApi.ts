import type { POI } from "@/types";
import { apiFetch } from "./http";

export async function apiGetSavedPlaces(): Promise<{ home: POI | null; work: POI | null }> {
  return apiFetch("/me/saved-places");
}

export async function apiPutSavedPlaces(body: {
  home: POI | null;
  work: POI | null;
}): Promise<void> {
  await apiFetch("/me/saved-places", { method: "PUT", json: body });
}

export async function apiGetRecentDestinations(limit: number): Promise<POI[]> {
  const res = await apiFetch<{ items: { poi: POI }[] }>(
    `/me/recent-destinations?limit=${encodeURIComponent(String(limit))}`
  );
  return (res.items ?? []).map((i) => i.poi);
}

export async function apiPostRecentDestination(poi: POI): Promise<void> {
  await apiFetch("/me/recent-destinations", { method: "POST", json: poi });
}

export async function apiDeleteRecentDestination(poiId: string): Promise<void> {
  await apiFetch(`/me/recent-destinations/${encodeURIComponent(poiId)}`, {
    method: "DELETE",
  });
}
