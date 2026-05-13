import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStore } from "@/store/useStore";
import { searchPois } from "@/lib/search";
import { fetchPoiPhoto } from "@/lib/poiPhoto";
import {
  getRecommendationSearchTerms,
  recordSelectedCategory,
} from "@/lib/recentSearches";
import { recordRecentDestination } from "@/lib/recentDestinations";
import { useMapCenter } from "@/hooks/useMapCenter";
import { snapMapProgrammatically } from "@/lib/mapAnimate";
import { resolveRecommendationSearchCenter } from "@/lib/recommendationCenter";
import { RecommendationItem } from "./RecommendationItem";
import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

const FETCH_COUNT = 20;

/** Strip a trailing "주차장" (with or without leading space) — e.g.
 *  "롯데월드 주차장" → "롯데월드". Also strips a trailing parenthetical
 *  qualifier like "스타벅스 강남점 (주차)". */
function baseName(name: string): string {
  return name
    .replace(/\s*\(주차[^)]*\)\s*$/u, "")
    .replace(/\s*주차장$/u, "")
    .trim();
}

function isParkingSubordinate(name: string): boolean {
  return baseName(name) !== name;
}

/**
 * TMAP often returns a venue **and** its dedicated parking lot as two adjacent
 * results (e.g. "백화점" + "백화점 주차장"). Recommendations should show the
 * destination, not the parking utility, so we collapse each base-name bucket
 * down to one row, preferring the non-parking variant. Standalone parking
 * lots (no main counterpart in the result set) are preserved.
 */
function dedupeParking(pois: POI[]): POI[] {
  const buckets = new Map<string, POI[]>();
  for (const p of pois) {
    const key = baseName(p.name).toLowerCase();
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  const picked: POI[] = [];
  for (const arr of buckets.values()) {
    picked.push(arr.find((p) => !isParkingSubordinate(p.name)) ?? arr[0]);
  }
  // Preserve the original ordering from TMAP (which is roughly
  // distance/relevance ordered).
  const order = new Map(pois.map((p, i) => [p.id, i] as const));
  picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return picked;
}

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
  /** Map div (e.g. `useTmapMap().containerRef`) — enables pan detection when SDK `dragend` is unreliable. */
  mapContainerRef?: RefObject<HTMLDivElement | null>;
}

interface ResolvedItem {
  /** POI object augmented with `photoUrl` (best-effort). */
  poi: POI;
}

interface ResolvedSet {
  category: string;
  items: ResolvedItem[];
  /** Map center used for the search; used for "moved too far" detection. */
  fetchedCenter: { lat: number; lng: number };
}

/**
 * Default content of the side panel: POIs around the user (or the current
 * map center) whose category matches the last successful search's lead POI
 * `lowerBizName`, then `"맛집"` if needed.
 *
 * Logic:
 *  1. Iterate search terms (`lowerBizName` → default).
 *  2. For each term, fetch up to 20 POIs near the chosen center.
 *  3. Deduplicate "본관 + 주차장" pairs.
 *  4. Resolve photos via Gemini + Google Search grounding (`lib/poiPhoto.ts`).
 *     A null photo is fine; the card uses a category emoji instead. POIs
 *     are *not* hidden just because they lack a photo.
 *  5. If the dedup'd list is non-empty, render it. Otherwise try the next term.
 *  6. If all terms exhaust → show empty state.
 *
 * Center selection:
 *  - First fetch: user's geolocation (or default) — driven by `userLocation`.
 *  - Refresh fetch (after the user pans): current map center, triggered via
 *    the store's `recommendationsRefreshTick`.
 *  - If that center lies **outside** South Korea (rough bbox), search uses
 *    **종로구** coordinates instead and the map snaps there programmatically.
 */
