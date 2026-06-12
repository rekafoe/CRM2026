type FabricJsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is FabricJsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasBlobUrl(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('blob:');
  if (Array.isArray(value)) return value.some(hasBlobUrl);
  if (!isRecord(value)) return false;
  return Object.values(value).some(hasBlobUrl);
}
