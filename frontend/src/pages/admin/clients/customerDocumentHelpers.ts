import type { Customer, Order } from '../../../types';
import { formatReceiptPaperCaptionFromParams } from '../../../components/order/orderItemBreakdownUtils';
import { getOrderAmounts } from '../../../utils/orderTotal';

export const getCustomerDisplayName = (customer: Customer) => {
  if (customer.type === 'legal') {
    return customer.company_name || customer.legal_name || `Юридическое лицо #${customer.id}`;
  }
  const parts = [customer.last_name, customer.first_name, customer.middle_name].filter(Boolean);
  return parts.join(' ') || `Клиент #${customer.id}`;
};

const CUSTOMER_SOURCE_LABELS: Record<string, string> = {
  crm: 'CRM',
  website: 'Сайт',
  telegram: 'Telegram',
  mini_app: 'Mini App',
};

/** Подпись канала по значению `customer.source` (для списка и отчётов). */
export const getCustomerSourceLabel = (source?: string | null) => {
  if (source == null || String(source).trim() === '') return CUSTOMER_SOURCE_LABELS.crm;
  const key = String(source).trim();
  return CUSTOMER_SOURCE_LABELS[key] ?? 'CRM';
};

/** Итог заказа после скидки (с API). */
export const getOrderTotal = (order: Order) => getOrderAmounts(order).total;

export const formatDateValue = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
};

