import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { apiListMyClusters } from "@/lib/clusterApi";
import { listClusters } from "@/lib/storage";
import { isClusterOwnedByMe } from "@/lib/clusterOwnership";
import { copyClusterShareLink } from "@/lib/clusterShare";
import type { ClusterPayload } from "@/types";
import { EditClusterModal } from "./EditClusterModal";

/**
 * "즐겨찾기 모음" inline section. Shows BOTH owned and shared (received via
 * share link) clusters in one list per spec —
 * `공유받은 사용자는 로그인하지 않아도 즐겨찾기 모음에 공유받은 즐겨찾기를 볼 수 있다.`
 *
 * Per-row UX:
 *  - **Body click** → `loadFromCluster(c, viewOnly = !ownedByMe)`. The
 *    `viewOnly` flag drives `ClusterDestinationCard`'s ability to remove
 *    destinations: only the original owner can edit destinations.
 *  - **Shared badge** (`👥 공유받음`) appears for non-owned rows so the
 *    user can immediately tell which clusters are theirs vs. received.
 *  - **Owned row** `수정` 버튼 → 모달에서 이름 변경 또는 삭제.
 *  - **Shared row** `수정` 버튼 → 모달에서 내 목록에서만 제거 (이름 변경 불가).
 *
 * Hidden when the user has no clusters at all (matches the spec "비면 자동
 * 숨김").
 */
export function ClustersSection() {
  const [items, setItems] = useState<ClusterPayload[]>(() =>
    apiMode() ? [] : listClusters()
  );
  const [editTarget, setEditTarget] = useState<ClusterPayload | null>(null);
  const loadFromCluster = useStore((s) => s.loadFromCluster);
  const showMapToast = useStore((s) => s.showMapToast);
  const clusterListVersion = useStore((s) => s.clusterListVersion);
  const user = useStore((s) => s.user);
  /* Likes/notes mutations also bump the localStorage record's `updatedAt`,
   *  so we re-list when feedback changes too — otherwise the per-cluster
   *  counts here would go stale until the next page refresh. The
   *  panelStack dep refreshes the list when the user closes a cluster
   *  view (likes/notes there mutate feedback during the visit). */
  const feedback = useStore((s) => s.feedback);
  const panelStack = useStore((s) => s.panelStack);

  useEffect(() => {
    let cancelled = false;
    if (apiMode()) {
      if (!user) {
        setItems([]);
        return () => {
          cancelled = true;
        };
      }
      void apiListMyClusters()
        .then((list) => {
          if (!cancelled) setItems(list);
        })
        .catch((e) => {
          console.error(e);
          if (!cancelled) setItems([]);
        });
      return () => {
        cancelled = true;
      };
    }
    setItems(listClusters());
    return () => {
      cancelled = true;
    };
  }, [user?.id, feedback, panelStack, clusterListVersion]);

  if (items.length === 0) return null;

  const onOpen = (c: ClusterPayload) => {
    /* Derive viewOnly from ownership: only the original owner can edit
     * destinations. Likes/notes still work for shared-cluster viewers
     * (gated separately on login state inside the destination card). */
    const ownedByMe = isClusterOwnedByMe(c, user?.id);
    loadFromCluster(c, !ownedByMe);
  };
  const onCopyShare = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await copyClusterShareLink(id);
    showMapToast(
      ok
        ? "공유 링크가 클립보드에 복사되었습니다."
        : "클립보드 복사에 실패했습니다. 브라우저 권한을 확인하세요."
    );
  };

  return (
    <>
    <section className="rounded-2xl bg-white shadow-card border border-gray-100/80 overflow-hidden">
      <h3 className="px-3 py-2 text-[11px] font-semibold text-tmap-muted uppercase tracking-wide bg-gray-50/90 sticky top-0 flex items-center justify-between border-b border-gray-100/90">
        <span className="text-tmap-ink/70">즐겨찾기 모음</span>
        <span className="tabular-nums text-gray-400">{items.length}</span>
      </h3>
      <ul className="divide-y divide-gray-100/90">
        {items.map((c) => {
          const totals = aggregateFeedback(c);
          const ownedByMe = isClusterOwnedByMe(c, user?.id);
          return (
            <li
              key={c.id}
              className="p-3 hover:bg-brand-light/60 cursor-pointer transition-colors active:bg-brand-light/90"
              onClick={() => onOpen(c)}
              role="button"
              aria-label={`${c.name} 열기`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-tmap-ink truncate flex items-center gap-1">
                    <span className="truncate">{c.name}</span>
                    {/* "현재" 배지는 더 이상 의미 없음 — 즐겨찾기 상세뷰를
                     *  떠나는 순간 활성 즐겨찾기 컨텍스트가 정리되어
                     *  맵 핀도 사라지므로, 리스트에서 "현재"라고 표시할
                     *  대상이 존재하지 않는다. */}
                    {!ownedByMe && (
                      <span
                        className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1 shrink-0"
                        title={
                          c.ownerName
                            ? `${c.ownerName} 님이 만든 공유 즐겨찾기`
                            : "공유받은 즐겨찾기"
                        }
                      >
                        👥 공유받음
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-2 flex-wrap">
                    <span>{c.pois.length}개 목적지</span>
                    {totals.notes > 0 && (
                      <span title="코멘트 합계">📝 {totals.notes}</span>
                    )}
                    {totals.likes > 0 && (
                      <span title="좋아요 합계">❤️ {totals.likes}</span>
                    )}
                    <span className="text-gray-400">
                      · {new Date(c.updatedAt ?? c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0 items-end">
                  <button
                    className="text-[10px] font-medium text-brand hover:underline"
                    onClick={(e) => void onCopyShare(e, c.id)}
                    title="공유 링크 복사"
                  >
                    공유
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-gray-600 hover:underline whitespace-nowrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(c);
                    }}
                    title="이름 바꾸기 또는 삭제"
                  >
                    수정
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
    <EditClusterModal
      open={editTarget !== null}
      cluster={editTarget}
      onClose={() => setEditTarget(null)}
    />
  </>
  );
}

function aggregateFeedback(c: ClusterPayload) {
  let notes = 0;
  let likes = 0;
  for (const v of Object.values(c.feedback ?? {})) {
    notes += v?.notes?.length ?? 0;
    likes += v?.likes?.length ?? 0;
  }
  return { notes, likes };
}
