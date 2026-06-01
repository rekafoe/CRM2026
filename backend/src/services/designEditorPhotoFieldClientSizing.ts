/** Размер нового клиентского поля для фото: 30% ширины страницы, высота по aspect. */

export const CLIENT_PHOTO_FIELD_WIDTH_FRACTION = 0.3;

const MIN_FIELD_PX = 32;

export function resolvePhotoFieldSizeForPage(opts: {
  aspectW: number;
  aspectH: number;
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
}): { width: number; height: number } {
  const safeW = Math.max(1, opts.pageWidthPx - opts.safeZonePx * 2);
  const safeH = Math.max(1, opts.pageHeightPx - opts.safeZonePx * 2);
  const aw = Math.max(1, opts.aspectW);
  const ah = Math.max(1, opts.aspectH);

  let width = Math.max(MIN_FIELD_PX, Math.round(opts.pageWidthPx * CLIENT_PHOTO_FIELD_WIDTH_FRACTION));
  let height = Math.max(MIN_FIELD_PX, Math.round((width * ah) / aw));

  if (width > safeW || height > safeH) {
    const scale = Math.min(safeW / width, safeH / height, 1);
    width = Math.max(MIN_FIELD_PX, Math.round(width * scale));
    height = Math.max(MIN_FIELD_PX, Math.round(height * scale));
  }

  return { width, height };
}
