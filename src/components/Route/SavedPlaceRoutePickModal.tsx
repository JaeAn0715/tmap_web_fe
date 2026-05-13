import { Modal } from "@/components/UI/Modal";
import { Button } from "@/components/UI/Button";
import { useStore } from "@/store/useStore";
import { SAVED_PLACE_LABEL } from "@/lib/savedPlaces";

/**
 * 집/직장 칩에서 연 출발·도착 선택. 확인 시 경로 모드로 전환된다.
 */
export function SavedPlaceRoutePickModal() {
  const ctx = useStore((s) => s.savedPlaceRoutePick);
  const close = useStore((s) => s.closeSavedPlaceRoutePick);
  const confirm = useStore((s) => s.confirmSavedPlaceRoute);

  if (!ctx) return null;

  const kindLabel = SAVED_PLACE_LABEL[ctx.slot];
  const lineAddr = ctx.poi.roadAddress || ctx.poi.address;

  return (
    <Modal
      open
      onClose={close}
      width={340}
      overlayClassName="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <div id="saved-place-route-head" className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-500 mb-0.5">
              {kindLabel}
            </div>
            <div className="text-sm font-medium text-gray-900 break-words leading-snug">
              {ctx.poi.name}
            </div>
            {lineAddr && (
              <div className="text-[11px] text-gray-500 mt-1 break-words leading-snug">
                {lineAddr}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-xl leading-none mt-0.5"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div
          className="flex gap-2 justify-center"
          role="group"
          aria-labelledby="saved-place-route-head"
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-w-[4.5rem]"
            onClick={() => confirm("start")}
          >
            출발
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="min-w-[4.5rem]"
            onClick={() => confirm("end")}
          >
            도착
          </Button>
        </div>
      </div>
    </Modal>
  );
}
