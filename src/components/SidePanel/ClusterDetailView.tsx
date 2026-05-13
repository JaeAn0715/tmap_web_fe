import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { ClusterDestinationCard } from "./ClusterDestinationCard";
import { SavedPlaceShortcutsRow } from "@/components/Route/SavedPlaceShortcutsRow";
import { SavedPlaceModal } from "@/components/Route/SavedPlaceModal";
import { getSavedPlaces, type SavedSlot } from "@/lib/savedPlaces";
import { copyClusterShareLink } from "@/lib/clusterShare";
import { frameMapToPois } from "@/lib/mapFrame";
import { flyToPoi } from "@/lib/mapAnimate";
import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * Side-panel view shown after the user clicks a saved cluster (or arrives
 * via a `#/c/<id>` share link). Lists the cluster's destinations, each
 * showing aggregate `📝 n notes · ❤️ n likes` on the right.
 *
 * Destination rows are an **accordion**: only one expanded at a time. Opening
 * another row closes the previous; tapping the open row again collapses all
 * and the map zooms out to fit every cluster pin (`frameMapToPois`). Pin taps
 * on the map expand the matching row and fly the camera (same as the row).
 *
 * Cluster view **does not** include inline POI search (목적지 추가는 메인·추천·
 * POI 상세 등에서 즐겨찾기 피커/다른 즐겨찾기 추가로 처리).
 *
 * The "back" button at the top routes through `goBackInPanel`, which also
 * clears `pois`/`currentClusterId` so the cluster's pins disappear from
 * the map after exit (per spec "즐겨찾기 뷰에서 뒤로가기를 누르면 즐겨찾기 내
 * 목적지의 pin들은 맵에서 보여지지 않는다.").
 */
export function ClusterDetailView({ map, Tmapv2 }: Props) {
  const pois = useStore((s) => s.pois);
  const feedback = useStore((s) => s.feedback);
  const clusterName = useStore((s) => s.currentClusterName);
  const clusterId = useStore((s) => s.currentClusterId);
  const selectedId = useStore((s) => s.selectedId);
  const goBack = useStore((s) => s.goBackInPanel);
  const selectPoi = useStore((s) => s.selectPoi);
  const openSavedPlaceRoutePick = useStore((s) => s.openSavedPlaceRoutePick);
  const user = useStore((s) => s.user);
  const showMapToast = useStore((s) => s.showMapToast);

  /** Abort prior fly when switching destinations or collapsing the accordion. */
  const flyCancelRef = useRef<{ cancel: () => void } | null>(null);

  /**
   * Accordion: only one destination expanded at a time (`selectedId`).
   * Same row again → collapse all + zoom out to full cluster (like initial frame).
   */
  const onDestinationHeaderClick = useCallback(
    (poi: POI) => {
      const cur = useStore.getState().selectedId;
      if (cur === poi.id) {
        selectPoi(null);
        flyCancelRef.current?.cancel();
        if (map && Tmapv2) {
          const list = useStore.getState().pois;
          if (list.length > 0) frameMapToPois(map, Tmapv2, list);
        }
        return;
      }
      selectPoi(poi.id);
    },
    [map, Tmapv2, selectPoi]
  );

  /* Pin / row selection → fly to POI (same zoom as POI detail / search). */
  useEffect(() => {
    if (!selectedId || !map || !Tmapv2) return;
    const poi = pois.find((p) => p.id === selectedId);
    if (!poi) return;
    flyCancelRef.current?.cancel();
    flyCancelRef.current = flyToPoi(map, Tmapv2, poi.lat, poi.lng, {
      zoom: 17,
    });
  }, [selectedId, pois, map, Tmapv2]);

  useEffect(() => {
    return () => {
      flyCancelRef.current?.cancel();
      flyCancelRef.current = null;
    };
  }, []);

  const [savedPlaces, setSavedPlacesState] = useState(() => getSavedPlaces());
  const [editingSlot, setEditingSlot] = useState<SavedSlot | null>(null);

  useEffect(() => {
    if (user) setSavedPlacesState(getSavedPlaces());
  }, [clusterId, user]);

  useEffect(() => {
    if (!user) setEditingSlot(null);
  }, [user]);

  /* When the cluster opens from the list or hash, frame all pins like search
   * results (padding + max zoom). Read POIs from store inside the effect so
   * we never frame with a stale empty array on the same tick as clusterId. */
  useEffect(() => {
    if (!map || !Tmapv2 || !clusterId) return;
    const run = () => {
      const list = useStore.getState().pois;
      if (list.length === 0) return;
      frameMapToPois(map, Tmapv2, list);
    };
    run();
    const id = window.requestAnimationFrame(() => run());
    return () => window.cancelAnimationFrame(id);
  }, [clusterId, map, Tmapv2]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-2.5 border-b border-gray-100/90 bg-white shadow-card sticky top-0 z-10">
        <button
          type="button"
          onClick={goBack}
          className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          aria-label="뒤로 가기"
          title="메인으로"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">
            {clusterName ?? "즐겨찾기"}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            목적지 {pois.length}개
          </div>
        </div>
        {clusterId && (
          <button
            type="button"
            className="shrink-0 text-[11px] text-blue-600 hover:underline px-1 py-0.5"
            title="공유 링크를 클립보드에 복사"
            onClick={async () => {
              const ok = await copyClusterShareLink(clusterId);
              showMapToast(
                ok
                  ? "공유 링크가 클립보드에 복사되었습니다."
                  : "클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요."
              );
            }}
          >
            공유
          </button>
        )}
      </div>

      {user && (
        <div className="px-2 py-2 shrink-0">
          <div className="rounded-2xl bg-white p-2.5 shadow-card border border-gray-100/80">
            <SavedPlaceShortcutsRow
              savedPlaces={savedPlaces}
              onFilledClick={(slot, poi) => openSavedPlaceRoutePick(poi, slot)}
              onEmptyClick={(slot) => setEditingSlot(slot)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
        {pois.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            이 즐겨찾기에는 아직 목적지가 없어요.
            <br />
            검색하거나 추천 목록에서 추가해보세요.
          </div>
        ) : (
          <ul>
            {pois.map((p) => (
              <ClusterDestinationCard
                key={p.id}
                poi={p}
                feedback={feedback[p.id] ?? { likes: [], notes: [] }}
                clusterSaved={!!clusterId}
                expanded={selectedId === p.id}
                onHeaderClick={() => onDestinationHeaderClick(p)}
              />
            ))}
          </ul>
        )}
      </div>

      {user && (
        <SavedPlaceModal
          open={editingSlot !== null}
          slot={editingSlot}
          onClose={() => setEditingSlot(null)}
          onSaved={() => setSavedPlacesState(getSavedPlaces())}
          map={map}
        />
      )}
    </div>
  );
}
