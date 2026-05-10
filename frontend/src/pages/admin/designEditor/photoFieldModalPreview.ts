import type { FabricImage } from 'fabric';

/**
 * Превью для модалки кадрирования: после revoke blob:-URL второй <img> по тому же src не грузится.
 * Копируем bitmap с уже загруженного элемента Fabric в data:-URL (тот же кадр, что на холсте).
 */
export function fabricImageToModalPreviewDataUrl(img: FabricImage): string | null {
  const el = img.getElement?.() as HTMLImageElement | undefined;
  if (!el?.complete || el.naturalWidth < 1 || el.naturalHeight < 1) return null;
  try {
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function resolvePhotoFieldModalPreviewUrl(img: FabricImage, fallbackSrc: string): string {
  const data = fabricImageToModalPreviewDataUrl(img);
  if (data) return data;
  return fallbackSrc;
}
