import { PoiPhoto, PoiEmojiAvatar } from "@/components/UI/PoiPhoto";
import { AddToClusterButton } from "./AddToClusterButton";
import type { POI } from "@/types";

interface Props {
  poi: POI;
  /**
   * Pre-resolved photo URL passed by the parent. The parent
   * `RecommendationsSection` batches photo fetch when the list resolves.
   *
   * `null` means no photo — we fall back to a category emoji avatar.
   */
  photoUrl: string | null;
  onPickRow: () => void;
  onAdd: () => void;
}

/**
 * One row in "추천 목적지".
 *
 * Row body click → `onPickRow`; right-side `+` → `onAdd` (cluster picker).
 */
export function RecommendationItem({
  poi,
  photoUrl,
  onPickRow,
  onAdd,
}: Props) {
  return (
    <li
      role="button"
      aria-label={`${poi.name} 보기`}
      onClick={onPickRow}
      className="p-2.5 flex gap-2 hover:bg-brand-light/50 cursor-pointer transition-colors"
    >
      <PoiPhoto
        poi={poi}
        initial={photoUrl}
        className="w-14 h-14 rounded shrink-0"
        fallback={<PoiEmojiAvatar poi={poi} className="w-14 h-14 text-2xl" />}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{poi.name}</div>
        <div className="text-[10px] text-gray-400 truncate mt-0.5">
          {poi.roadAddress || poi.address}
        </div>
      </div>
      <AddToClusterButton poi={poi} onAdd={onAdd} />
    </li>
  );
}
