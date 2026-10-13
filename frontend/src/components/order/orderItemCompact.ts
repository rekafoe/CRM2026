import type { Item } from '../../types';
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

  const material =
    summaryValue(summary, /материал|бумаг|пл[её]нк/i) ||
    (typeof params?.paperName === 'string' ? params.paperName.trim() : '');
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

export type OrderPositionFacts = {
  print: string;
  materials: string;
  layout: string;
};

function colorLabel(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === 'color' || value === 'цвет' || value === 'цветная') return 'цвет';
  if (value === 'bw' || value === 'ч/б' || value === 'черно-белая') return 'ч/б';
  return raw.trim();
}

/** Три колонки раскрытой позиции: печать, блок/обложка, раскладка. */
export function buildOrderPositionFacts(item: Item): OrderPositionFacts {
  const params = item.params;
  const summary = summaryList(params);
  const specs = (params?.specifications || {}) as Record<string, unknown>;

  const tech = String(
    specs.print_technology ||
      specs.printTechnology ||
      (params as { printTechnology?: string } | undefined)?.printTechnology ||
      summaryValue(summary, /технолог|тип печати/i) ||
      ''
  ).trim();
  const color = colorLabel(
    String(specs.print_color_mode || specs.printColorMode || summaryValue(summary, /цветност|^цвет$/i) || '')
  );
  const sidesNum = Number(specs.sides ?? item.sides ?? 0);
  const sides = sidesNum === 2 ? '2 стороны' : sidesNum === 1 ? '1 сторона' : '';
  const print = [tech, color, sides].filter(Boolean).join(', ') || '—';

  const materialsArr = Array.isArray(params?.materials) ? params.materials : [];
  const materialNames = materialsArr
    .map((row) => {
      const extra = row as unknown as {
        materialName?: string;
        paper_type_name?: string;
        material?: { name?: string } | string;
      };
      const nested = extra.material;
      const nestedName = typeof nested === 'string' ? nested : nested?.name;
      return String(extra.materialName || nestedName || extra.paper_type_name || '').trim();
    })
    .filter(Boolean);
  const cover = summaryValue(summary, /обложк/i);
  const block = summaryValue(summary, /^блок$|материал блока|бумаг/i);
  const materials = [block, cover].filter(Boolean).join(' / ') || materialNames.join(' / ') || '—';

  const pages = summaryValue(summary, /страниц/i);
  const services = Array.isArray(params?.services) ? params.services : [];
  const ops = services
    .map((row) => {
      if (typeof row === 'string') return row.trim();
      const service = row as { operationName?: string; service?: string };
      return String(service.operationName || service.service || '').trim();
    })
    .filter((name) => name && !/^печать$/i.test(name))
    .slice(0, 3);
  const layoutParts = [
    pages ? (/стр/i.test(pages) ? pages : `${pages.replace(/[^\d]/g, '') || pages} стр.`) : '',
    ...ops,
  ].filter(Boolean);
  const sheets = Number(params?.sheetsNeeded ?? item.sheets ?? 0);
  if (layoutParts.length === 0 && Number.isFinite(sheets) && sheets > 0) {
    layoutParts.push(`${sheets} лист.`);
  }

  return {
    print,
    materials,
    layout: layoutParts.join(', ') || '—',
  };
}
