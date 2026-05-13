import type { ClusterNote } from "@/types";
import { apiFetch } from "./http";

function parseListResponse(data: unknown): ClusterNote[] {
  if (Array.isArray(data)) return data as ClusterNote[];
  if (data && typeof data === "object" && "notes" in data) {
    const n = (data as { notes?: unknown }).notes;
    if (Array.isArray(n)) return n as ClusterNote[];
  }
  return [];
}

/** GET `/me/poi-notes?poiId=` — 본인 해당 POI 코멘트 목록 */
export async function apiListMePoiNotes(poiId: string): Promise<ClusterNote[]> {
  const raw = await apiFetch<unknown>(
    `/me/poi-notes?poiId=${encodeURIComponent(poiId)}`
  );
  return parseListResponse(raw);
}

/** POST `/me/poi-notes` — 생성된 단일 `ClusterNote` 반환 */
export async function apiPostMePoiNote(body: {
  poiId: string;
  text: string;
}): Promise<ClusterNote> {
  return apiFetch<ClusterNote>("/me/poi-notes", {
    method: "POST",
    json: body,
  });
}

/** PATCH `/me/poi-notes/:noteId` — 갱신된 `ClusterNote` 반환(백엔드 계약) */
export async function apiPatchMePoiNote(
  noteId: string,
  body: { text: string }
): Promise<ClusterNote> {
  return apiFetch<ClusterNote>(
    `/me/poi-notes/${encodeURIComponent(noteId)}`,
    { method: "PATCH", json: body }
  );
}

/** DELETE `/me/poi-notes/:noteId` */
export async function apiDeleteMePoiNote(noteId: string): Promise<void> {
  await apiFetch<void>(
    `/me/poi-notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" }
  );
}
