import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/UI/Button";
import { searchPois } from "@/lib/search";
import { frameMapToPois } from "@/lib/mapFrame";
import { useMapCenter } from "@/hooks/useMapCenter";
import { useStore } from "@/store/useStore";
import {
  recordLastSearchLowerBizFromResults,
  recordSearchKeyword,
} from "@/lib/recentSearches";
import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  /** Needed for `LatLng` / `LatLngBounds` constructors so we can frame the
   *  search results on success. May be `null` before the SDK is ready. */
  Tmapv2: Tmapv2Namespace | null;
  /** Map div — same as recommendations; improves pan detection for refresh FAB. */
  mapContainerRef?: RefObject<HTMLDivElement | null>;
}

function frameSearchResults(
  map: TmapMap,
  Tmapv2: Tmapv2Namespace,
  pois: POI[]
): void {
  frameMapToPois(map, Tmapv2, pois);
}

/**
 * Side panel header: keyword input only. Search is biased by the current map
 * view center (per spec: "사용자의 지도뷰를 중심으로 검색").
 *
 * The previous "전체/이름/주소" type select was removed per spec — `searchPois`
 * defaults to `searchType: "all"` which is sensible for almost every keyword.
 *
 * On a successful search the camera is reframed with `frameSearchResults`
 * so every match is visible inside the map area (per spec: "검색결과가
 * 나오면 맵은 검색결과 전체를 보여줄 수 있도록 줌아웃 혹은 줌인한다.").
 */
export function SearchSection({ map, Tmapv2, mapContainerRef }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { userMoves } = useMapCenter(map, Tmapv2, mapContainerRef);
  const userMovesRef = useRef(userMoves);
  userMovesRef.current = userMoves;
  const lastSearchResolvedMovesRef = useRef(0);

  const keyword = useStore((s) => s.mainSearchKeyword);
  const setMainSearchKeyword = useStore((s) => s.setMainSearchKeyword);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchRefreshHintVisible = useStore(
    (s) => s.setSearchRefreshHintVisible
  );
  const viewOnly = useStore((s) => s.viewOnly);
  const searchActive = useStore((s) => s.searchActive);
  const refreshTick = useStore((s) => s.recommendationsRefreshTick);
  const prevRefreshTickRef = useRef(refreshTick);

  useLayoutEffect(() => {
    const st = useStore.getState();
    if (st.searchActive && st.searchResults.length > 0) {
      lastSearchResolvedMovesRef.current = userMovesRef.current;
      st.setSearchRefreshHintVisible(false);
    }
  }, []);

  useEffect(() => {
    if (!searchActive || searchResults.length === 0) {
      setSearchRefreshHintVisible(false);
      return;
    }
    setSearchRefreshHintVisible(
      userMoves > lastSearchResolvedMovesRef.current
    );
  }, [
    userMoves,
    searchActive,
    searchResults.length,
    setSearchRefreshHintVisible,
  ]);

  const onSearch = async () => {
    if (!keyword.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const center = map?.getCenter();
      const data = await searchPois({
        keyword,
        centerLat: center?.lat?.(),
        centerLng: center?.lng?.(),
      });
      setSearchResults(data);
      if (data.length > 0) {
        lastSearchResolvedMovesRef.current = userMovesRef.current;
        setSearchRefreshHintVisible(false);
      }
      /* Camera reframe right after the store update — done outside the
       * `searchPois` call so a slow Gemini photo fetch can't delay it.
       * Only reframe on a non-empty result; on zero hits we keep the
       * current view so the user can adjust their query without losing
       * spatial context. */
      if (data.length > 0 && map && Tmapv2) {
        frameSearchResults(map, Tmapv2, data);
      }
      /* Record the keyword so the recommendations panel (when re-shown
       * after the user closes the search) biases toward what they were
       * actually looking for — "추천 목적지 · 카페" instead of always
       * "맛집". Gated on a non-empty result so junk queries
       * ("asdfasdf") don't poison the bias. */
      if (data.length > 0) {
        recordSearchKeyword(keyword);
        recordLastSearchLowerBizFromResults(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 추천 새로고침과 동일한 tick으로, 검색 결과가 열린 상태에서 지도 중심만 바뀐 뒤 다시 검색. */
  useEffect(() => {
    if (!searchActive || refreshTick === 0) {
      prevRefreshTickRef.current = refreshTick;
      return;
    }
    if (refreshTick === prevRefreshTickRef.current) return;
    prevRefreshTickRef.current = refreshTick;
    const kw = useStore.getState().mainSearchKeyword.trim();
    if (!kw || !map || !Tmapv2) return;
    let cancelled = false;
    (async () => {
      try {
        const center = map.getCenter();
        const data = await searchPois({
          keyword: kw,
          centerLat: center.lat(),
          centerLng: center.lng(),
        });
        if (cancelled) return;
        setSearchResults(data);
        if (data.length > 0) {
          lastSearchResolvedMovesRef.current = userMovesRef.current;
          setSearchRefreshHintVisible(false);
          recordSearchKeyword(kw);
          recordLastSearchLowerBizFromResults(data);
        }
        if (data.length > 0 && map && Tmapv2) {
          frameSearchResults(map, Tmapv2, data);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick, searchActive, map, Tmapv2, setSearchResults, setSearchRefreshHintVisible]);

  const onClear = () => {
    setMainSearchKeyword("");
    setSearchResults([]);
    setError(null);
  };

  return (
    <div className="shrink-0 bg-tmap-surface px-2 pt-2 pb-1">
      <div className="flex gap-2 items-center">
        <div
          className={
            "flex-1 min-w-0 h-10 rounded-full p-px bg-gradient-to-r from-[#F547BB] to-[#33E6B0] flex items-stretch" +
            (viewOnly ? " opacity-60" : "")
          }
        >
          <input
            value={keyword}
            onChange={(e) => setMainSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="장소·메뉴 검색"
            className="w-full min-w-0 min-h-0 h-full px-3.5 py-0 text-sm leading-normal text-tmap-ink placeholder:text-tmap-muted/80 bg-gray-50/90 border-0 rounded-full focus:outline-none focus:ring-0 box-border"
            disabled={viewOnly}
            aria-label="POI 검색어"
          />
        </div>
        <Button
          size="sm"
          onClick={onSearch}
          disabled={busy || !keyword.trim() || viewOnly}
          className="h-10 shrink-0 px-3 py-0 text-xs inline-flex items-center justify-center"
        >
          {busy ? "…" : "검색"}
        </Button>
        {(searchResults.length > 0 || error) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="!shadow-none h-10 w-10 shrink-0 p-0 text-base leading-none inline-flex items-center justify-center"
            aria-label="검색 결과 지우기"
          >
            ×
          </Button>
        )}
      </div>
      {error && (
        <div className="px-3 pb-2 text-[11px] text-red-600">{error}</div>
      )}
    </div>
  );
}
