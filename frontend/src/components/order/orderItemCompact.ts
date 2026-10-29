import type { Item } from '../../types';
import { isBareMaterialId, namedPaperTypeFromMaterials } from './orderItemBreakdownUtils';
import { sanitizeOrderItemDescription } from './orderItemUtils';

type SummaryRow = { label?: string; value?: string };

function summaryValue(summary: SummaryRow[], pattern: RegExp): string {
  const row = summary.find((entry) => pattern.test(String(entry.label || '')));
  return String(row?.value || '').trim();
}

function summaryList(params: Item['params'] | undefined): SummaryRow[] {
  return Array.isArray(params?.parameterSummary) ? params.parameterSummary : [];
}

/** Одна строка сути для свёрнутой позиции: размер, материал, страницы, переплёт. */
export function buildOrderItemEssence(item: Item): string {
  const params = item.params;
  const summary = summaryList(params);
  const specs = (params?.specifications || {}) as Record<string, unknown>;
  const parts: string[] = [];

  const size =
    summaryValue(summary, /формат|размер/i) ||
    (typeof specs.format === 'string' ? specs.format.trim() : '') ||
    (typeof params?.formatInfo === 'string' ? params.formatInfo.trim() : '');
  if (size) parts.push(size);

  const materialFromSummary =
    summaryValue(summary, /материал|бумаг|пл[её]нк/i) ||
    (typeof params?.paperName === 'string' ? params.paperName.trim() : '');
  const material = isBareMaterialId(materialFromSummary)
    ? namedPaperTypeFromMaterials(params?.materials as Parameters<typeof namedPaperTypeFromMaterials>[0]) ||
      materialFromSummary
    : materialFromSummary;
  const density = summaryValue(summary, /плотност/i);
  if (material) {
    parts.push(density && !material.includes(density) ? `${material} ${density}` : material);
  }

  const pagesRaw =
    summaryValue(summary, /страниц/i) || (specs.pages != null ? String(specs.pages).trim() : '');
  if (pagesRaw) {
    const digits = pagesRaw.replace(/[^\d]/g, '');
    parts.push(/стр/i.test(pagesRaw) ? pagesRaw : digits ? `${digits} стр.` : pagesRaw);
  }

  const binding = summaryValue(summary, /перепл|скрепл|пружин|скрепк/i);
  if (binding) parts.push(binding);

  if (parts.length > 0) return parts.join(', ');

  const desc = sanitizeOrderItemDescription(String(params?.description || ''), item.type);
  if (desc && desc !== 'Без описания' && desc !== 'Описание товара') return desc;
  return '—';
}
