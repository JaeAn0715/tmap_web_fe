import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/UI/Modal";
import { Button } from "@/components/UI/Button";
import { searchPois } from "@/lib/search";
import { useStore } from "@/store/useStore";
import {
  setSavedPlace,
  type SavedSlot,
  SAVED_PLACE_LABEL,
  SAVED_PLACE_EMOJI,
} from "@/lib/savedPlaces";
import type { POI } from "@/types";
import type { TmapMap } from "@/types/tmap";

interface Props {
  open: boolean;
  slot: SavedSlot | null;
  onClose: () => void;
  /** Called after a place is saved so the parent can re-read storage. */
  onSaved: () => void;
  map: TmapMap | null;
}

/**
 * Compact search-and-pick modal for setting "집" or "직장".
 *
 * The user types a keyword (with the current map view as the search bias),
 * picks a row, and we persist that POI under the slot's key. We intentionally
 * ignore TMAP's `searchType` parameter — the side-panel search bar removed
 * that dropdown and we keep parity here.
 */
export function SavedPlaceModal({ open, slot, onClose, onSaved, map }: Props) {
  const userLocation = useStore((s) => s.userLocation);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<POI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open / slot change so the previous query doesn't leak.
  useEffect(() => {
    if (open) {
      setKeyword("");
      setResults([]);
      setError(null);
      // focus input on next frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, slot]);

  const onSearch = async () => {
    const k = keyword.trim();
    if (!k) return;
    let centerLat = userLocation?.lat;
    let centerLng = userLocation?.lng;
    try {
      if (map) {
        const c = map.getCenter();
        centerLat = c.lat();
        centerLng = c.lng();
      }
    } catch {
      /* fall back to userLocation */
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchPois({
        keyword: k,
        centerLat,
        centerLng,
        count: 15,
      });
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!slot) return null;

  const onPick = (poi: POI) => {
    setSavedPlace(slot, poi);
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${SAVED_PLACE_EMOJI[slot]} ${SAVED_PLACE_LABEL[slot]} 주소 설정`}
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="space-y-2">
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSearch();
            }}
            placeholder={`${SAVED_PLACE_LABEL[slot]} 주소나 장소명`}
            className="flex-1 border rounded px-2 py-1.5 text-sm"
          />
          <Button variant="primary" onClick={() => void onSearch()} disabled={loading}>
            {loading ? "검색 중…" : "검색"}
          </Button>
        </div>

        {error && (
          <div className="text-[12px] text-red-600">{error}</div>
        )}

        {!loading && results.length === 0 && keyword && !error && (
          <div className="text-[12px] text-gray-500">
            검색 결과가 없습니다. 다른 키워드를 시도해 보세요.
          </div>
        )}

        {results.length > 0 && (
          <ul className="border rounded divide-y max-h-72 overflow-y-auto">
            {results.map((poi) => (
              <li
                key={poi.id}
                role="button"
                onClick={() => onPick(poi)}
                className="px-2.5 py-2 hover:bg-yellow-50 cursor-pointer"
              >
                <div className="text-sm font-medium truncate">{poi.name}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {poi.roadAddress || poi.address}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
