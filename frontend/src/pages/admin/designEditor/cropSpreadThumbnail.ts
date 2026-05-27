function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось декодировать миниатюру разворота'));
    img.src = src;
  });
}

/** Делит превью объединённого разворота на левую и правую половины для полосы страниц. */
export async function cropSpreadThumbnail(mergedDataUrl: string): Promise<{ left: string; right: string }> {
  const img = await loadImage(mergedDataUrl);
  const half = Math.max(1, Math.floor(img.width / 2));

  const cropHalf = (sx: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = half;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return mergedDataUrl;
    ctx.drawImage(img, sx, 0, half, img.height, 0, 0, half, img.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  };

  return {
    left: cropHalf(0),
    right: cropHalf(half),
  };
}
