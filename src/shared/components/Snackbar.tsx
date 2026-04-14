import { type ReactNode } from "react";

type SnackbarProps = {
  children: ReactNode;
  open: boolean;
};

/**
 * Fixed bottom toast for short messages (e.g. share/copy fallbacks).
 * Sits above typical mobile UI; z-index above header picker panels.
 */
export function Snackbar({ open, children }: SnackbarProps) {
  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
    >
      <div className="pointer-events-auto max-w-lg rounded-lg border border-neutral-200 bg-white px-4 py-3 text-center text-sm text-neutral-900 shadow-lg">
        {children}
      </div>
    </div>
  );
}
