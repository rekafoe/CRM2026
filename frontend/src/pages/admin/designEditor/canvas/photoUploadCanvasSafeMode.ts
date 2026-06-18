import { isIosSafariCanvasSafeMode } from './iosSafariCanvasSafeMode';

const IOS_SAFARI_MAX_PHOTO_SIDE = 2200;
const IOS_SAFARI_MAX_PHOTO_PIXELS = 4_500_000;
const IOS_SAFARI_JPEG_QUALITY = 0.86;

function resolveTargetSize(width: number, height: number): { width: number; height: number } | null {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const bySide = Math.min(1, IOS_SAFARI_MAX_PHOTO_SIDE / Math.max(safeWidth, safeHeight));
  const byPixels = Math.min(1, Math.sqrt(IOS_SAFARI_MAX_PHOTO_PIXELS / (safeWidth * safeHeight)));
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
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', IOS_SAFARI_JPEG_QUALITY);
  });
}

async function resizeWithImageBitmap(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(file);
  try {
    const target = resolveTargetSize(bitmap.width, bitmap.height);
    if (!target) return null;
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await canvasToJpegBlob(canvas);
    if (!blob) return null;
    return new File([blob], fileNameAsJpeg(file.name), { type: 'image/jpeg' });
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
    const target = resolveTargetSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!target) return null;
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, target.width, target.height);
    const blob = await canvasToJpegBlob(canvas);
    if (!blob) return null;
    return new File([blob], fileNameAsJpeg(file.name), { type: 'image/jpeg' });
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
