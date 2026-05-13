import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import clsx from "clsx";
import { SearchSection } from "./SearchSection";
import { SearchResultsSection } from "./SearchResultsSection";
import { ClustersSection } from "./ClustersSection";
import { ProfileView } from "./ProfileView";
import { RecommendationsSection } from "./RecommendationsSection";
import { ClusterDetailView } from "./ClusterDetailView";
import { PoiDetailView } from "./PoiDetailView";
import { RouteSection } from "@/components/Route/RouteSection";
import { SavedPlaceShortcutsRow } from "@/components/Route/SavedPlaceShortcutsRow";
import { SavedPlaceModal } from "@/components/Route/SavedPlaceModal";
import { getSavedPlaces, type SavedSlot } from "@/lib/savedPlaces";
import { useStore } from "@/store/useStore";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
  /** TMAP map container — used to detect pans for 추천 새로고침 hint. */
  mapContainerRef: RefObject<HTMLDivElement | null>;
  /** Mobile drawer open state. Ignored on desktop. */
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
}

/**
 * Fixed-width 400px column on desktop. Three orthogonal layers (in
 * priority order):
 *
 *   1. **경로 모드** (`routeMode === true`): the start/end editor — flips on
 *      when the user picks 출발/도착 from any destination card.
 *   2. **History stack-driven views** (`panelStack`):
 *        - `main` → search bar + 즐겨찾기 모음 + 추천 목적지
 *        - `cluster` → destination list + shared notes/likes
 *        - `poiDetail` → single-POI detail screen with the four primary
 *          actions and the full TMAP detail block.
 *      Anything above the root gets a unified `←` back button in the panel
 *      header (calls `goBackInPanel`, which pops one stack entry).
 *
 * The mobile drawer reuses this column verbatim — there's no longer a
 * separate bottom-sheet card stack.
 */
