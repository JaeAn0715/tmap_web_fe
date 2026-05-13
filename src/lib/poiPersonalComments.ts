import { apiMode } from "@/lib/apiConfig";
import {
  apiDeleteMePoiNote,
  apiListMePoiNotes,
  apiPatchMePoiNote,
  apiPostMePoiNote,
} from "@/lib/mePoiNotesApi";
import type { ClusterNote } from "@/types";

const STORAGE_KEY = "tmap_poi_personal_comments_v1";
export const PERSONAL_POI_COMMENTS_CHANGED = "tmap-personal-poi-comments-changed";

function bucketKey(userId: string, poiId: string): string {
  return `${userId}::${poiId}`;
}

function dispatchChanged() {
  window.dispatchEvent(new Event(PERSONAL_POI_COMMENTS_CHANGED));
}

/* ------------------------------ localStorage (비 API 모드) ---------- */

function loadAll(): Record<string, ClusterNote[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ClusterNote[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, ClusterNote[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  dispatchChanged();
}

function newNoteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------ API 모드 인메모리 캐시 -------------- */

const apiNotesByBucket = new Map<string, ClusterNote[]>();
const pendingLoads = new Map<string, Promise<void>>();

/** 로그아웃 등에서 API 캐시 비우기 */
export function clearPersonalPoiCommentsApiCache(): void {
  apiNotesByBucket.clear();
  pendingLoads.clear();
}

export function subscribePersonalPoiComments(cb: () => void) {
  window.addEventListener(PERSONAL_POI_COMMENTS_CHANGED, cb);
  return () => window.removeEventListener(PERSONAL_POI_COMMENTS_CHANGED, cb);
}

/**
 * API 모드: 서버에서 해당 POI 코멘트를 불러와 캐시에 넣고 이벤트를 쏜다.
 * 비 API 모드에서는 no-op.
 */
export async function loadPersonalPoiCommentsFromApi(
  userId: string,
  poiId: string
): Promise<void> {
  if (!apiMode()) return;
  const k = bucketKey(userId, poiId);
  const existing = pendingLoads.get(k);
  if (existing) return existing;

  const p = (async () => {
    try {
      const notes = await apiListMePoiNotes(poiId);
      apiNotesByBucket.set(k, notes);
      dispatchChanged();
    } catch (e) {
      console.error("loadPersonalPoiCommentsFromApi", e);
    } finally {
      pendingLoads.delete(k);
    }
  })();
  pendingLoads.set(k, p);
  return p;
}

export function getPersonalPoiComments(
  userId: string,
  poiId: string
): ClusterNote[] {
  if (apiMode()) {
    return apiNotesByBucket.get(bucketKey(userId, poiId)) ?? [];
  }
  const all = loadAll();
  return all[bucketKey(userId, poiId)] ?? [];
}

export async function addPersonalPoiComment(
  userId: string,
  userName: string,
  poiId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (apiMode()) {
    void userName;
    const note = await apiPostMePoiNote({ poiId, text: trimmed });
    const k = bucketKey(userId, poiId);
    const cur = apiNotesByBucket.get(k) ?? [];
    apiNotesByBucket.set(k, [...cur, note]);
    dispatchChanged();
    return;
  }

  const all = loadAll();
  const k = bucketKey(userId, poiId);
  const cur = all[k] ?? [];
  const note: ClusterNote = {
    id: newNoteId(),
    userId,
    userName,
    text: trimmed,
    ts: Date.now(),
  };
  all[k] = [...cur, note];
  saveAll(all);
}

export async function editPersonalPoiComment(
  userId: string,
  poiId: string,
  noteId: string,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (apiMode()) {
    const k = bucketKey(userId, poiId);
    const cur = apiNotesByBucket.get(k) ?? [];
    const idx = cur.findIndex((n) => n.id === noteId);
    if (idx === -1 || cur[idx].userId !== userId) return;
    const updated = await apiPatchMePoiNote(noteId, { text: trimmed });
    const next = [...cur];
    next[idx] = updated;
    apiNotesByBucket.set(k, next);
    dispatchChanged();
    return;
  }

  const all = loadAll();
  const k = bucketKey(userId, poiId);
  const cur = all[k];
  if (!cur?.length) return;
  const idx = cur.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  if (cur[idx].userId !== userId) return;
  const next = [...cur];
  next[idx] = {
    ...next[idx],
    text: trimmed,
    editedAt: Date.now(),
  };
  all[k] = next;
  saveAll(all);
}

export async function deletePersonalPoiComment(
  userId: string,
  poiId: string,
  noteId: string
): Promise<void> {
  if (apiMode()) {
    const k = bucketKey(userId, poiId);
    const cur = apiNotesByBucket.get(k) ?? [];
    const target = cur.find((n) => n.id === noteId);
    if (!target || target.userId !== userId) return;
    await apiDeleteMePoiNote(noteId);
    apiNotesByBucket.set(
      k,
      cur.filter((n) => n.id !== noteId)
    );
    dispatchChanged();
    return;
  }

  const all = loadAll();
  const k = bucketKey(userId, poiId);
  const cur = all[k];
  if (!cur?.length) return;
  const target = cur.find((n) => n.id === noteId);
  if (!target || target.userId !== userId) return;
  all[k] = cur.filter((n) => n.id !== noteId);
  if (all[k].length === 0) delete all[k];
  saveAll(all);
}
