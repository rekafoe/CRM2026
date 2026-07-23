/** Детект декора (лого, орнамент) — не участвует в авторасстановке фото. */

function baseObjectId(id: unknown): string {
  const raw = String(id ?? '').trim().toLowerCase();
  const spread = raw.match(/^p\d+:(.+)$/);
  return (spread?.[1] ?? raw).trim();
}

/** Fabric-объект или сериализованный JSON. */
export function isDecorElementLike(obj: {
  isDecorElement?: unknown;
  id?: unknown;
} | null | undefined): boolean {
  if (!obj) return false;
  if (obj.isDecorElement === true) return true;
  return baseObjectId(obj.id).startsWith('decor_');
}

/** Настоящее фото-поле: isPhotoField и не декор (даже если флаги перепутаны). */
export function isEligiblePhotoFieldLike(obj: {
  isPhotoField?: unknown;
  isDecorElement?: unknown;
  id?: unknown;
} | null | undefined): boolean {
  if (!obj || obj.isPhotoField !== true) return false;
  return !isDecorElementLike(obj);
}