export function SidePanel({ map, Tmapv2, mapContainerRef, open, isMobile, onClose }: Props) {
  const hintVisible = useStore((s) => s.recommendationsHintVisible);
  const searchRefreshHintVisible = useStore((s) => s.searchRefreshHintVisible);
  const setRecommendationsHintVisible = useStore(
    (s) => s.setRecommendationsHintVisible
  );
  const setSearchRefreshHintVisible = useStore(
    (s) => s.setSearchRefreshHintVisible
  );
  const triggerRefresh = useStore((s) => s.triggerRecommendationsRefresh);
  const routeMode = useStore((s) => s.routeMode);
  const panelStack = useStore((s) => s.panelStack);
  const goBack = useStore((s) => s.goBackInPanel);
  const resetToRecommendationsHome = useStore((s) => s.resetToRecommendationsHome);
  const user = useStore((s) => s.user);
  const openSavedPlaceRoutePick = useStore((s) => s.openSavedPlaceRoutePick);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  /** 추천 섹션이 메인 스크롤 뷰포트에 실제로 보일 때만 플로팅 새로고침 노출 */
  const [recommendationsInScrollView, setRecommendationsInScrollView] =
    useState(false);
  const [searchResultsInScrollView, setSearchResultsInScrollView] =
    useState(false);

  const view = panelStack[panelStack.length - 1] ?? { kind: "main" as const };
  const onMainPanel = !routeMode && view.kind === "main";

  const [mainSavedPlaces, setMainSavedPlaces] = useState(() => getSavedPlaces());
  const [mainEditingSlot, setMainEditingSlot] = useState<SavedSlot | null>(null);

  useEffect(() => {
    if (onMainPanel && user) setMainSavedPlaces(getSavedPlaces());
  }, [onMainPanel, user]);

  useEffect(() => {
    if (!user) setMainEditingSlot(null);
  }, [user]);

  const searchActive = useStore((s) => s.searchActive);

  useEffect(() => {
    if (!onMainPanel || routeMode) {
      setRecommendationsHintVisible(false);
      setSearchRefreshHintVisible(false);
    }
  }, [
    onMainPanel,
    routeMode,
    setRecommendationsHintVisible,
    setSearchRefreshHintVisible,
  ]);

  useLayoutEffect(() => {
    if (!onMainPanel || routeMode) {
      setRecommendationsInScrollView(false);
      return;
    }
    const root = mainScrollRef.current;
    const target = root?.querySelector<HTMLElement>("#side-panel-recommendations");
    if (!root || !target) {
      setRecommendationsInScrollView(false);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        const visible =
          e.isIntersecting &&
          (e.intersectionRatio >= 0.12 || e.intersectionRect.height >= 72);
        setRecommendationsInScrollView(visible);
      },
      { root, threshold: [0, 0.06, 0.12, 0.2, 0.35, 0.55] }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [onMainPanel, routeMode, open, searchActive, user, panelStack.length]);

  useLayoutEffect(() => {
    if (!onMainPanel || routeMode || !searchActive) {
      setSearchResultsInScrollView(false);
      return;
    }
    const root = mainScrollRef.current;
    const target = root?.querySelector<HTMLElement>("#side-panel-search-results");
    if (!root || !target) {
      setSearchResultsInScrollView(false);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        const visible =
          e.isIntersecting &&
          (e.intersectionRatio >= 0.12 || e.intersectionRect.height >= 72);
        setSearchResultsInScrollView(visible);
      },
      { root, threshold: [0, 0.06, 0.12, 0.2, 0.35, 0.55] }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [onMainPanel, routeMode, open, searchActive, user, panelStack.length]);

  /* The cluster view ships its own header today (with the cluster name), so
   * we let it render its own `←` to keep the title styling consistent. The
   * unified header here is for `poiDetail` (and any future shallow pushes
   * that don't need a custom title) and `profile`. */
  const showUnifiedBack =
    view.kind === "poiDetail" || view.kind === "profile";

  const headerTitle = (() => {
    switch (view.kind) {
      case "poiDetail":
        return view.poi.name;
      case "profile":
        return "프로필";
      default:
        return "TMAP WEB";
    }
  })();

  const onBrandTitleClick = useCallback(() => {
    resetToRecommendationsHome();
    setTimeout(() => {
      mainScrollRef.current
        ?.querySelector("#side-panel-recommendations")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [resetToRecommendationsHome]);

  return (
    <>
      {/* Backdrop only when used as mobile drawer */}
      {isMobile && open && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={clsx(
          "bg-tmap-surface border-r border-gray-200/60 flex flex-col overflow-hidden shrink-0 z-40",
          isMobile
            ? clsx(
                "fixed top-0 left-0 h-full w-[min(85vw,400px)] shadow-float transition-transform",
                open ? "translate-x-0" : "-translate-x-full"
              )
            : "w-[400px] h-full relative"
        )}
        aria-label="side panel"
      >
        <header className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200/60 bg-tmap-surface shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {showUnifiedBack && (
              <button
                type="button"
                onClick={goBack}
                className="shrink-0 w-7 h-7 -ml-1 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
                aria-label="뒤로 가기"
                title="뒤로"
              >
                ←
              </button>
            )}
            {showUnifiedBack ? (
              <h2 className="text-sm font-bold tracking-tight text-tmap-ink truncate">
                {headerTitle}
              </h2>
            ) : (
              <button
                type="button"
                onClick={onBrandTitleClick}
                className="text-sm font-bold tracking-tight text-tmap-ink truncate text-left min-w-0 rounded-lg -mx-1 px-1 py-0.5 hover:bg-gray-100/80 transition-colors"
                aria-label="추천 목적지 홈으로 이동"
              >
                {headerTitle}
              </button>
            )}
          </div>
          {isMobile && (
            <button
              className="text-gray-500 text-lg"
              onClick={onClose}
              aria-label="사이드패널 닫기"
            >
              ×
            </button>
          )}
        </header>

        {routeMode && view.kind !== "profile" ? (
          <RouteSection map={map} />
        ) : view.kind === "cluster" ? (
          <ClusterDetailView map={map} Tmapv2={Tmapv2} />
        ) : view.kind === "poiDetail" ? (
          <PoiDetailView poi={view.poi} map={map} Tmapv2={Tmapv2} />
        ) : view.kind === "profile" ? (
          <ProfileView />
        ) : (
          <>
            <SearchSection
              map={map}
              Tmapv2={Tmapv2}
              mapContainerRef={mapContainerRef}
            />
            <div className="flex flex-col flex-1 min-h-0 min-w-0 relative">
              <div
                ref={mainScrollRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-20 space-y-2.5"
              >
                {user && (
                  <div className="rounded-2xl bg-white p-2.5 shadow-card border border-gray-100/80">
                    <SavedPlaceShortcutsRow
                      savedPlaces={mainSavedPlaces}
                      onFilledClick={(slot, poi) => openSavedPlaceRoutePick(poi, slot)}
                      onEmptyClick={(slot) => setMainEditingSlot(slot)}
                    />
                  </div>
                )}
                <SearchResultsSection />
                <ClustersSection />
                <RecommendationsSection
                  map={map}
                  Tmapv2={Tmapv2}
                  mapContainerRef={mapContainerRef}
                />
              </div>
              {((hintVisible &&
                !searchActive &&
                recommendationsInScrollView) ||
                (searchRefreshHintVisible &&
                  searchActive &&
                  searchResultsInScrollView)) && (
                <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-30 flex justify-center px-2">
                  <div className="pointer-events-auto recommend-refresh-hint">
                    <button
                      type="button"
                      onClick={triggerRefresh}
                      className="bg-brand text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.4)] hover:bg-brand-dark active:scale-95 transition-colors flex items-center gap-2"
                      aria-label={
                        searchActive
                          ? "검색 결과 새로고침"
                          : "추천 목적지 새로고침"
                      }
                    >
                      <span aria-hidden>🔄</span>
                      새로고침
                    </button>
                  </div>
                </div>
              )}
            </div>

            {user && (
              <SavedPlaceModal
                open={mainEditingSlot !== null}
                slot={mainEditingSlot}
                onClose={() => setMainEditingSlot(null)}
                onSaved={() => setMainSavedPlaces(getSavedPlaces())}
                map={map}
              />
            )}
          </>
        )}
      </aside>
    </>
  );
}
