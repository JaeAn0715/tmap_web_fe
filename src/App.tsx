import { useEffect, useState } from "react";
import { MapContainer } from "@/components/Map/MapContainer";
import { MapControls } from "@/components/Map/MapControls";
import { PinLayer } from "@/components/Map/PinLayer";
import { SearchResultMarkers } from "@/components/Map/SearchResultMarkers";
import { PinLabelLayer } from "@/components/Map/PinLabelLayer";
import { Toolbar } from "@/components/Toolbar/Toolbar";
import { MapToast } from "@/components/Map/MapToast";
import { RouteOverlay } from "@/components/Route/RouteOverlay";
import { SidePanel } from "@/components/SidePanel/SidePanel";
import { ClusterPickerModal } from "@/components/SidePanel/ClusterPickerModal";
import { BabyAiDemoOverlay } from "@/components/Demo/BabyAiDemoOverlay";
import { SavedPlaceRoutePickModal } from "@/components/Route/SavedPlaceRoutePickModal";
import { useTmapMap } from "@/hooks/useTmapMap";
import { useIsMobile } from "@/hooks/useResponsive";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { apiGetCluster, apiSubscribeCluster } from "@/lib/clusterApi";
import { pullAllMeData } from "@/lib/bootstrapMe";
import { apiGetMe } from "@/lib/authApi";
import { clearAuthToken, getAuthToken } from "@/lib/http";
import { isClusterOwnedByMe } from "@/lib/clusterOwnership";
import { loadCluster, saveCluster, listClusters } from "@/lib/storage";
/* `Toolbar` no longer hosts `즐겨찾기 저장 / 공유 / 초기화` — those buttons
 * were removed per spec. The cluster save/share/reset state machinery
 * (`shareInfo`, `setShareInfo`, `onShare`, `SaveClusterModal`) was
 * deleted with them since nothing else triggered the flow. */

/**
 * Top-level layout. The sticky-note era is gone — the map shows pins for
 * the **active cluster's** destinations only, and all per-destination UX
 * (notes, likes, …) lives inside the side panel's
 * `ClusterDetailView`. Mobile uses the same side panel as a drawer; there
 * is no longer a separate bottom-sheet card stack.
 */
