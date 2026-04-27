import type { PhotoBatchSizeOption } from './photoBatchTypes';

export const DEFAULT_PHOTO_BATCH_SIZES: PhotoBatchSizeOption[] = [
  { id: '10x15', label: '10×15', widthMm: 100, heightMm: 150 },
  { id: '15x20', label: '15×20', widthMm: 150, heightMm: 200 },
  { id: '20x30', label: '20×30', widthMm: 200, heightMm: 300 },
];

export function getPhotoBatchSizeById(
  sizes: PhotoBatchSizeOption[],
  sizeId: string,
): PhotoBatchSizeOption {
  return sizes.find((size) => size.id === sizeId) ?? sizes[0];
}

export function normalizePhotoBatchSizes(rawSizes: unknown): PhotoBatchSizeOption[] {
  if (!Array.isArray(rawSizes)) return [];
  return rawSizes
    .map((size, index) => {
      if (!size || typeof size !== 'object') return null;
      const item = size as Record<string, unknown>;
      const widthMm = Number(item.width_mm ?? item.widthMm);
      const heightMm = Number(item.height_mm ?? item.heightMm);
      if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
        return null;
      }
      const id = String(item.id ?? `${widthMm}x${heightMm}`);
      const label = String(item.label ?? item.name ?? `${widthMm}×${heightMm}`);
      return { id, label, widthMm, heightMm, sort: Number(item.sort_order ?? index) };
    })
    .filter((size): size is PhotoBatchSizeOption & { sort: number } => Boolean(size))
    .sort((a, b) => a.sort - b.sort)
    .map(({ sort: _sort, ...size }) => size);
}

export function extractPhotoBatchSizesFromSchema(schema: unknown, selectedTypeId?: string | null): PhotoBatchSizeOption[] {
  const root = schema && typeof schema === 'object' ? schema as Record<string, unknown> : {};
  const template = root.template && typeof root.template === 'object' ? root.template as Record<string, unknown> : root;
  const simplified = template.simplified && typeof template.simplified === 'object'
    ? template.simplified as Record<string, unknown>
    : null;
  if (!simplified) return [];

  const typeConfigs = simplified.typeConfigs && typeof simplified.typeConfigs === 'object'
    ? simplified.typeConfigs as Record<string, { sizes?: unknown }>
    : null;

  if (selectedTypeId && typeConfigs?.[selectedTypeId]) {
    const typedSizes = normalizePhotoBatchSizes(typeConfigs[selectedTypeId].sizes);
    if (typedSizes.length > 0) return typedSizes;
  }

  const firstTypeConfig = typeConfigs
    ? Object.values(typeConfigs).find((config) => normalizePhotoBatchSizes(config.sizes).length > 0)
    : null;
  if (firstTypeConfig) {
    const typedSizes = normalizePhotoBatchSizes(firstTypeConfig.sizes);
    if (typedSizes.length > 0) return typedSizes;
  }

  return normalizePhotoBatchSizes(simplified.sizes);
}