export const formatLastOrderAmount = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)} бел. руб.`;
};

export const formatDateForFile = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');

export const getOrderItemPaperPhrase = (item: any): string => {
  try {
    const params =
      typeof item.params === 'string' ? JSON.parse(item.params || '{}') : (item.params || {});
    return formatReceiptPaperCaptionFromParams(params);
  } catch {
    return '';
  }
};

export const getOrderItemProductionName = (item: any): string => {
  const productName =
    item.name ||
    item.params?.productName ||
    item.params?.name ||
    item.params?.description ||
    item.type ||
    'Услуга';
  const qty = Number(item.quantity) || 1;
  const params = item.params || {};
  const specs = params.specifications || {};
  const layout = params.layout || specs.layout || {};
  const sheetsNeeded = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0;
  const cutsPerSheet = Number(layout.cutsPerSheet) || 0;
  const hasSheets = sheetsNeeded > 0;
  const hasCuts = cutsPerSheet > 0;

  const paperPhrase = getOrderItemPaperPhrase(item);

  const servicesList: Array<{ name: string; qty: number; unit: string }> = [];
  const rawServices = params.services;
  if (Array.isArray(rawServices) && rawServices.length > 0) {
    for (const s of rawServices) {
      const name = String(s.operationName || s.service || s.name || '').trim();
      if (!name || name.toLowerCase() === 'операция') continue;
      const serviceQty = Number(s.quantity);
      if (!Number.isFinite(serviceQty) || serviceQty <= 0) continue;
      const pu = String(s.priceUnit || s.unit || '').toLowerCase();
      const unit = pu.includes('sheet') || pu.includes('лист') ? 'лист.' : 'шт.';
      servicesList.push({ name, qty: serviceQty, unit });
    }
  }

  let main = productName;
  const parts: string[] = [];
  if (hasSheets) {
    const sheetWord = sheetsNeeded === 1 ? 'лист' : sheetsNeeded < 5 ? 'листа' : 'листов';
    parts.push(`${sheetsNeeded} ${sheetWord} печати`);
  }
  for (const op of servicesList) {
    parts.push(`${op.name} ${op.qty} ${op.unit}`);
  }
  if (hasCuts) {
    const cutWord = cutsPerSheet === 1 ? 'рез' : cutsPerSheet < 5 ? 'реза' : 'резок';
    parts.push(`${cutsPerSheet} ${cutWord}`);
  }

  if (parts.length > 0) {
    main = `${qty} ${productName}: ${parts.join(', ')}`;
  } else if (qty > 1) {
    main = `${qty} ${productName}`;
  }

  if (paperPhrase) return `${main}. ${paperPhrase}`;
  return main;
};

export const getOrderItemProductionRows = (
  item: any
): Array<{ name: string; quantity: number; unit: string; totalCost?: number }> => {
  const productName =
    item.name ||
    item.params?.productName ||
    item.params?.name ||
    item.params?.description ||
    item.type ||
    'Услуга';
  const params = item.params || {};
  const specs = params.specifications || {};
  const layout = params.layout || specs.layout || {};
  const sheetsNeeded = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0;
  const cutsPerSheet = Number(layout.cutsPerSheet) || 0;
  const paperPhrase = getOrderItemPaperPhrase(item);

  const rawServices = params.services || [];
  const hasCuttingInServices = Array.isArray(rawServices) && rawServices.some((s: any) => {
    const type = String(s.operationType || s.operation_type || '').toLowerCase();
    const name = String(s.operationName || s.service || s.name || '').toLowerCase();
    return type === 'cut' || /резк/.test(name);
  });

  const rows: Array<{ name: string; quantity: number; unit: string; totalCost?: number }> = [];

  if (sheetsNeeded > 0) {
    rows.push({ name: paperPhrase || 'Печать (листы)', quantity: sheetsNeeded, unit: 'шт.' });
  }
  if (Array.isArray(rawServices) && rawServices.length > 0) {
    for (const s of rawServices) {
      const name = String(s.operationName || s.service || s.name || '').trim();
      if (!name || name.toLowerCase() === 'операция') continue;
      const q = Number(s.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      const totalCost =
        typeof s.totalCost === 'number' ? s.totalCost : typeof s.total === 'number' ? s.total : undefined;
      const isPrintOp =
        String(s.operationType || s.operation_type || '').toLowerCase() === 'print' || /^печать$/i.test(name);
      if (isPrintOp && rows.length > 0 && typeof totalCost === 'number' && totalCost >= 0) {
        if (/печать|листы/i.test(rows[0].name)) {
          rows[0].totalCost = totalCost;
          continue;
        }
      }
      const pu = String(s.priceUnit || s.unit || '').toLowerCase();
      const unit = pu.includes('sheet') || pu.includes('лист') ? 'лист.' : 'шт.';
      rows.push({
        name,
        quantity: q,
        unit,
        ...(typeof totalCost === 'number' && totalCost >= 0 ? { totalCost } : {}),
      });
    }
  }
  if (cutsPerSheet > 0 && !hasCuttingInServices) {
    const cutWord = cutsPerSheet === 1 ? 'резка' : cutsPerSheet < 5 ? 'резки' : 'резок';
    rows.push({ name: cutWord.charAt(0).toUpperCase() + cutWord.slice(1), quantity: cutsPerSheet, unit: 'шт.' });
  }

  if (rows.length > 0) return rows;
  const qty = Number(item.quantity) || 1;
  return [{ name: productName, quantity: qty, unit: 'шт.' }];
};

export function distributeItemSumToRows(
  itemSum: number,
  lines: Array<{ name: string; quantity: number; unit: string; totalCost?: number }>
): number[] {
  const withCost = lines.map((l) => (typeof l.totalCost === 'number' && l.totalCost >= 0 ? l.totalCost : 0));
  const totalCostSum = withCost.reduce((a, b) => a + b, 0);
  if (totalCostSum <= 0) {
    const out: number[] = [itemSum];
    for (let i = 1; i < lines.length; i++) out.push(0);
    return out;
  }
  const scale = Math.min(1, itemSum / totalCostSum);
  const out: number[] = [];
  let remainder = itemSum;
  for (let i = 0; i < lines.length; i++) {
    const cost = withCost[i];
    const rowSum = cost > 0 ? Math.round(cost * scale * 100) / 100 : 0;
    remainder -= rowSum;
    out.push(rowSum);
  }
  const firstNoCostIdx = lines.findIndex((l) => typeof l.totalCost !== 'number' || l.totalCost < 0);
  if (firstNoCostIdx >= 0 && Math.abs(remainder) > 0.001) {
    out[firstNoCostIdx] = Math.round((out[firstNoCostIdx] + remainder) * 100) / 100;
  }
  const diff = itemSum - out.reduce((a, b) => a + b, 0);
  if (Math.abs(diff) > 0.001 && out.length > 0) {
    out[0] = Math.round((out[0] + diff) * 100) / 100;
  }
  return out;
}
