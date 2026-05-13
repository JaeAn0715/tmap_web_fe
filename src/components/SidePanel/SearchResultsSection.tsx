import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { recordSelectedCategory } from "@/lib/recentSearches";
import { recordRecentDestination } from "@/lib/recentDestinations";
import {
  getPersonalPoiComments,
  loadPersonalPoiCommentsFromApi,
  subscribePersonalPoiComments,
} from "@/lib/poiPersonalComments";
import { PoiPhoto, PoiEmojiAvatar } from "@/components/UI/PoiPhoto";
import { AddToClusterButton } from "./AddToClusterButton";
import type { POI } from "@/types";

interface Props {
  /**
   * What the right-side `+` button does:
   *   - **`"picker"`** (default, used in the main side-panel) → opens the
   *     cluster picker modal so the user can choose which existing cluster
   *     to add to (or create a new one).
   *   - **`"current-cluster"`** (used inside `ClusterDetailView`) → adds
   *     directly to the cluster currently being viewed; no modal.
   *
   * Per spec: "추천목적지 뷰나 즐겨찾기 내의 검색결과 뷰가 아니라면 …
   * 팝업이 뜬다." — the cluster-detail's inline search and recommendations
   * are the only contexts that bypass the picker.
   */
  mode?: "picker" | "current-cluster";
}

/**
 * Renders the list of POIs that match the current keyword.
 *
 * UX:
 *   - **Row body** (photo + text): click opens the POI detail view inside
 *     the side panel (pushed onto `panelStack`) — `PoiDetailView` then
 *     handles the smooth zoom-in animation on the map. The unified ←
 *     header in `SidePanel` returns the user here.
 *   - **Right-side `+` button**: behaviour depends on `mode` (see Props).
 *     The button never flips to a `✓` — the underlying add operation is
 *     idempotent, and a sticky "added" mark would block the user from
 *     adding the same POI to a second cluster via the picker.
 *
 * Each row also shows a thumbnail resolved via Gemini + Google Search
 * grounding (`lib/poiPhoto`).
 */
export function SearchResultsSection({ mode = "picker" }: Props) {
  const results = useStore((s) => s.searchResults);
  const selectPoi = useStore((s) => s.selectPoi);
  const openPoiDetailView = useStore((s) => s.openPoiDetailView);
  const addPoiToCurrentCluster = useStore((s) => s.addPoiToCurrentCluster);
  const openClusterPicker = useStore((s) => s.openClusterPicker);
  const viewOnly = useStore((s) => s.viewOnly);
  const user = useStore((s) => s.user);
  const [personalCommentsTick, setPersonalCommentsTick] = useState(0);

  useEffect(() => {
    return subscribePersonalPoiComments(() =>
      setPersonalCommentsTick((t) => t + 1)
    );
  }, []);

  useEffect(() => {
    if (!user || !apiMode() || results.length === 0) return;
    for (const p of results) {
      void loadPersonalPoiCommentsFromApi(user.id, p.id);
    }
  }, [user?.id, results]);

  if (results.length === 0) return null;

  const onRowClick = (p: POI) => {
    selectPoi(p.id);
    /* The map animation lives in `PoiDetailView`'s mount effect, so any
     * path that opens the detail view gets the same animation exactly
     * once. Doing it here too would race two rAF loops on the same map. */
    openPoiDetailView(p);
  };

  const onAdd = (p: POI) => {
    if (mode === "current-cluster") {
      addPoiToCurrentCluster(p);
    } else {
      openClusterPicker(p);
    }
    recordSelectedCategory(p.category);
    recordRecentDestination(p);
  };

  /* In current-cluster mode the parent already gates write access via
   * `viewOnly` (a viewer of a shared cluster shouldn't be able to edit
   * destinations), so hide the button entirely. The picker mode never
   * targets the active cluster directly, so viewOnly doesn't apply. */
  const hideAdd = mode === "current-cluster" && viewOnly;

  void personalCommentsTick;

  return (
    <section
      id="side-panel-search-results"
      className="rounded-2xl bg-white shadow-card border border-gray-100/80 overflow-hidden"
    >
      <h3 className="px-3 py-2 text-[11px] font-semibold text-tmap-muted uppercase tracking-wide bg-gray-50/90 sticky top-0 border-b border-gray-100/90">
        검색 결과 ({results.length}건)
      </h3>
      <ul className="divide-y divide-gray-100/90">
        {results.map((p) => (
          <li
            key={p.id}
            role="button"
            aria-label={`${p.name} 보기`}
            className="p-2.5 flex gap-2 hover:bg-brand-light/50 cursor-pointer transition-colors"
            onClick={() => onRowClick(p)}
          >
            <PoiPhoto
              poi={p}
              className="w-12 h-12 rounded shrink-0"
              fallback={<PoiEmojiAvatar poi={p} className="w-12 h-12 text-xl" />}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-gray-500 truncate">
                {p.roadAddress || p.address}
              </div>
              {p.category && (
                <div className="text-[10px] text-gray-400 truncate">
                  {p.category}
                </div>
              )}
            </div>
            {user ? (
              <span
                className="self-center shrink-0 inline-flex items-center gap-1 text-gray-600 text-[11px] tabular-nums"
                title={`내 코멘트 ${getPersonalPoiComments(user.id, p.id).length}개`}
              >
                <span aria-hidden>📝</span>
                <span>{getPersonalPoiComments(user.id, p.id).length}</span>
              </span>
            ) : null}
            <AddToClusterButton poi={p} onAdd={onAdd} hidden={hideAdd} />
          </li>
        ))}
      </ul>
    </section>
  );
}
