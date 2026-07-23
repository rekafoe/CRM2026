import { isIosSafariCanvasSafeMode } from './iosSafariCanvasSafeMode';
import {
  MOBILE_EDITOR_JPEG_QUALITY,
  MOBILE_EDITOR_MAX_PHOTO_PIXELS,
  MOBILE_EDITOR_MAX_PHOTO_SIDE,
} from './mobileEditorPixelBudget';

function resolveTargetSize(width: number, height: number): { width: number; height: number } | null {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const bySide = Math.min(1, MOBILE_EDITOR_MAX_PHOTO_SIDE / Math.max(safeWidth, safeHeight));
  const byPixels = Math.min(1, Math.sqrt(MOBILE_EDITOR_MAX_PHOTO_PIXELS / (safeWidth * safeHeight)));
  const scale = Math.min(bySide, byPixels);
  if (scale >= 0.999) return null;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function fileNameAsJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'photo';
  return `${base}-editor.jpg`;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', MOBILE_EDITOR_JPEG_QUALITY);
  });
}

async function resizeBitmapToJpegFile(
  source: ImageBitmap | HTMLImageElement,
  fileName: string,
): Promise<File | null> {
  const width = 'naturalWidth' in source
    ? (source.naturalWidth || source.width)
    : source.width;
  const height = 'naturalHeight' in source
    ? (source.naturalHeight || source.height)
    : source.height;
  const target = resolveTargetSize(width, height);
  if (!target) return null;
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, target.width, target.height);
  const blob = await canvasToJpegBlob(canvas);
  if (!blob) return null;
  return new File([blob], fileNameAsJpeg(fileName), { type: 'image/jpeg' });
}

async function resizeWithImageBitmap(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    return await resizeBitmapToJpegFile(bitmap, file.name);
  } finally {
    bitmap.close();
  }
}

async function resizeWithHtmlImage(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Не удалось подготовить фото для редактора'));
      el.src = url;
    });
    return await resizeBitmapToJpegFile(img, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImageFileForCanvasSafeMode(file: File): Promise<File> {
  if (!isIosSafariCanvasSafeMode()) return file;
  if (!file.type.startsWith('image/')) return file;
  try {
    return await resizeWithImageBitmap(file)
      ?? await resizeWithHtmlImage(file)
      ?? file;
  } catch {
    return file;
  }
}

/**
 * Даунскейл remote/library URL до edit-preview.
 * Возвращает blob: URL или исходный url, если ужимать не нужно.
 */
export async function prepareImageUrlForCanvasSafeMode(url: string): Promise<{
  canvasUrl: string;
  revokeUrl?: string;
}> {
  if (!isIosSafariCanvasSafeMode() || !url) {
    return { canvasUrl: url };
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = url;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!resolveTargetSize(width, height)) {
      return { canvasUrl: url };
    }
    const file = await resizeBitmapToJpegFile(img, 'library-preview.jpg');
    if (!file) return { canvasUrl: url };
    const revokeUrl = URL.createObjectURL(file);
    return { canvasUrl: revokeUrl, revokeUrl };
  } catch {
    return { canvasUrl: url };
  }
}
