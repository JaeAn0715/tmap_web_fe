import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { useStore } from "@/store/useStore";
import { PoiPhoto, PoiEmojiAvatar } from "@/components/UI/PoiPhoto";
import { PoiDetails } from "@/components/UI/PoiDetails";
import { PoiPrimaryActions } from "@/components/UI/PoiPrimaryActions";
import { PoiReviewSummarySection } from "@/components/UI/PoiReviewSummarySection";
import { PoiCommentsPanel } from "@/components/UI/PoiCommentsPanel";
import type { ClusterDestinationFeedback, POI } from "@/types";

interface Props {
  poi: POI;
  feedback: ClusterDestinationFeedback;
  /** Cluster has been saved (so feedback writes will persist). When false the
   *  notes/likes UI is shown but with a hint that saving is required. */
  clusterSaved: boolean;
  /** Exactly one row expanded at a time — driven by cluster `selectedId`. */
  expanded: boolean;
  /** Row header tap: parent toggles accordion + map (zoom in / fit cluster). */
  onHeaderClick: () => void;
}

/**
 * One row in `ClusterDetailView`. Expansion is **controlled** by the parent
 * (`selectedId`) so only one card is open at a time.
 *
 * Collapsed: `[photo] [name] [n notes · n likes] [▸]`
 * Expanded: 좋아요 → 장소 리뷰 요약 → 공유 코멘트 → 4버튼 → `PoiDetails` → 소유자만 제거.
 */
export function ClusterDestinationCard({
  poi,
  feedback,
  clusterSaved,
  expanded,
  onHeaderClick,
}: Props) {
  const user = useStore((s) => s.user);
  const removePoi = useStore((s) => s.removePoi);
  const viewOnly = useStore((s) => s.viewOnly);
  const toggleLike = useStore((s) => s.toggleLike);
  const addClusterNote = useStore((s) => s.addClusterNote);
  const editClusterNote = useStore((s) => s.editClusterNote);
  const deleteClusterNote = useStore((s) => s.deleteClusterNote);
  const cardRef = useRef<HTMLLIElement>(null);

  /* Pin or row selection expands this card — keep it in view. */
  useEffect(() => {
    if (!expanded) return;
    cardRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [expanded]);

  const myLike = user
    ? feedback.likes.find((l) => l.userId === user.id)
    : undefined;
  const noteCount = feedback.notes.length;
  const likeCount = feedback.likes.length;

  const myNoteTextsForReview = useMemo(
    () =>
      user
        ? feedback.notes
            .filter((n) => n.userId === user.id)
            .map((n) => n.text ?? "")
            .filter((t) => {
              const s = t.trim();
              return s.length > 0 && s !== "(이미지)";
            })
        : [],
    [feedback.notes, user]
  );

  return (
    <li
      ref={cardRef}
      className={clsx(
        "border-b transition-colors",
        expanded ? "bg-brand-light/50" : "bg-white"
      )}
    >
      <button
        type="button"
        onClick={onHeaderClick}
        aria-expanded={expanded}
        className="w-full text-left p-2.5 flex gap-2 items-start hover:bg-brand-light/40"
      >
        <PoiPhoto
          poi={poi}
          className="w-12 h-12 rounded shrink-0"
          fallback={<PoiEmojiAvatar poi={poi} className="w-12 h-12 text-xl" />}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{poi.name}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {poi.roadAddress || poi.address}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-0.5 text-[11px]">
          <span
            className="inline-flex items-center gap-1 text-gray-600"
            title={`코멘트 ${noteCount}개`}
          >
            <span aria-hidden>📝</span>
            <span className="tabular-nums">{noteCount}</span>
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-1 tabular-nums",
              myLike ? "text-rose-600 font-semibold" : "text-gray-600"
            )}
            title={`좋아요 ${likeCount}개`}
          >
            <span aria-hidden>{myLike ? "❤️" : "🤍"}</span>
            <span>{likeCount}</span>
          </span>
        </div>
        <span
          className="shrink-0 self-center text-gray-400 text-xs ml-1"
          aria-hidden
        >
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="px-2.5 pb-3 pt-1 space-y-2 text-xs">
          {/* Like row */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  alert("좋아요는 로그인 후 사용할 수 있어요.");
                  return;
                }
                if (!clusterSaved) {
                  alert(
                    "아직 저장되지 않은 즐겨찾기입니다. 먼저 즐겨찾기를 저장하면 좋아요/코멘트가 공유됩니다."
                  );
                  return;
                }
                toggleLike(poi.id);
              }}
              className={clsx(
                "rounded-full px-3 py-1 text-[12px] border transition active:scale-95",
                myLike
                  ? "bg-rose-50 border-rose-300 text-rose-600"
                  : "bg-white border-gray-300 text-gray-700 hover:border-rose-300 hover:text-rose-600"
              )}
              aria-pressed={!!myLike}
            >
              {myLike ? "❤️ 좋아요 취소" : "🤍 좋아요"}
              <span className="ml-1.5 text-[11px] text-gray-500 tabular-nums">
                {likeCount}
              </span>
            </button>
            {feedback.likes.length > 0 && (
              <div className="text-[10px] text-gray-500 truncate text-right max-w-[55%]">
                {feedback.likes.slice(-3).map((l) => l.userName).join(", ")}
                {feedback.likes.length > 3 && " 외"}
              </div>
            )}
          </div>

          <PoiReviewSummarySection
            poi={poi}
            mergeUserCommentTexts={myNoteTextsForReview}
          />

          {/* Notes list + composer */}
          <PoiCommentsPanel
            poiId={poi.id}
            notes={feedback.notes}
            currentUserId={user?.id}
            onAdd={(text) => {
              if (!user) {
                alert("코멘트는 로그인 후 작성할 수 있어요.");
                return;
              }
              if (!clusterSaved) {
                alert(
                  "아직 저장되지 않은 즐겨찾기입니다. 먼저 즐겨찾기를 저장하면 코멘트가 공유됩니다."
                );
                return;
              }
              addClusterNote(poi.id, text);
            }}
            onEdit={(noteId, text) => editClusterNote(poi.id, noteId, text)}
            onDelete={(noteId) => deleteClusterNote(poi.id, noteId)}
            ownerCanDelete={!viewOnly}
          />

          {/* 출발/도착 → (소유자) 즐겨찾기에서 제거 → 다른 즐겨찾기 추가 */}
          <div className="pt-2 border-t border-gray-100/90">
            <PoiPrimaryActions
              poi={poi}
              variant="clusterDetail"
              addToClusterLabel={
                viewOnly ? "즐겨찾기에 추가" : "다른 즐겨찾기에 추가"
              }
              onRemoveFromCluster={
                !viewOnly ? () => removePoi(poi.id) : undefined
              }
            />
          </div>

          {/* 전체 메타데이터 — 상세 페이지와 동일 블록 */}
          <div className="pt-2 border-t border-gray-100/90">
            <div className="text-[11px] font-semibold text-tmap-muted mb-1.5">
              상세 정보
            </div>
            <PoiDetails poi={poi} />
          </div>
        </div>
      )}
    </li>
  );
}