export function RecommendationsSection({
  map,
  Tmapv2,
  mapContainerRef,
}: Props) {
  const userLocation = useStore((s) => s.userLocation);
  const searchActive = useStore((s) => s.searchActive);
  const setHintVisible = useStore((s) => s.setRecommendationsHintVisible);
  const refreshTick = useStore((s) => s.recommendationsRefreshTick);
  const selectPoi = useStore((s) => s.selectPoi);
  const openPoiDetailView = useStore((s) => s.openPoiDetailView);
  const openClusterPicker = useStore((s) => s.openClusterPicker);
  const addSpotlightPoi = useStore((s) => s.addSpotlightPoi);

  const [resolved, setResolved] = useState<ResolvedSet | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState<boolean>(false);
  /**
   * Category currently being attempted by the in-flight fetch. Distinct
   * from `resolved.category` so the header can show the *new* category
   * the moment the user triggers a refresh, instead of the stale value
   * left over from the previous resolution. Reset to the first category
   * the loop will try synchronously inside the effect (so the header
   * never blanks out for a render frame) and updated as the loop walks
   * through fallback categories. Cleared when the loop exhausts.
   */
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { center: mapCenter, userMoves } = useMapCenter(
    map,
    Tmapv2,
    mapContainerRef
  );
  /** `userMoves` value at the moment we last successfully resolved a fetch.
   *  Compared against the live `userMoves` to decide whether the user has
   *  actually panned/zoomed since recommendations loaded — initial map renders
   *  and programmatic re-centers do NOT bump this counter, so the floating
   *  refresh button stays hidden until the user genuinely moves the map. */
  const lastResolvedMovesRef = useRef<number>(0);
  const userMovesRef = useRef(userMoves);
  userMovesRef.current = userMoves;

  useLayoutEffect(() => {
    setHintVisible(false);
    lastResolvedMovesRef.current = userMovesRef.current;
  }, [setHintVisible]);

  /* ------------------------------ fetch effect --------------------------- */
  useEffect(() => {
    if (searchActive) return;
    // Decide the search center: refresh-tick uses live map center; otherwise
    // the geolocated origin (one-time on entry).
    const rawCenter =
      refreshTick > 0 && mapCenter ? mapCenter : userLocation;
    if (!rawCenter) return; // wait until geolocation resolves

    const center = resolveRecommendationSearchCenter(
      rawCenter.lat,
      rawCenter.lng
    );
    if (center.usedJongnoFallback && map && Tmapv2) {
      snapMapProgrammatically(map, Tmapv2, center.lat, center.lng, 15);
    }

    let cancelled = false;
    const terms = getRecommendationSearchTerms();
    setLoading(true);
    setError(null);
    setExhausted(false);
    /* Pre-seed the header with the first term we're going to try.
     * Doing this *outside* the async IIFE means the very first render
     * after the user triggers a refresh already shows the new keyword —
     * not the previous resolved one. */
    setActiveCategory(terms[0] ?? null);

    (async () => {
      for (const keyword of terms) {
        if (cancelled) return;
        /* Re-state on every iteration so the header reflects the
         * current fallback attempt as the loop walks through terms. */
        setActiveCategory(keyword);
        try {
          const rawPois = await searchPois({
            keyword,
            centerLat: center.lat,
            centerLng: center.lng,
            count: FETCH_COUNT,
          });
          if (cancelled) return;
          const pois = dedupeParking(rawPois);
          if (pois.length === 0) continue;

          // Photo lookups via Gemini + Google Search grounding. Batched in
          // chunks so we don't fan out 20 model calls at once — keeps load
          // sane on the Gemini quota and gives skeleton rows time to paint.
          const photoResults: Array<string | null> = [];
          const BATCH = 5;
          for (let i = 0; i < pois.length; i += BATCH) {
            const chunk = pois.slice(i, i + BATCH);
            const part = await Promise.all(
              chunk.map((p) => fetchPoiPhoto(p).catch(() => null))
            );
            photoResults.push(...part);
          }
          if (cancelled) return;

          const items: ResolvedItem[] = pois.map((poi, i) => {
            const photoUrl = photoResults[i];
            return {
              poi: {
                ...poi,
                photoUrl: photoUrl ?? undefined,
              },
            };
          });
          setResolved({
            category: keyword,
            items,
            fetchedCenter: { lat: center.lat, lng: center.lng },
          });
          setLoading(false);
          setHintVisible(false);
          // Snapshot the user-move counter so the hint detector below knows
          // any future increment is a *new* drag/zoom by the user.
          lastResolvedMovesRef.current = userMovesRef.current;
          return;
        } catch (e) {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      if (cancelled) return;
      setResolved(null);
      setExhausted(true);
      setLoading(false);
      setHintVisible(false);
      setActiveCategory(null);
    })();

    return () => {
      cancelled = true;
    };
    // mapCenter intentionally NOT in deps: we don't refetch on every pan;
    // only when refresh tick is bumped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, searchActive, refreshTick, setHintVisible, map, Tmapv2]);

  /** 추천 fetch는 `searchActive`일 때 돌지 않지만, 새로고침 클릭 시 tick만 올라가므로
   *  그때 스냅샷을 먼저 맞춰야 힌트가 바로 다시 켜지지 않는다. */
  useEffect(() => {
    if (refreshTick === 0) return;
    if (searchActive && resolved) {
      lastResolvedMovesRef.current = userMovesRef.current;
    }
  }, [refreshTick, searchActive, resolved]);

  /* ------------------------- "user moved" detector ----------------------
   * The button is shown as soon as both are true:
   *   1. recommendations have already resolved (so there's something to
   *      refresh), AND
   *   2. the user has actually dragged or zoomed the map at least once
   *      since that resolution (`userMoves` strictly increased).
   *
   * Per spec ("추천목적지 뷰에서 지도를 움직이거나 줌이 되면 버튼이 생긴다"):
   * **any** user-driven camera change is enough — there's no longer a
   * distance threshold. `useMapCenter` only bumps `userMoves` on `dragend`
   * and `zoom_changed`, NOT on programmatic `setCenter`/`setZoom`, so an
   * initial geolocation recenter or a `flyToPoi` from the detail screen's
   * cleanup won't accidentally pop the button. */
  useEffect(() => {
    if (searchActive) {
      setHintVisible(false);
      return;
    }
    if (!resolved) {
      setHintVisible(false);
      return;
    }
    setHintVisible(userMoves > lastResolvedMovesRef.current);
  }, [userMoves, resolved, searchActive, setHintVisible]);

  /* ------------------------------- rendering ---------------------------- */
  const showSkeleton = loading || (!resolved && !exhausted && !error);

  const skeletonCount = useMemo(() => 5, []);

  if (searchActive) return null;

  /* Header category: while a fetch is in flight, show the category we're
   * currently trying (so the user sees the new keyword *immediately* when
   * they trigger a refresh). When idle, show whatever ended up resolving. */
  const headerCategory = loading
    ? activeCategory
    : resolved?.category ?? null;

  return (
    <section
      id="side-panel-recommendations"
      className="rounded-2xl bg-white shadow-card border border-gray-100/80 overflow-hidden scroll-mt-2"
    >
      <h3 className="px-3 py-2 text-[11px] font-semibold text-tmap-muted uppercase tracking-wide bg-gray-50/90 sticky top-0 flex items-center justify-between border-b border-gray-100/90">
        <span className="text-tmap-ink/80 normal-case tracking-normal">
          추천 목적지
          {headerCategory && (
            <span className="text-tmap-muted font-normal"> · {headerCategory}</span>
          )}
        </span>
        {resolved && (
          <span className="tabular-nums text-gray-400">{resolved.items.length}</span>
        )}
      </h3>

      {!userLocation && (
        <div className="px-3 py-3 text-[11px] text-gray-500">
          위치 정보를 허용하면 주변의 추천 목적지를 보여드립니다.
        </div>
      )}

      {error && !showSkeleton && (
        <div className="px-3 py-2 text-[11px] text-red-600">{error}</div>
      )}

      {userLocation && showSkeleton && (
        <ul className="divide-y divide-gray-100/90">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonItem key={i} />
          ))}
        </ul>
      )}

      {userLocation && !showSkeleton && exhausted && (
        <div className="px-3 py-3 text-[11px] text-gray-500">
          이 주변에서 추천할 만한 장소를 찾지 못했습니다. 검색해서 다른 장소를 찾아보세요.
        </div>
      )}

      {resolved && !loading && (
        <ul className="divide-y divide-gray-100/90">
          {resolved.items.map(({ poi }) => (
            <RecommendationItem
              key={poi.id}
              poi={poi}
              photoUrl={poi.photoUrl ?? null}
              onPickRow={() => {
                /* Row body click → open the POI detail view inside the
                 * side panel + drop a spotlight pin on the map so the
                 * user can see *where* the recommendation actually is.
                 * Spotlight is auto-cleared the moment the user backs
                 * out of the detail view (per spec) so the map returns
                 * to a clean state. `PoiDetailView`'s mount effect
                 * still runs `flyToPoi` for the smooth pan + zoom. */
                selectPoi(poi.id);
                addSpotlightPoi(poi);
                openPoiDetailView(poi);
              }}
              onAdd={() => {
                /* Recommendations no longer have an implicit "active
                 * cluster" target — the picker modal lets the user pick
                 * which cluster (or create a new one), matching the POI
                 * detail screen's behaviour. The button never flips to
                 * a `✓` so the user can add the same POI to multiple
                 * clusters by re-clicking. */
                openClusterPicker(poi);
                recordSelectedCategory(poi.category);
                recordRecentDestination(poi);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SkeletonItem() {
  return (
    <li className="p-2.5 flex gap-2 animate-pulse">
      <div className="w-14 h-14 bg-gray-200 rounded shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="h-2.5 bg-gray-100 rounded w-1/2" />
        <div className="h-2.5 bg-gray-100 rounded w-3/4" />
      </div>
    </li>
  );
}
