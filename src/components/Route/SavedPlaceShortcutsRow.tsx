import clsx from "clsx";
import type { POI } from "@/types";
import {
  SAVED_PLACE_EMOJI,
  SAVED_PLACE_LABEL,
  type SavedSlot,
} from "@/lib/savedPlaces";

export interface SavedPlacesSnapshot {
  home: POI | null;
  work: POI | null;
}

interface Props {
  savedPlaces: SavedPlacesSnapshot;
  /** Filled chip — primary action (e.g. pick for route, focus on map). */
  onFilledClick: (slot: SavedSlot, poi: POI) => void;
  /** Empty chip — open search + pick (modal). */
  onEmptyClick: (slot: SavedSlot) => void;
  className?: string;
}

const SLOTS: SavedSlot[] = ["home", "work"];

/**
 * 집 / 직장 — compact chip row. 비었을 때만 「집 등록」 등; 등록 후에는 「집」「직장」만 표시.
 */
export function SavedPlaceShortcutsRow({
  savedPlaces,
  onFilledClick,
  onEmptyClick,
  className,
}: Props) {
  return (
    <div
      className={clsx("flex flex-wrap items-center gap-1.5", className)}
      role="group"
      aria-label="집·직장 바로가기"
    >
      {SLOTS.map((slot) => {
        const poi = savedPlaces[slot];
        const filled = !!poi;
        return (
          <button
            key={slot}
            type="button"
            onClick={() =>
              filled && poi ? onFilledClick(slot, poi) : onEmptyClick(slot)
            }
            className={clsx(
              "inline-flex items-center gap-1 shrink-0 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium border transition",
              filled
                ? "bg-white border-gray-200 text-gray-800 hover:border-blue-400"
                : "bg-gray-50 border-dashed border-gray-300 text-gray-600 hover:border-blue-400"
            )}
            aria-label={
              filled && poi
                ? `${SAVED_PLACE_LABEL[slot]}: ${poi.name}`
                : `${SAVED_PLACE_LABEL[slot]} 주소 검색·등록`
            }
          >
            <span aria-hidden className="shrink-0">
              {SAVED_PLACE_EMOJI[slot]}
            </span>
            <span>{filled ? SAVED_PLACE_LABEL[slot] : `${SAVED_PLACE_LABEL[slot]} 등록`}</span>
          </button>
        );
      })}
    </div>
  );
}
