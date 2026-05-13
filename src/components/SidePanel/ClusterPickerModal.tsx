import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { apiListMyClusters } from "@/lib/clusterApi";
import { getAuthToken } from "@/lib/http";
import { listClusters } from "@/lib/storage";
import { isClusterOwnedByMe } from "@/lib/clusterOwnership";
import { Button } from "@/components/UI/Button";
import type { ClusterPayload } from "@/types";
import type { TmapMap } from "@/types/tmap";

interface Props {
  /** Map handle so newly-created clusters can snapshot the current center
   *  & zoom — important for share links opened by recipients later. */
  map: TmapMap | null;
}

/**
 * Modal triggered by `useStore.openClusterPicker(poi)`. Lets the user pick
 * which cluster to add the POI to, or create a brand new one on the spot.
 *
 * Shown for every "+ 즐겨찾기에 추가" surface that lacks an implicit target
 * cluster — main side-panel search results, the POI detail screen, etc.
 * (Recommendations and the cluster-detail's inline search bypass this modal
 * per spec, since their target is unambiguous.)
 *
 * Permissions:
 *   - Only clusters owned by the current user are listed as add targets
 *     (`ownerId` matches). Viewers of a shared cluster can't push into
 *     someone else's collection. Legacy rows with no `ownerId` still
 *     count as "mine" for anonymous users (`clusterOwnership`).
 *   - Creating a **new** cluster requires sign-in (`createClusterWithPoi`).
 */
export function ClusterPickerModal({ map }: Props) {
  const poi = useStore((s) => s.clusterPickerPoi);
  const close = useStore((s) => s.closeClusterPicker);
  const addPoiToCluster = useStore((s) => s.addPoiToCluster);
  const createClusterWithPoi = useStore((s) => s.createClusterWithPoi);
  const bumpClusterList = useStore((s) => s.bumpClusterList);
  const user = useStore((s) => s.user);

  /* Re-list clusters whenever the modal opens so brand-new clusters show
   * up immediately (the action that opens us may have just created one). */
  const [items, setItems] = useState<ClusterPayload[]>([]);
  useEffect(() => {
    if (!poi) return;
    let cancelled = false;
    if (apiMode() && getAuthToken()) {
      void apiListMyClusters()
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    } else {
      setItems(listClusters());
    }
    return () => {
      cancelled = true;
    };
  }, [poi]);

  const ownTargets = useMemo(
    () => items.filter((c) => isClusterOwnedByMe(c, user?.id)),
    [items, user?.id]
  );

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  /* Reset modal state when it closes/reopens. */
  useEffect(() => {
    if (!poi) {
      setCreating(false);
      setNewName("");
    } else {
      setNewName(`${poi.name} 모음`);
    }
  }, [poi]);

  useEffect(() => {
    if (!user) setCreating(false);
  }, [user]);

  if (!poi) return null;

  const onPickExisting = (clusterId: string) => {
    addPoiToCluster(clusterId, poi);
    close();
  };

  const onCreate = async () => {
    if (!user) {
      window.alert("새 즐겨찾기를 만들려면 로그인해 주세요.");
      return;
    }
    if (!map) return;
    const c = map.getCenter();
    const center = { lat: c.lat(), lng: c.lng() };
    const zoom = map.getZoom();
    const id = await createClusterWithPoi(newName, poi, center, zoom);
    if (id == null) return;
    bumpClusterList();
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="즐겨찾기에 추가"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={close}
        aria-hidden
      />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden">
        <header className="px-4 py-3 border-b">
          <div className="text-sm font-semibold">즐겨찾기에 추가</div>
          <div className="text-[11px] text-gray-500 mt-0.5 truncate">
            {poi.name}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {ownTargets.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-gray-500">
              {user ? (
                <>
                  아직 만든 즐겨찾기가 없어요.
                  <br />
                  아래에서 새 즐겨찾기를 만들 수 있어요.
                </>
              ) : (
                <>
                  로그인하면 즐겨찾기 모음을 만들고 장소를 모을 수 있어요.
                  <br />
                  공유 링크로 받은 즐겨찾기는 로그인 없이 목록에서 열 수 있어요.
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {ownTargets.map((c) => {
                const already = c.pois.some((p) => p.id === poi.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => !already && onPickExisting(c.id)}
                      disabled={already}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          목적지 {c.pois.length}개
                        </div>
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {already ? "이미 있음" : "추가 →"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t bg-gray-50 px-4 py-3">
          {creating ? (
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void onCreate()}
                className="w-full px-2 py-1.5 text-sm border rounded"
                placeholder="새 즐겨찾기 이름"
                autoFocus
                aria-label="새 즐겨찾기 이름"
              />
              <div className="flex gap-1.5 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreating(false)}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onCreate}
                  disabled={!newName.trim() || !map}
                >
                  만들고 추가
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                취소
              </Button>
              {user ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreating(true)}
                >
                  + 새 즐겨찾기 만들기
                </Button>
              ) : (
                <span className="text-[11px] text-gray-500 text-right">
                  새 즐겨찾기는 로그인 후
                </span>
              )}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
