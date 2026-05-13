import type { ClusterPayload, POI } from "@/types";
import { apiFetch } from "./http";

/** Map API user to optional FE `picture` from `pictureUrl`. */
export function normalizeClusterPayload(c: ClusterPayload): ClusterPayload {
  return {
    ...c,
    feedback: c.feedback ?? {},
    ownerId: c.ownerId,
    ownerName: c.ownerName ?? "",
  };
}

export async function apiGetCluster(id: string): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(`/clusters/${encodeURIComponent(id)}`);
  return normalizeClusterPayload(raw);
}

export async function apiListMyClusters(): Promise<ClusterPayload[]> {
  const res = await apiFetch<{ clusters: ClusterPayload[] }>("/me/clusters");
  return (res.clusters ?? []).map(normalizeClusterPayload);
}

export async function apiCreateCluster(body: {
  name: string;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  pois: POI[];
  id?: string;
}): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>("/clusters", {
    method: "POST",
    json: body,
  });
  return normalizeClusterPayload(raw);
}

export async function apiPatchCluster(
  id: string,
  body: Partial<{
    name: string;
    mapCenter: { lat: number; lng: number };
    mapZoom: number;
    pois: POI[];
  }>
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(`/clusters/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: body,
  });
  return normalizeClusterPayload(raw);
}

export async function apiDeleteCluster(id: string): Promise<void> {
  await apiFetch<void>(`/clusters/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function apiForkCluster(
  id: string,
  body?: { name?: string }
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(
    `/clusters/${encodeURIComponent(id)}/fork`,
    { method: "POST", json: body ?? {} }
  );
  return normalizeClusterPayload(raw);
}

export async function apiSubscribeCluster(clusterId: string): Promise<void> {
  await apiFetch(`/me/clusters/${encodeURIComponent(clusterId)}/subscribe`, {
    method: "POST",
  });
}

export async function apiUnfollowCluster(clusterId: string): Promise<void> {
  await apiFetch(`/me/clusters/${encodeURIComponent(clusterId)}`, {
    method: "DELETE",
  });
}

export async function apiPostClusterLike(
  clusterId: string,
  poiId: string
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(
    `/clusters/${encodeURIComponent(clusterId)}/pois/${encodeURIComponent(poiId)}/likes`,
    { method: "POST" }
  );
  return normalizeClusterPayload(raw);
}

export async function apiPostClusterNote(
  clusterId: string,
  poiId: string,
  body: { text: string; imageUrls?: string[] }
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(
    `/clusters/${encodeURIComponent(clusterId)}/pois/${encodeURIComponent(poiId)}/notes`,
    { method: "POST", json: body }
  );
  return normalizeClusterPayload(raw);
}

export async function apiPatchClusterNote(
  clusterId: string,
  poiId: string,
  noteId: string,
  body: { text: string; imageUrls?: string[] }
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(
    `/clusters/${encodeURIComponent(clusterId)}/pois/${encodeURIComponent(poiId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "PATCH", json: body }
  );
  return normalizeClusterPayload(raw);
}

export async function apiDeleteClusterNote(
  clusterId: string,
  poiId: string,
  noteId: string
): Promise<ClusterPayload> {
  const raw = await apiFetch<ClusterPayload>(
    `/clusters/${encodeURIComponent(clusterId)}/pois/${encodeURIComponent(poiId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" }
  );
  return normalizeClusterPayload(raw);
}
