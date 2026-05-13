/**
 * Tracks the user's recent search intent so the side panel can recommend
 * nearby POIs that match.
 *
 * **추천 목적지 검색**은 마지막으로 성공한 TMAP 검색 결과 중 첫 POI의
 * `lowerBizName`(소분류)을 키워드로 쓴다 (`tmap_last_search_lower_biz_v1`).
 * 값이 없으면 `"맛집"`으로 폴백한다.
 *
 * 별도로 유지되는 신호:
 *
 *  - **검색어 (`tmap_recent_keywords_v1`)** — 검색창에 입력한 문구. 리뷰 요약
 *    `interestHints` 등에 사용한다.
 *  - **POI category (`tmap_recent_categories_v1`)** — 클러스터에 추가한 POI의
 *    `bizCatName` 기록. `recordSelectedCategory` 경로.
 */

const KEY = "tmap_recent_categories_v1";
const KW_KEY = "tmap_recent_keywords_v1";
const LAST_LOWER_BIZ_KEY = "tmap_last_search_lower_biz_v1";
const MAX = 20;
const KW_MAX = 5;
const DEFAULT_CATEGORY = "맛집";

interface Entry {
  category: string;
  ts: number;
}

function read(): Entry[] {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Entry[]) : [];
  } catch {
    return [];
  }
}

function write(arr: Entry[]) {
  localStorage.setItem(KEY, JSON.stringify(arr));
}

export function recordSelectedCategory(category: string | undefined): void {
  if (!category || !category.trim()) return;
  const arr = read();
  arr.unshift({ category: category.trim(), ts: Date.now() });
  write(arr.slice(0, MAX));
}

function rankedCategories(): Array<{ cat: string; count: number; latestTs: number }> {
  const arr = read();
  const counts = new Map<string, { count: number; latestTs: number }>();
  for (const e of arr) {
    const cur = counts.get(e.category) ?? { count: 0, latestTs: 0 };
    counts.set(e.category, {
      count: cur.count + 1,
      latestTs: Math.max(cur.latestTs, e.ts),
    });
  }
  return Array.from(counts.entries())
    .map(([cat, v]) => ({ cat, count: v.count, latestTs: v.latestTs }))
    .sort((a, b) => b.count - a.count || b.latestTs - a.latestTs);
}

export function getDominantCategory(): string {
  const biz = getLastSearchLowerBizName();
  if (biz) return biz;
  const kw = readKeywords()[0];
  if (kw) return kw;
  const ranked = rankedCategories();
  return ranked[0]?.cat ?? DEFAULT_CATEGORY;
}

/** Most recent successful search: first result's `lowerBizName`, or `null`. */
export function getLastSearchLowerBizName(): string | null {
  try {
    const v = localStorage.getItem(LAST_LOWER_BIZ_KEY);
    const t = v?.trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * After a successful POI search, persist the first hit's `lowerBizName`
 * so recommendations can query by the same business sub-category.
 */
export function recordLastSearchLowerBizFromResults(
  pois: ReadonlyArray<{ lowerBizName?: string }>
): void {
  for (const p of pois) {
    const v = p.lowerBizName?.trim();
    if (v) {
      try {
        localStorage.setItem(LAST_LOWER_BIZ_KEY, v);
      } catch {
        /* ignore quota / private mode */
      }
      return;
    }
  }
}

/**
 * Keywords for the recommendations `searchPois` loop: last search POI's
 * `lowerBizName` first, then the default fallback.
 */
export function getRecommendationSearchTerms(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | undefined | null) => {
    if (!s) return;
    const trimmed = s.trim();
    if (!trimmed) return;
    const k = trimmed.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(trimmed);
  };
  push(getLastSearchLowerBizName());
  push(DEFAULT_CATEGORY);
  return out;
}

/* --------------------------- search keywords --------------------------- */

function readKeywords(): string[] {
  try {
    const v = localStorage.getItem(KW_KEY);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Records what the user just typed into the search box. Called by
 * `SearchSection` after a successful search (≥1 result) so junk queries
 * don't poison review `interestHints` / recent-keyword lists.
 *
 * Stored as a small de-duped ring buffer (most-recent first). When the
 * same keyword is re-searched it's promoted to the front rather than
 * piling up duplicates.
 */
export function recordSearchKeyword(keyword: string | undefined): void {
  if (!keyword) return;
  const kw = keyword.trim();
  if (!kw) return;
  const arr = readKeywords();
  const next = [kw, ...arr.filter((k) => k.toLowerCase() !== kw.toLowerCase())];
  localStorage.setItem(KW_KEY, JSON.stringify(next.slice(0, KW_MAX)));
}

/** Most-recent search keyword, or `null` if the user has never searched. */
export function getLastSearchKeyword(): string | null {
  return readKeywords()[0] ?? null;
}

/**
 * Legacy blend of typed keywords + cluster `bizCatName` history + default.
 * Recommendations use `getRecommendationSearchTerms()` instead.
 */
export function getRecentCategories(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | undefined) => {
    if (!s) return;
    const trimmed = s.trim();
    if (!trimmed) return;
    const k = trimmed.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(trimmed);
  };
  /* 1) Search keywords win — that's "what I'm looking for *right now*". */
  for (const kw of readKeywords()) push(kw);
  /* 2) Then click history. */
  for (const r of rankedCategories()) push(r.cat);
  /* 3) Always-on fallback so the panel is never empty. */
  push(DEFAULT_CATEGORY);
  return out;
}

export function clearRecentCategories(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(KW_KEY);
  localStorage.removeItem(LAST_LOWER_BIZ_KEY);
}

/**
 * Builds `interestHints` for POI review summary: current search box text first,
 * then recent successful search keywords (most recent first), deduped.
 */
export function buildInterestHints(
  currentSearchKeyword?: string | null,
  max = 8
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (!t || t.length > 48) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  push(currentSearchKeyword);
  for (const kw of readKeywords()) push(kw);
  return out.slice(0, max);
}
