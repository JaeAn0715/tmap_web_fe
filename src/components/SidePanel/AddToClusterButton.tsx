import type { POI } from "@/types";

interface Props {
  poi: POI;
  /** Click handler. The parent decides what "add" means in its own context:
   *    - Recommendations / main search → open the cluster picker modal
   *      (`openClusterPicker(poi)`).
   *    - Cluster-detail's inline search → add directly to that cluster
   *      (`addPoiToCurrentCluster(poi)`). */
  onAdd: (poi: POI) => void;
  /** Hide the button entirely, e.g. when the surrounding context doesn't
   *  allow editing (a viewer of a shared cluster). */
  hidden?: boolean;
}

/**
 * Right-aligned circular `+` icon used by every list surface that exposes
 * "add this POI to a cluster" — search results, recommendations, etc.
 *
 * The button intentionally **does not** flip to a `✓` after the click. The
 * underlying add operation is idempotent (cluster membership is keyed by
 * `POI.id` and the picker shows already-added clusters as disabled), so a
 * sticky "added" affordance gives no extra information and confuses the
 * user when they want to add the same POI to a *second* cluster (via the
 * picker). The button stays clickable indefinitely.
 *
 * Stops click propagation so the surrounding row's own click handler (which
 * opens the POI detail view) does NOT fire on top of the add action.
 */
export function AddToClusterButton({ poi, onAdd, hidden }: Props) {
  if (hidden) return null;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAdd(poi);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="즐겨찾기에 추가"
      title="즐겨찾기에 추가"
      className="shrink-0 self-center w-8 h-8 rounded-full border flex items-center justify-center text-lg leading-none transition bg-white border-blue-400 text-blue-600 hover:bg-blue-50 active:scale-95"
    >
      +
    </button>
  );
}
