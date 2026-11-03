const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

export function isHeicMime(mime: string): boolean {
  const normalized = mime.split(';')[0]?.trim().toLowerCase() || '';
  return (
    normalized === 'image/heic' ||
    normalized === 'image/heif' ||
    normalized === 'image/heic-sequence' ||
    normalized === 'image/heif-sequence'
  );
}

export function isHeicFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif');
}

export function isHeicLikeRaster(bytes: Uint8Array, mime: string): boolean {
  if (isHeicMime(mime)) return true;

  if (bytes.length < 12) return false;
  const boxType = String.fromCharCode(...bytes.slice(4, 8));
  if (boxType !== 'ftyp') return false;

  const brands: string[] = [];
  for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    brands.push(String.fromCharCode(...bytes.slice(offset, offset + 4)).toLowerCase());
  }
  return brands.some((brand) => HEIC_BRANDS.has(brand));
}