export default function App() {
  const { containerRef, map, Tmapv2, ready, error } = useTmapMap();
  const isMobile = useIsMobile();
  const geo = useGeolocation();

  const routeActive = useStore((s) => s.routeActive);
  const viewOnly = useStore((s) => s.viewOnly);
  const clusterMapView = useStore((s) => s.clusterMapView);
  const currentClusterId = useStore((s) => s.currentClusterId);
  const loadFromCluster = useStore((s) => s.loadFromCluster);
  const setUserLocation = useStore((s) => s.setUserLocation);

  const [panelOpen, setPanelOpen] = useState(true);

  /* On mobile, panel starts closed; on desktop it's permanent. */
  useEffect(() => {
    setPanelOpen(!isMobile);
  }, [isMobile]);

  /* Restore API session when a JWT is already in localStorage. */
  useEffect(() => {
    if (!apiMode()) return;
    const token = getAuthToken();
    if (!token) return;
    void (async () => {
      try {
        const u = await apiGetMe();
        useStore.getState().signIn(u);
        await pullAllMeData();
        useStore.getState().bumpClusterList();
      } catch (e) {
        console.error(e);
        clearAuthToken();
        useStore.getState().signOut();
      }
    })();
  }, []);

  /* ----------------- Hash routing for share links: #/c/<id> ----------------
   *
   * When the URL points at a cluster:
   *   1. Load it from the local mock backend.
   *   2. If the cluster is NOT yet in this viewer's localStorage, persist it
   *      so it shows up in their "즐겨찾기 모음" list immediately. This is the
   *      mock-backend equivalent of what a real `GET /clusters/:id` would
   *      do — the server returns the payload and we cache it locally.
   *      Per spec: 공유받은 사용자는 로그인하지 않아도 즐겨찾기 모음에
   *      공유받은 즐겨찾기를 볼 수 있다 — so this seeding must run for the
   *      anonymous case too.
   *   3. Whether the viewer is the owner is decided downstream by
   *      `lib/clusterOwnership.ts` (compares `ownerId` to the current user).
   *      We pass `viewOnly: true` to `loadFromCluster` here as a starting
   *      stance; if the URL viewer is actually the owner, the destination
   *      card's owner-derived gates will still apply correctly because
   *      `ClustersSection.onOpen` re-derives viewOnly from ownership.
   */
  useEffect(() => {
    const apply = () => {
      const m = window.location.hash.match(/^#\/c\/([A-Za-z0-9]+)/);
      if (!m) return;
      const id = m[1];
      if (apiMode()) {
        void (async () => {
          try {
            const c = await apiGetCluster(id);
            const user = useStore.getState().user;
            const ownedByMe = isClusterOwnedByMe(c, user?.id);
            if (user && !ownedByMe) {
              try {
                await apiSubscribeCluster(id);
              } catch {
                /* already subscribed or server rejected — still show cluster */
              }
            }
            loadFromCluster(c, !ownedByMe);
          } catch (e) {
            console.error(e);
          }
        })();
        return;
      }
      const c = loadCluster(id);
      if (!c) return;
      const alreadyListed = listClusters().some((x) => x.id === c.id);
      if (!alreadyListed) {
        /* Mock-only seeding: in a real backend `loadCluster` IS the network
         * call so this branch is unreachable (the cluster is fetched but
         * not yet locally cached — we'd cache the response). In mock,
         * `loadCluster` reads from the same store as `listClusters`, so
         * this branch only triggers if we ever expose a way to receive a
         * payload out-of-band (e.g. dev tooling). Kept defensively. */
        saveCluster(c);
      }
      loadFromCluster(c, true);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [loadFromCluster]);

  /* When a shared cluster is loaded and the map is ready, recenter to its
     saved view. This wins over geolocation centering for the viewer. */
  useEffect(() => {
    if (!ready || !map || !Tmapv2) return;
    if (!viewOnly || !clusterMapView || !currentClusterId) return;
    map.setCenter(
      new Tmapv2.LatLng(clusterMapView.center.lat, clusterMapView.center.lng)
    );
    map.setZoom(clusterMapView.zoom);
  }, [ready, map, Tmapv2, viewOnly, clusterMapView, currentClusterId]);

  /* Geolocation → recenter map (only if not in shared/view-only mode). */
  useEffect(() => {
    if (geo.status === "granted" && geo.position) {
      setUserLocation(geo.position);
    }
  }, [geo.status, geo.position, setUserLocation]);

  useEffect(() => {
    if (!ready || !map || !Tmapv2) return;
    if (!geo.position) return;
    if (useStore.getState().viewOnly) return; // share link wins
    map.setCenter(new Tmapv2.LatLng(geo.position.lat, geo.position.lng));
  }, [ready, map, Tmapv2, geo.position]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SidePanel
        map={map}
        Tmapv2={Tmapv2}
        mapContainerRef={containerRef}
        open={panelOpen}
        isMobile={isMobile}
        onClose={() => setPanelOpen(false)}
      />

      {/* Mobile: floating hamburger to reopen the side panel */}
      {isMobile && !panelOpen && (
        <button
          className="fixed top-3 left-3 z-30 bg-white border rounded-md shadow px-2.5 py-1.5 text-sm"
          onClick={() => setPanelOpen(true)}
          aria-label="사이드패널 열기"
        >
          ☰
        </button>
      )}

      <main className="relative flex-1 overflow-hidden">
        <MapContainer containerRef={containerRef} error={error} />

        {/* Cluster pins follow the in-memory `pois` array, which is cleared
         *  by `goBackInPanel` when the user backs out of the cluster view —
         *  so the layer naturally has nothing to render once the user
         *  leaves cluster context. Search-result markers + labels stay
         *  available everywhere except in route mode (which hides every
         *  POI overlay so the route line is unobstructed). */}
        {ready && !routeActive && <PinLayer map={map} Tmapv2={Tmapv2} />}
        {ready && !routeActive && (
          <SearchResultMarkers map={map} Tmapv2={Tmapv2} />
        )}
        {ready && !routeActive && <PinLabelLayer map={map} Tmapv2={Tmapv2} />}

        {ready && <RouteOverlay map={map} Tmapv2={Tmapv2} />}

        <Toolbar onOpenProfile={() => setPanelOpen(true)} />

        {/* In-map controls: bottom-left zoom +/− + level, bottom-right
         *  현재 위치로 이동 (only when geolocation has resolved). Replaces
         *  the SDK's built-in `zoomControl` per spec. */}
        {ready && <MapControls map={map} Tmapv2={Tmapv2} />}

        {viewOnly && (
          /* Stacked above the bottom-left zoom controls so it doesn't
           *  overlap them. `pointer-events-none` because it's purely
           *  informational. */
          <div className="pointer-events-none absolute bottom-16 left-3 z-30 bg-amber-100 border border-amber-300 rounded px-2 py-1 text-[11px] text-amber-800 shadow">
            읽기 전용 모드 · 목적지 편집은 막혀있지만 좋아요/코멘트는 남길 수 있어요
          </div>
        )}

        {/* Geolocation status banner */}
        {geo.status === "denied" && (
          <div className="absolute bottom-3 right-3 z-30 bg-white border border-amber-300 rounded px-2 py-1 text-[11px] text-amber-800 shadow max-w-xs">
            위치 권한이 거부되어 기본 위치(서울시청)에서 시작합니다. 브라우저
            주소창의 위치 아이콘에서 권한을 변경할 수 있습니다.
          </div>
        )}

        <MapToast />
        <SavedPlaceRoutePickModal />
      </main>

      {/* Global cluster picker modal — opened by `openClusterPicker(poi)`
       *  from any "+" surface that lacks an implicit target (main search,
       *  POI detail, …). Renders nothing when no POI is queued. */}
      <ClusterPickerModal map={map} />
      <BabyAiDemoOverlay />
    </div>
  );
}
