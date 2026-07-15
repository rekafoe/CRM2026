const SPREAD_PAGE_ID_PREFIX_RE = /^p(\d+):(.+)$/;

/** Уникальный id объекта на холсте разворота (шаблонные id повторяются на каждой странице). */
export function prefixSpreadPageFabricObjectIds(
  obj: Record<string, unknown>,
  pageIndex: number,
): void {
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (id && !SPREAD_PAGE_ID_PREFIX_RE.test(id)) {
    obj.id = `p${pageIndex}:${id}`;
  }
  const objects = obj.objects;
  if (!Array.isArray(objects)) return;
  for (const child of objects) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    prefixSpreadPageFabricObjectIds(child as Record<string, unknown>, pageIndex);
  }
}

/** Восстанавливает id страницы после split разворота → per-page JSON. */
export function restoreSpreadPageFabricObjectIds(obj: Record<string, unknown>): void {
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (id) {
    const match = id.match(SPREAD_PAGE_ID_PREFIX_RE);
    if (match) obj.id = match[2];
  }
  const objects = obj.objects;
  if (!Array.isArray(objects)) return;
  for (const child of objects) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    restoreSpreadPageFabricObjectIds(child as Record<string, unknown>);
  }
}
