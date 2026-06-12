/** Общие хелперы для заказов с сайта / Mini App (items + params). */

const INTERNAL_PARAM_KEYS = new Set([
  'layoutHumanLabel',
  'crmNoLayoutDeclared',
  '_crmPendingNoLayoutPayload',
  '_crmCalculationSnapshot',
  'crmCalculateConfiguration',
  // editorDraftToken — контракт checkout редактора; нужен до prepareWebsiteItemsWithEditorDrafts
  'designEditorMode',
]);

function isNoLayoutDeclared(params: Record<string, unknown>): boolean {
  if (params.no_layout === true || params.layout_missing === true) return true;
  if (params.crmNoLayoutDeclared === true) return true;
  const specs = params.specifications;
  if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
    if ((specs as Record<string, unknown>).artwork_provided === false) return true;
  }
  return false;
}

function humanizeParamValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const fin = value as { enabled?: boolean; type?: string; density?: string };
    if (fin.enabled === false) return 'нет';
    const parts = [fin.type, fin.density].filter((part) => typeof part === 'string' && part.trim()).map(String);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  const display = Array.isArray(value) ? value.map(String).join(', ') : String(value).trim();
  if (!display || display === '[object Object]') return null;
  return display;
}

function sanitizeParameterSummary(
  summary: unknown,
  params: Record<string, unknown>
): Array<{ label: string; value: string }> {
  if (!Array.isArray(summary)) return [];

  const cleaned = summary
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const label = String((row as { label?: unknown }).label ?? '').trim();
      const value = humanizeParamValue((row as { value?: unknown }).value);
      if (!label || value == null) return null;
      if (label === 'layoutHumanLabel') return null;
      if (label === 'Дополнительная отделка' && value === '[object Object]') return null;
      return { label, value };
    })
    .filter((row): row is { label: string; value: string } => row != null);

  const hasLayout = cleaned.some((row) => row.label.toLowerCase() === 'макет');
  if (!hasLayout && isNoLayoutDeclared(params)) {
    const layoutLabel =
      typeof params.layoutHumanLabel === 'string' && params.layoutHumanLabel.trim()
        ? params.layoutHumanLabel.trim()
        : 'Не приложён (заказ без файла)';
    cleaned.push({ label: 'Макет', value: layoutLabel });
  }

  return cleaned;
}

function sanitizeWebsiteDescription(
  description: unknown,
  parameterSummary: Array<{ label: string; value: string }>
): string {
  let text = typeof description === 'string' ? description.trim() : '';
  if (!text) return text;

  text = text
    .replace(/;?\s*layoutHumanLabel:\s*[^;]+/gi, '')
    .replace(/;?\s*Дополнительная отделка:\s*\[object Object\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/;\s*;/g, ';')
    .replace(/\s*;\s*$/g, '')
    .trim();

  if (!text && parameterSummary.length > 0) {
    return parameterSummary.map((p) => `${p.label}: ${p.value}`).join('; ');
  }
  return text;
}

export function sanitizeWebsiteItemParams(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };

  for (const key of Object.keys(next)) {
    if (INTERNAL_PARAM_KEYS.has(key)) {
      delete next[key];
    }
  }

  const parameterSummary = sanitizeParameterSummary(next.parameterSummary, next);
  if (parameterSummary.length > 0) {
    next.parameterSummary = parameterSummary;
  } else {
    delete next.parameterSummary;
  }

  if (typeof next.description === 'string') {
    next.description = sanitizeWebsiteDescription(next.description, parameterSummary);
  }

  if (isNoLayoutDeclared(next)) {
    next.no_layout = true;
  }

  return next;
}

export function normalizeItemParams(params: unknown): Record<string, unknown> {
  if (params == null) return {};
  if (typeof params === 'object' && !Array.isArray(params)) {
    return sanitizeWebsiteItemParams({ ...(params as Record<string, unknown>) });
  }
  if (typeof params === 'string') {
    const s = params.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? sanitizeWebsiteItemParams({ ...(parsed as Record<string, unknown>) })
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
