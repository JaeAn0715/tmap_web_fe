import { useEffect, useMemo, useRef, useState } from "react";
import { PoiPhoto, PoiEmojiAvatar } from "@/components/UI/PoiPhoto";
import { PoiCommentsPanel } from "@/components/UI/PoiCommentsPanel";
import { PoiDetails } from "@/components/UI/PoiDetails";
import { PoiPrimaryActions } from "@/components/UI/PoiPrimaryActions";
import { PoiReviewSummarySection } from "@/components/UI/PoiReviewSummarySection";
import { apiMode } from "@/lib/apiConfig";
import { flyToPoi } from "@/lib/mapAnimate";
import {
  addPersonalPoiComment,
  deletePersonalPoiComment,
  editPersonalPoiComment,
  getPersonalPoiComments,
  loadPersonalPoiCommentsFromApi,
  subscribePersonalPoiComments,
} from "@/lib/poiPersonalComments";
import { useStore } from "@/store/useStore";
import type { POI } from "@/types";
import type { TmapMap, Tmapv2Namespace } from "@/types/tmap";

interface Props {
  poi: POI;
  map: TmapMap | null;
  Tmapv2: Tmapv2Namespace | null;
}

/**
 * Side-panel destination detail screen. Pushed onto `panelStack` when the
 * user picks a row in:
 *   - "검색 결과"
 *   - "추천 목적지"
 *   - 즐겨찾기 상세의 목적지 행
 *
 * Renders primary action buttons (출발지로 / 도착지로 / 즐겨찾기에 추가),
 * AI 장소 리뷰 요약, **개인 코멘트**(즐겨찾기 공유 코멘트와 별도 저장), and the full
 * TMAP detail block (`<PoiDetails>` — address, phone, building, EV, parking, raw…).
 *
 * The unified back button lives in the parent `SidePanel` header and pops
 * the stack — so this component is intentionally header-less.
 */
export function PoiDetailView({ poi, map, Tmapv2 }: Props) {
  const user = useStore((s) => s.user);
  const [personalNotesTick, setPersonalNotesTick] = useState(0);

  useEffect(() => {
    return subscribePersonalPoiComments(() =>
      setPersonalNotesTick((t) => t + 1)
    );
  }, []);

  useEffect(() => {
    if (!user || !apiMode()) return;
    void loadPersonalPoiCommentsFromApi(user.id, poi.id);
  }, [user?.id, poi.id]);

  const personalNotes = useMemo(
    () => (user ? getPersonalPoiComments(user.id, poi.id) : []),
    [user, poi.id, personalNotesTick]
  );

  const personalMergeTexts = useMemo(
    () =>
      personalNotes
        .map((n) => n.text ?? "")
        .filter((t) => {
          const s = t.trim();
          return s.length > 0 && s !== "(이미지)";
        }),
    [personalNotes]
  );

  /* Snapshot of the camera as it was *before* the user opened this detail
   * screen. Captured exactly once on first mount so the unmount-only
   * restore effect below can fly the user back to whatever they were
   * looking at — typically the recommendations list's wider view (per
   * spec: "추천목적지 리스트 뷰에서 poi상세페이지로 이동했다가 뒤로가기를
   * 누르면 원래 줌 레벨/지도 위치로 돌아간다"). */
  const cameraSnapRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  /* The unmount-restore effect needs the latest map/Tmapv2 references but
   * uses `[]` deps (so it really only fires on unmount). Refs bridge that
   * — we mirror the props into refs whenever they change, then read from
   * the refs inside the cleanup. */
  const mapRef = useRef(map);
  const tmapRef = useRef(Tmapv2);
  useEffect(() => {
    mapRef.current = map;
    tmapRef.current = Tmapv2;
  }, [map, Tmapv2]);

  /* On open, smoothly pan + zoom to the POI so the user has spatial context
   * for the detail they're reading. `flyToPoi` is a no-op when the camera is
   * already at the target (callers like `SearchResultsSection.onRowClick`
   * already animated us here, so this effect doesn't double-animate).
   * Cancellation prevents two open-in-a-row from racing.
   *
   * Camera snapshot is captured here too — but only on the *first* run.
   * Subsequent runs (poi.id changes inside an unbroken mount session)
   * keep the original snapshot, which is intentional: ← back should
   * restore whatever the user was looking at *before this screen ever
   * appeared*, not the position of the previously-viewed POI. */
  useEffect(() => {
    if (!map || !Tmapv2) return;
    if (cameraSnapRef.current === null) {
      try {
        const c = map.getCenter();
        cameraSnapRef.current = {
          lat: c.lat(),
          lng: c.lng(),
          zoom: map.getZoom(),
        };
      } catch {
        /* Map could not report its state — leave snap null; the unmount
         * cleanup will simply skip the restore. */
      }
    }
    const handle = flyToPoi(map, Tmapv2, poi.lat, poi.lng, { zoom: 17 });
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id, map, Tmapv2]);

  /* Unmount-only camera restore. Empty deps + cleanup-only body so this
   * fires exactly once when the detail screen leaves the tree (← back,
   * route mode toggled, cluster opened, …). The fly-back kicks off a
   * fire-and-forget animation; we don't wait for it because the React
   * tree has already moved on. */
  useEffect(() => {
    return () => {
      const snap = cameraSnapRef.current;
      const m = mapRef.current;
      const T = tmapRef.current;
      if (!snap || !m || !T) return;
      flyToPoi(m, T, snap.lat, snap.lng, { zoom: snap.zoom });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero: photo + name + address */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex gap-2.5">
          <PoiPhoto
            poi={poi}
            className="w-16 h-16 rounded shrink-0"
            fallback={<PoiEmojiAvatar poi={poi} className="w-16 h-16 text-2xl" />}
          />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-tight break-words">
              {poi.name}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 break-words">
              {poi.roadAddress || poi.address}
            </div>
            {poi.category && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                {poi.category}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action grid — the spec lists exactly these four primary actions. */}
      <div className="px-3 py-2.5 border-b border-gray-100/90">
        <PoiPrimaryActions poi={poi} />
      </div>

      <div className="px-3 py-2.5 border-b">
        <PoiReviewSummarySection
          poi={poi}
          mergeUserCommentTexts={personalMergeTexts}
        />
      </div>

      <div className="px-3 py-2.5 border-b border-gray-100/90">
        <PoiCommentsPanel
          poiId={poi.id}
          notes={personalNotes}
          currentUserId={user?.id}
          onAdd={async (text) => {
            if (!user) {
              alert("코멘트는 로그인 후 작성할 수 있어요.");
              return;
            }
            try {
              await addPersonalPoiComment(user.id, user.name, poi.id, text);
            } catch {
              alert("코멘트를 저장하지 못했습니다.");
            }
          }}
          onEdit={async (noteId, text) => {
            if (!user) return;
            try {
              await editPersonalPoiComment(user.id, poi.id, noteId, text);
            } catch {
              alert("코멘트를 수정하지 못했습니다.");
            }
          }}
          onDelete={async (noteId) => {
            if (!user) return;
            try {
              await deletePersonalPoiComment(user.id, poi.id, noteId);
            } catch {
              alert("코멘트를 삭제하지 못했습니다.");
            }
          }}
          ownerCanDelete={false}
        />
      </div>

      {/* Full TMAP details */}
      <div className="px-3 py-2.5">
        <div className="text-[11px] font-semibold text-gray-500 mb-1.5">
          상세 정보
        </div>
        <PoiDetails poi={poi} />
      </div>
    </div>
  );
}
