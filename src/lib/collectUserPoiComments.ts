import { apiMode } from "@/lib/apiConfig";
import { apiListMyClusters } from "@/lib/clusterApi";
import { getPersonalPoiComments, loadPersonalPoiCommentsFromApi } from "@/lib/poiPersonalComments";
import { listClusters } from "@/lib/storage";
import type { ClusterPayload } from "@/types";

function normalizeNoteText(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t === "(이미지)") return "";
  return t;
}

/**
 * Collects **only the signed-in user's** note bodies for `poiId` across all
 * clusters (local mock or `GET /me/clusters` payload), plus **personal POI
 * comments** saved from 검색·추천 상세 (`lib/poiPersonalComments`).
 * Optionally merges extra lines from the current UI before deduping.
 */
export async function collectUserCommentsForPoi(
  userId: string | undefined,
  poiId: string,
  mergeTexts?: readonly string[]
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = normalizeNoteText(raw);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const t of mergeTexts ?? []) add(t);
  if (!userId) return out;

  if (apiMode()) {
    await loadPersonalPoiCommentsFromApi(userId, poiId);
  }

  let clusters: ClusterPayload[] = [];
  try {
    clusters = apiMode() ? await apiListMyClusters() : listClusters();
  } catch {
    clusters = apiMode() ? [] : listClusters();
  }

  for (const c of clusters) {
    const bucket = c.feedback?.[poiId];
    if (!bucket?.notes?.length) continue;
    for (const n of bucket.notes) {
      if (n.userId !== userId) continue;
      add(n.text ?? "");
    }
  }

  for (const n of getPersonalPoiComments(userId, poiId)) {
    if (n.userId !== userId) continue;
    add(n.text ?? "");
  }

  return out;
}
