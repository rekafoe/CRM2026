function text(value: unknown): string {
  return String(value ?? '').trim();
}

/** «Матовая, 30 мк» из листа дерева вариантов. Тип можно взять у родителя. */
export function finishingServiceCaption(
  params: Record<string, unknown> | undefined,
  parent?: Record<string, unknown>,
): string {
  const type = text(params?.type) || text(parent?.type);
  const subtype = text(params?.subType) || text(parent?.subType);
  const density = text(params?.density);
  const detail = subtype || (density && density !== type ? density : '');
  if (type && detail && detail !== type) return `${type}, ${detail}`;
  return type || detail;
}

export function finishingServiceDisplayName(
  serviceName: string,
  variantId: number | undefined,
  paramsById: Map<number, Record<string, unknown>>,
): string {
  const base = serviceName.trim() || 'Услуга';
  if (variantId == null) return base;
  const params = paramsById.get(variantId);
  const parentId = Number(params?.parentVariantId);
  const parent = Number.isFinite(parentId) && parentId > 0 ? paramsById.get(parentId) : undefined;
  const caption = finishingServiceCaption(params, parent);
  if (!caption || base.toLowerCase().includes(caption.toLowerCase())) return base;
  return `${base} — ${caption}`;
}
