import { type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

type SnackbarProps = {
  children: ReactNode;
  open: boolean;
  onClose?: () => void;
};

/**
 * Fixed bottom toast for short messages (e.g. share/copy fallbacks).
 * Sits above typical mobile UI; z-index above header picker panels.
 */
export function Snackbar({ open, children, onClose }: SnackbarProps) {
  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-4"
    >
      <div
        className="pointer-events-auto flex w-full max-w-lg items-center gap-2 rounded-lg border border-[#1478b8] bg-[#1583ca] px-3 py-2 text-sm text-white shadow-lg"
        onClick={onClose}
      >
        <div className="min-w-0 flex-1 whitespace-pre-wrap text-center">{children}</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-white/95 hover:text-white active:text-white/80"
          aria-label="Close message"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
