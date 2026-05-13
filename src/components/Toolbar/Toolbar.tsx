import { useStore } from "@/store/useStore";
import { GoogleLoginButton } from "@/components/Auth/GoogleLoginButton";
import { apiMode } from "@/lib/apiConfig";

const DEMO_BABY_AI_HASH = "#/demo/baby-ai";

interface Props {
  /** e.g. open side drawer on mobile before pushing profile view */
  onOpenProfile?: () => void;
}

/**
 * Floating top-right toolbar. Intentionally minimal:
 *
 *   - Favorite-collection name badge (when an active/viewed cluster has a name).
 *   - Google login button.
 *
 * Removed per spec ("오른쪽 상단에 클러스터 저장 공유 초기화 버튼은 없앤다." — product copy now uses 즐겨찾기):
 *   - 즐겨찾기 저장 — cluster creation is now implicit; the cluster picker
 *     modal's "+ 새 즐겨찾기 만들기" persists via `createClusterWithPoi`,
 *     and `addPoiToCluster` writes through to localStorage on every add.
 *     There is no longer a separate "draft" state to commit.
 *   - 공유 — the share-link modal had no entry point besides this button;
 *     a future surface (e.g. an icon inside the cluster detail header)
 *     can re-introduce it without resurrecting toolbar UI.
 *   - 초기화 — the only consumer of `clearAll` was here; the action is
 *     left in the store for future use but no longer triggers from the UI.
 *
 * Sticky-note-era buttons that had already been removed earlier:
 *   - "자동 정렬" (auto-align of sticky notes — no notes anymore)
 *   - "Clear all" (sticky-note workspace wipe — replaced by the now-gone
 *     `초기화` action)
 */
export function Toolbar({ onOpenProfile }: Props) {
  const viewOnly = useStore((s) => s.viewOnly);
  const currentClusterName = useStore((s) => s.currentClusterName);

  return (
    <div className="absolute top-3 right-3 z-40 flex flex-wrap gap-2 justify-end max-w-[60%]">
      {apiMode() && (
        <button
          type="button"
          className="self-center rounded-full border border-gray-200 bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-gray-600 shadow-float hover:bg-gray-50"
          onClick={() => {
            window.location.hash = DEMO_BABY_AI_HASH;
          }}
        >
          AI 데모
        </button>
      )}
      {currentClusterName && (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl px-3 py-1.5 text-xs shadow-float self-center">
          <span className="text-tmap-muted">즐겨찾기</span>{" "}
          <span className="font-semibold text-tmap-ink">{currentClusterName}</span>
          {viewOnly && (
            <span className="ml-1 text-amber-600">(읽기전용)</span>
          )}
        </div>
      )}
      <GoogleLoginButton onOpenProfile={onOpenProfile} />
    </div>
  );
}
