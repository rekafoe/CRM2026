/**
 * Нормализация ссылок на ассеты canvas в CRM.
 * В отличие от сайта, CRM отдаёт uploads и draft-файлы со своего origin,
 * поэтому URL не требуется переписывать на BFF-прокси.
 */
export function resolveCrmEditorAssetUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('blob:')
    || trimmed.startsWith('data:')
    || trimmed.startsWith('/')
    || trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return null;
}

function rewriteFabricAssetRecord(record: Record<string, unknown>): void {
  if (typeof record.src === 'string') {
    const resolved = resolveCrmEditorAssetUrl(record.src);
    if (resolved) record.src = resolved;
  }
  if (record.backgroundImage && typeof record.backgroundImage === 'object' && !Array.isArray(record.backgroundImage)) {
    rewriteFabricAssetRecord(record.backgroundImage as Record<string, unknown>);
  }
  if (Array.isArray(record.objects)) {
    for (const nested of record.objects) {
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
      rewriteFabricAssetRecord(nested as Record<string, unknown>);
    }
  }
}

/** Переписывает URL image-объектов Fabric перед deserialization. */
export function rewriteFabricJsonAssetUrls<T>(fabricJson: T): T {
  if (!fabricJson || typeof fabricJson !== 'object') return fabricJson;
  const clone = JSON.parse(JSON.stringify(fabricJson)) as Record<string, unknown>;
  rewriteFabricAssetRecord(clone);
  return clone as T;
}
