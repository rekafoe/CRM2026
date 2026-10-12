/** Общие хелперы для заказов с сайта / Mini App (items + params). */

import { configurationFromItemParams, isSimplifiedProduct } from '../../pricing/services/pricingGroupService';

const INTERNAL_PARAM_KEYS = new Set([
  'layoutHumanLabel',
  'crmNoLayoutDeclared',
  '_crmPendingNoLayoutPayload',
  '_crmCalculationSnapshot',
  'crmCalculateConfiguration',
  // editorDraftToken — контракт checkout редактора; нужен до prepareWebsiteItemsWithEditorDrafts
  'designEditorMode',
]);

export class PublicCheckoutPricingError extends Error {
  code: 'PUBLIC_CHECKOUT_PRODUCT_REQUIRED' | 'PUBLIC_CHECKOUT_PRODUCT_NOT_SIMPLIFIED';
  status: number;

  constructor(
    message: string,
    code: 'PUBLIC_CHECKOUT_PRODUCT_REQUIRED' | 'PUBLIC_CHECKOUT_PRODUCT_NOT_SIMPLIFIED',
  ) {
    super(message);
    this.name = 'PublicCheckoutPricingError';
    this.code = code;
    this.status = 400;
  }
}

function readClientLineMoney(item: {
  price?: unknown;
  quantity?: unknown;
  totalCost?: unknown;
  params?: unknown;
}): number {
  if (item.totalCost != null && Number.isFinite(Number(item.totalCost))) {
    return Math.round(Number(item.totalCost) * 100) / 100;
  }
  const params = normalizeItemParams(item.params);
  if (typeof params.storedTotalCost === 'number' && Number.isFinite(params.storedTotalCost)) {
    return Math.round(Number(params.storedTotalCost) * 100) / 100;
  }
  const qty = Math.max(1, parseInt(String(item.quantity ?? 1), 10) || 1);
  const price = Number(item.price) || 0;
  return Math.round(price * qty * 100) / 100;
}

/**
 * Сайт / Mini App / public editor: платная позиция без simplified productId
 * не попадает в recalculateOrderPrices → клиентский totalCost остаётся (underpay).
 * Бесплатные design-only строки (price/totalCost = 0) без productId допустимы.
 */
export async function assertPublicCheckoutItemsHaveSimplifiedProduct(
  items: Array<{
    price?: unknown;
    quantity?: unknown;
    totalCost?: unknown;
    params?: unknown;
  }>,
): Promise<void> {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const money = readClientLineMoney(item);
    if (!(money > 0)) continue;

    const params = normalizeItemParams(item.params);
    const { productId } = configurationFromItemParams(params);
    if (productId == null) {
      throw new PublicCheckoutPricingError(
        `Позиция ${index + 1}: для платной позиции нужен productId каталожного продукта`,
        'PUBLIC_CHECKOUT_PRODUCT_REQUIRED',
      );
    }
    const simplified = await isSimplifiedProduct(productId);
    if (!simplified) {
      throw new PublicCheckoutPricingError(
        `Позиция ${index + 1}: productId=${productId} не является simplified-продуктом каталога`,
        'PUBLIC_CHECKOUT_PRODUCT_NOT_SIMPLIFIED',
      );
    }
  }
}

const HIDDEN_SUMMARY_LABELS = new Set([
  'productionrendersource',
  'poligrafyslug',
  'poligrafytypeidparam',
  'typeid',
  'pricetype',
  'ordermode',
  'productid',
  'layouthumanlabel',
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
      const labelNorm = label.toLowerCase();
      if (HIDDEN_SUMMARY_LABELS.has(labelNorm)) return null;
      // Служебные ключи латиницей (camelCase) не показываем оператору
      if (/^[a-z][a-zA-Z0-9_]*$/.test(label)) return null;
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
