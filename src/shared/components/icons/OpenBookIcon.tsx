/**
 * Raster open-book glyph (source: pngfind.com/m/png/TbRmxm — personal use).
 */
import openBookImg from "../../../assets/open-book-comments.webp";

export function OpenBookIcon({ className }: { className?: string }) {
  return (
    <img
      src={openBookImg}
      alt=""
      decoding="async"
      className={className}
      aria-hidden
    />
  );
}
