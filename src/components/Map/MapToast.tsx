import { useEffect } from "react";
import { useStore } from "@/store/useStore";

/**
 * Centered notice over the **map** `<main>` (parent must be `relative`).
 * Auto-dismisses after a few seconds.
 */
export function MapToast() {
  const mapToast = useStore((s) => s.mapToast);
  const dismissMapToast = useStore((s) => s.dismissMapToast);

  useEffect(() => {
    if (!mapToast) return;
    const t = window.setTimeout(() => dismissMapToast(), 2600);
    return () => window.clearTimeout(t);
  }, [mapToast, dismissMapToast]);

  if (!mapToast) return null;

  return (
    <div
      className="absolute inset-0 z-[55] flex items-center justify-center pointer-events-none p-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto bg-white rounded-2xl shadow-float border border-gray-200/80 px-5 py-3.5 text-sm text-tmap-ink font-medium max-w-sm text-center">
        {mapToast}
      </div>
    </div>
  );
}
