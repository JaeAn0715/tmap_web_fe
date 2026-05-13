import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Overlay root. Default `fixed inset-0` (viewport). Use `absolute inset-0` when rendered inside a positioned map container. */
  overlayClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 420,
  overlayClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4",
}: Props) {
  if (!open) return null;
  return (
    <div
      className={overlayClassName}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-4 py-3 border-b text-sm font-semibold">{title}</div>
        )}
        <div className="p-4 text-sm text-gray-700">{children}</div>
        {footer && <div className="px-4 py-3 border-t flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
