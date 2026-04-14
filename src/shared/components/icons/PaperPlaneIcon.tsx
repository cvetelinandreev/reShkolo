import { twMerge } from "tailwind-merge";

export function PaperPlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={twMerge("block shrink-0", className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Filled silhouette reads solid on blue (stroke looked faint). */}
      <path d="M3.478 2.404a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.56.75.75 0 0 0 0-1.287A60.517 60.517 0 0 0 3.478 2.404Z" />
    </svg>
  );
}
