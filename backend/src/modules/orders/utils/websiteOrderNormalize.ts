/** Общие хелперы для заказов с сайта / Mini App (items + params). */

export function normalizeItemParams(params: unknown): Record<string, unknown> {
  if (params == null) return {};
  if (typeof params === 'object' && !Array.isArray(params)) return { ...params } as Record<string, unknown>;
  if (typeof params === 'string') {
    const s = params.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizeWebsiteItems(
  items: any[]
): Array<{
  type: string;
  params: Record<string, unknown>;
  price: number;
  quantity: number;
  priceType?: string;
  price_type?: string;
}> {
  return items.map((it: any) => ({
    type: String(it?.type ?? ''),
    params: normalizeItemParams(it?.params),
    price: Number(it?.price) || 0,
    quantity: Math.max(1, parseInt(String(it?.quantity), 10) || 1),
    ...(it?.priceType != null && { priceType: it.priceType }),
    ...(it?.price_type != null && { price_type: it.price_type }),
  }));
}
