import { useStore } from "@/store/useStore";
import { Button } from "@/components/UI/Button";
import { recordRecentDestination } from "@/lib/recentDestinations";
import type { POI } from "@/types";

interface Props {
  poi: POI;
  /**
   * `default`: 2×2 grid (POI 상세) — 출발/도착 + 즐겨찾기에 추가.
   * `clusterDetail`: 출발/도착 한 줄 → (선택) 제거 → 다른 즐겨찾기에 추가.
   */
  variant?: "default" | "clusterDetail";
  /** Fourth action label; default "+ 즐겨찾기에 추가" */
  addToClusterLabel?: string;
  /** Owner-only: below route row in cluster detail */
  onRemoveFromCluster?: () => void;
}

/**
 * 출발/도착/즐겨찾기에 추가 (+ 즐겨찾기 상세용 확장 레이아웃).
 */
export function PoiPrimaryActions({
  poi,
  variant = "default",
  addToClusterLabel,
  onRemoveFromCluster,
}: Props) {
  const openClusterPicker = useStore((s) => s.openClusterPicker);
  const setRouteStart = useStore((s) => s.setRouteStart);
  const setRouteEnd = useStore((s) => s.setRouteEnd);
  const setRouteMode = useStore((s) => s.setRouteMode);
  const routeStart = useStore((s) => s.routeStart);
  const routeEnd = useStore((s) => s.routeEnd);
  const isRouteStart = routeStart?.id === poi.id;
  const isRouteEnd = routeEnd?.id === poi.id;

  const onPickStart = () => {
    setRouteStart(poi);
    recordRecentDestination(poi);
    setRouteMode(true);
  };
  const onPickEnd = () => {
    setRouteEnd(poi);
    recordRecentDestination(poi);
    setRouteMode(true);
  };
  const onAddToCluster = () => {
    openClusterPicker(poi);
    recordRecentDestination(poi);
  };

  const clusterLabel = addToClusterLabel ?? "+ 즐겨찾기에 추가";

  const routeRow = (
    <div className="grid grid-cols-2 gap-1.5">
      <Button
        variant={isRouteStart ? "primary" : "secondary"}
        size="sm"
        onClick={onPickStart}
      >
        🟢 출발지로 선택
      </Button>
      <Button
        variant={isRouteEnd ? "primary" : "secondary"}
        size="sm"
        onClick={onPickEnd}
      >
        🔴 도착지로 선택
      </Button>
    </div>
  );

  const addClusterBtn = (
    <button
      type="button"
      onClick={onAddToCluster}
      className="w-full rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition active:scale-95 bg-white border-brand/40 text-brand hover:bg-brand-light/60 shadow-sm"
      title="어느 즐겨찾기에 추가할지 선택합니다"
    >
      {clusterLabel}
    </button>
  );

  if (variant === "clusterDetail") {
    return (
      <div className="space-y-1.5">
        {routeRow}
        {onRemoveFromCluster && (
          <button
            type="button"
            onClick={onRemoveFromCluster}
            className="w-full rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition active:scale-95 bg-white border-red-200/90 text-red-600 hover:bg-red-50 shadow-sm"
            title="이 목적지를 이 즐겨찾기에서 뺍니다"
          >
            즐겨찾기에서 제거
          </button>
        )}
        {addClusterBtn}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Button
        variant={isRouteStart ? "primary" : "secondary"}
        size="sm"
        onClick={onPickStart}
      >
        🟢 출발지로 선택
      </Button>
      <Button
        variant={isRouteEnd ? "primary" : "secondary"}
        size="sm"
        onClick={onPickEnd}
      >
        🔴 도착지로 선택
      </Button>
      <div className="col-span-2">{addClusterBtn}</div>
    </div>
  );
}
