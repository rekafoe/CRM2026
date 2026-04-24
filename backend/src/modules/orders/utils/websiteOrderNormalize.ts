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
  totalCost?: number;
  components?: Array<{ materialId: number; qtyPerItem: number }>;
  priceType?: string;
  price_type?: string;
}> {
  return items.map((it: any) => ({
    ...(Array.isArray(it?.components) && it.components.length > 0
      ? {
          components: it.components
            .map((c: any) => ({
              materialId: Math.floor(Number(c?.materialId)),
              qtyPerItem: Number(c?.qtyPerItem),
            }))
            .filter((c: { materialId: number; qtyPerItem: number }) => Number.isFinite(c.materialId) && c.materialId > 0 && Number.isFinite(c.qtyPerItem)),
        }
      : {}),
    type: String(it?.type ?? ''),
    params: normalizeItemParams(it?.params),
    price: Number(it?.price) || 0,
    quantity: Math.max(1, parseInt(String(it?.quantity), 10) || 1),
    ...(it?.totalCost != null && Number.isFinite(Number(it.totalCost))
      ? { totalCost: Math.round(Number(it.totalCost) * 100) / 100 }
      : {}),
    ...(it?.priceType != null && { priceType: it.priceType }),
    ...(it?.price_type != null && { price_type: it.price_type }),
  }));
}
