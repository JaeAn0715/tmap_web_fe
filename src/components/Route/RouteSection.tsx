import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/UI/Button";
import { useStore } from "@/store/useStore";
import { searchPois } from "@/lib/search";
import { getSavedPlaces, type SavedSlot } from "@/lib/savedPlaces";
import {
  getRecentDestinations,
  recordRecentDestination,
  removeRecentDestination,
} from "@/lib/recentDestinations";
import { tmapDeepLink } from "@/lib/route";
import type { POI } from "@/types";
import type { TmapMap } from "@/types/tmap";
import { SavedPlaceModal } from "./SavedPlaceModal";
import { SavedPlaceShortcutsRow } from "./SavedPlaceShortcutsRow";

interface Props {
  map: TmapMap | null;
}

type Slot = "start" | "end";

/**
 * Side-panel "경로 모드". When the user hits 출발/도착 on a sticky note we
 * flip the side panel into this view. It lets them:
 *   - inspect / clear / swap the start & end POIs,
 *   - search for a place inline *inside* either slot (results pick straight
 *     into that slot — no separate search bar),
 *   - jump to saved 집/직장 places (with add UX when empty),
 *   - reuse the recent-destinations ring buffer.
 */
export function RouteSection({ map }: Props) {
  const routeStart = useStore((s) => s.routeStart);
  const routeEnd = useStore((s) => s.routeEnd);
  const setRouteStart = useStore((s) => s.setRouteStart);
  const setRouteEnd = useStore((s) => s.setRouteEnd);
  const swapRouteEndpoints = useStore((s) => s.swapRouteEndpoints);
  const routeActive = useStore((s) => s.routeActive);
  const setRouteActive = useStore((s) => s.setRouteActive);
  const exitRouteMode = useStore((s) => s.exitRouteMode);
  const user = useStore((s) => s.user);
  const openSavedPlaceRoutePick = useStore((s) => s.openSavedPlaceRoutePick);

  const [savedPlaces, setSavedPlacesState] = useState(() => getSavedPlaces());
  const [recents, setRecents] = useState(() => getRecentDestinations(10));

  const [editingSlot, setEditingSlot] = useState<SavedSlot | null>(null);

  /* Refresh saved-places + recents whenever endpoints change (the picker
     handlers also feed the recent-destinations buffer). */
  useEffect(() => {
    setSavedPlacesState(getSavedPlaces());
    setRecents(getRecentDestinations(10));
  }, [routeStart?.id, routeEnd?.id]);

  useEffect(() => {
    if (!user) setEditingSlot(null);
    else setSavedPlacesState(getSavedPlaces());
  }, [user]);

  const setSlot = (slot: Slot, poi: POI | null) => {
    if (slot === "start") setRouteStart(poi);
    else setRouteEnd(poi);
    if (poi) recordRecentDestination(poi);
    setRecents(getRecentDestinations(10));
  };

  /** 최근 목적지 목록: 빈 슬롯 우선 채우기 */
  const onPickAuto = (poi: POI) => {
    if (!routeStart) setSlot("start", poi);
    else if (!routeEnd) setSlot("end", poi);
    else setSlot("end", poi);
  };

  const canShowRoute = !!(routeStart && routeEnd);

  return (
    <section className="flex flex-col h-full">
      <header className="flex items-center justify-between px-3 py-2 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden>
            🚗
          </span>
          <h3 className="text-sm font-bold">경로 모드</h3>
        </div>
        <button
          onClick={exitRouteMode}
          className="text-gray-500 hover:text-gray-800 text-lg leading-none"
          aria-label="경로 모드 닫기"
          title="경로 모드 닫기"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {user && (
          <SavedPlaceShortcutsRow
            savedPlaces={savedPlaces}
            onFilledClick={(slot, poi) => openSavedPlaceRoutePick(poi, slot)}
            onEmptyClick={(slot) => setEditingSlot(slot)}
          />
        )}

        {/* Endpoints — each slot doubles as a search input when empty */}
        <div className="space-y-1.5">
          <EndpointSlot
            slot="start"
            label="출발"
            emoji="🟢"
            poi={routeStart}
            onPick={(p) => setSlot("start", p)}
            onClear={() => setSlot("start", null)}
            map={map}
          />
          <div className="flex justify-center">
            <button
              onClick={swapRouteEndpoints}
              disabled={!routeStart && !routeEnd}
              className="text-[11px] text-gray-500 hover:text-blue-600 disabled:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-100"
              title="출발/도착 바꾸기"
            >
              ⇅ 바꾸기
            </button>
          </div>
          <EndpointSlot
            slot="end"
            label="도착"
            emoji="🔴"
            poi={routeEnd}
            onPick={(p) => setSlot("end", p)}
            onClear={() => setSlot("end", null)}
            map={map}
          />
        </div>

        {/* CTA */}
        <div className="flex gap-1.5">
          <Button
            variant={routeActive ? "secondary" : "primary"}
            onClick={() => setRouteActive(!routeActive)}
            disabled={!canShowRoute}
            className="flex-1"
          >
            {routeActive ? "지도에서 경로 닫기" : "🚗 경로 보기"}
          </Button>
          {canShowRoute && routeEnd && (
            <a
              href={tmapDeepLink(routeEnd)}
              className="bg-brand text-white text-xs px-2.5 py-1.5 rounded hover:bg-brand-dark whitespace-nowrap flex items-center"
            >
              티맵 안내
            </a>
          )}
        </div>

        {/* Recent destinations */}
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 mb-1.5">
            최근 목적지
          </h4>
          {recents.length === 0 ? (
            <div className="text-[11px] text-gray-400 px-1">
              아직 최근 목적지가 없습니다. 출발/도착 입력칸에서 검색해 보세요.
            </div>
          ) : (
            <ul className="border rounded divide-y bg-white">
              {recents.map((poi) => (
                <li
                  key={poi.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-yellow-50"
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => onPickAuto(poi)}
                  >
                    <div className="text-sm truncate">{poi.name}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {poi.roadAddress || poi.address}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      removeRecentDestination(poi.id);
                      setRecents(getRecentDestinations(10));
                    }}
                    className="text-gray-300 hover:text-red-500 text-sm shrink-0 px-1"
                    aria-label={`${poi.name} 최근 목적지에서 제거`}
                    title="제거"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
    </section>
  );
}

/**
 * A single 출발/도착 slot. When `poi` is null we render an inline search
 * input + dropdown of POI results — picking a result fills *this slot*. When
 * filled we show the POI summary with a clear (×) button.
 */
function EndpointSlot({
  slot,
  label,
  emoji,
  poi,
  onPick,
  onClear,
  map,
}: {
  slot: Slot;
  label: string;
  emoji: string;
  poi: POI | null;
  onPick: (poi: POI) => void;
  onClear: () => void;
  map: TmapMap | null;
}) {
  const userLocation = useStore((s) => s.userLocation);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<POI[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Generation counter prevents stale responses (typed quickly) from
  // overwriting the latest results.
  const reqIdRef = useRef(0);

  /* Debounced search whenever the user types. */
  useEffect(() => {
    const k = keyword.trim();
    if (!k || poi) {
      setResults([]);
      setError(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setSearching(true);
    setError(null);

    let centerLat: number | undefined = userLocation?.lat;
    let centerLng: number | undefined = userLocation?.lng;
    try {
      if (map) {
        const c = map.getCenter();
        centerLat = c.lat();
        centerLng = c.lng();
      }
    } catch {
      /* fall back to userLocation */
    }

    const t = window.setTimeout(() => {
      void searchPois({ keyword: k, centerLat, centerLng, count: 10 })
        .then((res) => {
          if (myId !== reqIdRef.current) return;
          setResults(res);
        })
        .catch((e: unknown) => {
          if (myId !== reqIdRef.current) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (myId === reqIdRef.current) setSearching(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(t);
    };
  }, [keyword, poi, map, userLocation?.lat, userLocation?.lng]);

  if (poi) {
    return (
      <div className="border rounded-lg px-2.5 py-2 flex items-center gap-2 bg-white border-gray-200">
        <span className="text-base shrink-0" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-gray-500">{label}</div>
          <div className="text-sm font-medium truncate">{poi.name}</div>
          <div className="text-[11px] text-gray-500 truncate">
            {poi.roadAddress || poi.address}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-gray-400 hover:text-red-500 text-base leading-none shrink-0 px-1"
          aria-label={`${label} 비우기`}
          title="비우기"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "border rounded-lg px-2.5 py-2 bg-gray-50 border-dashed border-gray-300",
        results.length > 0 && "rounded-b-none border-b-0"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-base shrink-0" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-gray-500">{label}</div>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={
              slot === "start" ? "출발지 검색…" : "도착지 검색…"
            }
            className="w-full bg-transparent border-0 outline-none text-sm py-0.5"
          />
        </div>
        {searching && (
          <span className="text-[10px] text-gray-400 shrink-0">검색 중…</span>
        )}
      </div>
      {error && (
        <div className="mt-1 text-[11px] text-red-600">{error}</div>
      )}
      {results.length > 0 && (
        <ul className="-mx-2.5 -mb-2 mt-2 border-t bg-white max-h-64 overflow-y-auto rounded-b-lg">
          {results.map((p) => (
            <li
              key={p.id}
              role="button"
              className="px-2.5 py-1.5 hover:bg-yellow-50 cursor-pointer border-b last:border-b-0"
              onClick={() => {
                onPick(p);
                setKeyword("");
                setResults([]);
              }}
            >
              <div className="text-sm truncate">{p.name}</div>
              <div className="text-[11px] text-gray-500 truncate">
                {p.roadAddress || p.address}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Helper for callers (e.g. SearchResultsSection / RecommendationsSection) to
 *  feed the recent-destinations buffer when the user picks a place. */
export { recordRecentDestination };
