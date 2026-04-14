/**
 * Notebook glyph from IconApe (source SVG vendored at `src/assets/notebook-1.svg`).
 * Use this component so `className` / `text-*` controls color via `currentColor`.
 */
export function NotebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M388.3,456H123.4c-4.6,0-8.3-3.7-8.3-8.3V381H97.6c-4.6,0-8.3-3.7-8.3-8.3c0-4.6,3.7-8.3,8.3-8.3h17.5v-66.7 H97.6c-4.6,0-8.3-3.7-8.3-8.3c0-4.6,3.7-8.3,8.3-8.3h17.5v-58.3H97.6c-4.6,0-8.3-3.7-8.3-8.3c0-4.6,3.7-8.3,8.3-8.3h17.5v-66.7H98.5 c-4.6,0-8.3-3.7-8.3-8.3c0-4.6,3.7-8.3,8.3-8.3h16.6V64.3c0-4.6,3.7-8.3,8.3-8.3h264.9c18.9,0,34.4,15.2,34.4,33.9v332.2 C422.7,440.8,407.3,456,388.3,456z M356.2,72.7H131v50h17.3c4.6,0,8.3,3.7,8.3,8.3c0,4.6-3.7,8.3-8.3,8.3H131V206h16.5 c4.6,0,8.3,3.7,8.3,8.3c0,4.6-3.7,8.3-8.3,8.3H131V281h16.5c4.6,0,8.3,3.7,8.3,8.3c0,4.6-3.7,8.3-8.3,8.3H131v66.7h16.5 c4.6,0,8.3,3.7,8.3,8.3c0,4.6-3.7,8.3-8.3,8.3H131v58.3h225.1V72.7z M406.1,89.9c0-9.5-8-17.2-17.7-17.2h-15.5v366.7h15.5 c9.8,0,17.7-7.7,17.7-17.2V89.9z"
      />
    </svg>
  );
}
