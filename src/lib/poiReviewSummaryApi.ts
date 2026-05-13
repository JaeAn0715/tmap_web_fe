import type { POI } from "@/types";
import { apiMode } from "@/lib/apiConfig";
import { apiFetch } from "@/lib/http";

export interface PoiReviewSummaryRequestBody {
  poi: POI;
  userComments?: string[];
  interestHints?: string[];
}

export interface PoiReviewSummaryResponseBody {
  pros: string;
  cons: string;
  highlightTerms: string[];
}

const MAX_LEN = 200;
const CACHE_TTL_MS = 3 * 60 * 1000;

/** Strip `raw` so request bodies stay small — huge TMAP `raw` often causes 502 upstream. */
export function poiPayloadForReviewSummary(poi: POI): POI {
  return {
    id: poi.id,
    name: poi.name,
    address: poi.address ?? "",
    lat: poi.lat,
    lng: poi.lng,
    ...(poi.roadAddress ? { roadAddress: poi.roadAddress } : {}),
    ...(poi.category ? { category: poi.category } : {}),
    ...(poi.bizCategory ? { bizCategory: poi.bizCategory } : {}),
    ...(poi.tel ? { tel: poi.tel } : {}),
    ...(poi.photoUrl ? { photoUrl: poi.photoUrl } : {}),
  };
}

const memoryCache = new Map<
  string,
  { savedAt: number; data: PoiReviewSummaryResponseBody }
>();

function hashComments(comments: readonly string[]): string {
  const s = [...comments].sort().join("\x1e");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function cacheKey(
  poiId: string,
  userComments: readonly string[],
  interestHints: readonly string[]
): string {
  return `${poiId}|${hashComments(userComments)}|${[...interestHints].sort().join("\x1e")}`;
}

function clampReview(r: PoiReviewSummaryResponseBody): PoiReviewSummaryResponseBody {
  return {
    pros: (r.pros ?? "").trim().slice(0, MAX_LEN),
    cons: (r.cons ?? "").trim().slice(0, MAX_LEN),
    highlightTerms: (r.highlightTerms ?? [])
      .map((t) => String(t).trim())
      .filter((t) => t.length >= 2 && t.length <= 16)
      .slice(0, 12),
  };
}

/**
 * `POST /ai/gemini/poi-review-summary` — Bearer JWT is attached by `apiFetch`
 * when a token exists.
 */
export async function fetchPoiReviewSummary(
  body: PoiReviewSummaryRequestBody
): Promise<PoiReviewSummaryResponseBody> {
  const userComments = body.userComments ?? [];
  const interestHints = body.interestHints ?? [];
  const key = cacheKey(body.poi.id, userComments, interestHints);
  const hit = memoryCache.get(key);
  if (hit && Date.now() - hit.savedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  if (!apiMode()) {
    throw new Error("VITE_API_BASE_URL이 설정되어 있지 않습니다.");
  }

  const raw = await apiFetch<PoiReviewSummaryResponseBody>(
    "/ai/gemini/poi-review-summary",
    {
      method: "POST",
      json: {
        poi: poiPayloadForReviewSummary(body.poi),
        userComments,
        interestHints,
      },
    }
  );
  const data = clampReview(raw);
  memoryCache.set(key, { savedAt: Date.now(), data });
  return data;
}

/** Dev/demo: clear in-memory POI review summary cache (e.g. after DB seed). */
export function clearPoiReviewSummaryMemoryCache(): void {
  memoryCache.clear();
}
