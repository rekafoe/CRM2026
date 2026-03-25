/** Расширения изображений (когда браузер не выставил MIME, часто на Windows) */
export const IMAGE_FILENAME_EXT_RE =
  /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg|tiff?|jfif)$/i;

/**
 * Считает файл изображением по MIME или по расширению имени.
 * Учитывает application/octet-stream + .jpg и пустой type (типично для Windows).
 */
export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  if (IMAGE_FILENAME_EXT_RE.test(file.name)) {
    if (!file.type || file.type === 'application/octet-stream') return true;
  }
  return false;
}

/**
 * Отбор файлов для галереи редактора.
 * trustOsPicker: файлы из системного диалога с accept="image/*" — браузер уже ограничил тип;
 * если MIME/расширение «сломаны» (часто на Windows), последний шаг принимает непустые файлы.
 */
export function filterLikelyImageFiles(files: File[], opts?: { trustOsPicker?: boolean }): File[] {
  const trustOsPicker = opts?.trustOsPicker ?? false;
  let images = files.filter((f) => isLikelyImageFile(f));
  if (images.length === 0 && files.length > 0) {
    images = files.filter((f) => f.size > 0 && IMAGE_FILENAME_EXT_RE.test(f.name));
  }
  if (images.length === 0 && files.length > 0 && trustOsPicker) {
    images = files.filter((f) => f.size > 0);
  }
  return images;
}

/**
 * Строка похожа на http(s) URL (для drop / вставки ссылки).
 */
export function looksLikeHttpUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\//i.test(t);
}
