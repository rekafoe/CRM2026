/** Строки материалов/услуг из item.params (после калькулятора и API) */

export type OrderItemMaterialRow = {
  materialId?: number;
  materialName?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalCost?: number;
  total?: number;
  density?: number;
  paper_type_name?: string;
};

export type OrderItemServiceRow = {
  operationId?: number;
  operationName?: string;
  service?: string;
  operationType?: string;
  priceUnit?: string;
  unit?: string;
  unitPrice?: number;
  quantity?: number;
  totalCost?: number;
  total?: number;
};

/**
 * Строка тарифа печати (листы/метры/тираж) из UnifiedPricing — не послепечатная услуга.
 */
export function isPrintCostRow(s: OrderItemServiceRow): boolean {
  if (String(s.operationType || '').toLowerCase() === 'print') return true;
  if (s.operationId === 0) return true;
  const n = String(s.operationName || s.service || '')
    .trim()
    .toLowerCase();
  return n === 'печать';
}

/** Id материала («11») — не название типа бумаги. */
export function isBareMaterialId(value: unknown): boolean {
  return /^\d+$/.test(String(value ?? '').trim());
}

function humanPaperText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || isBareMaterialId(text)) return '';
  return text;
}

/**
 * Имя типа из строк расчёта. Короткое paper_type_name важнее SKU «… бумага 350».
 */
export function namedPaperTypeFromMaterials(
  materials: Array<Pick<OrderItemMaterialRow, 'paper_type_name' | 'materialName' | 'material'>> | undefined,
): string {
  if (!Array.isArray(materials)) return '';
  for (const row of materials) {
    const paper = humanPaperText(row?.paper_type_name);
    if (paper) return paper;
  }
  for (const row of materials) {
    const name = humanPaperText(row?.materialName || row?.material);
    if (name) return name;
  }
  return '';
}

/**
 * Подпись типа бумаги для заказа: как в калькуляторе (Мелованная/полуматовая и т.д.),
 * не складское имя позиции и не id материала.
 * Сводка с названием → paper_type_name → materialName.
 */
export function humanReadablePaperLabel(
  row: OrderItemMaterialRow | undefined,
  parameterSummary: Array<{ label?: string; key?: string; value?: string }>
): string {
  let fromSummary =
    parameterSummary
      .find((p) => {
        const L = String(p.label || p.key || '').trim();
        return L === 'Материал' || L === 'Тип материала';
      })
      ?.value?.trim() || '';

  if (!fromSummary && parameterSummary.length) {
    const ptEntry = parameterSummary.find((p) => {
      const label = String(p.label || p.key || '').toLowerCase();
      if (/тип\s*печати|print_technology|printtechnology/.test(label)) return false;
      return /тип\s*бумаги|papertype|^\s*бумага\s*$|тип\s*материала|^материал$/i.test(label);
    });
    if (ptEntry?.value?.trim()) fromSummary = ptEntry.value.trim();
  }

  if (fromSummary && !isBareMaterialId(fromSummary)) return fromSummary;

  const paperType = humanPaperText(row?.paper_type_name);
  if (paperType) return paperType;

  const raw = humanPaperText(row?.materialName || row?.material);
  if (raw) return raw;
  return fromSummary || 'Материал';
}

/** Стороны печати для подписи заказа (согласовано с калькулятором). */
export function printSidesPhraseFromSpecs(specs: Record<string, unknown>): string {
  const raw = specs.sides;
  const sides = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
  if (sides === 2) return 'Печать двусторонняя';
  if (sides === 1) return 'Печать односторонняя';
  return 'Печать';
}

function parsePaperDensityFromSpecs(specs: Record<string, unknown>): number | undefined {
  const pd = specs.paperDensity;
  if (typeof pd === 'number' && Number.isFinite(pd)) return pd;
  if (pd != null && pd !== '') {
    const n = Number(String(pd).replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Строка «печать + материал» без «на бумаге …»: каталожное имя в номинативе (без подбора падежей).
 * Пример: «Печать односторонняя — Мелованная полуматовая, 200 г/м²».
 */
export function formatPrintCaptionLine(
  sidesPhrase: string,
  paperLabel: string,
  densityPhrase: string
): string {
  const paper = paperLabel.trim();
  const dens = densityPhrase.trim();
  if (paper && dens) return `${sidesPhrase} — ${paper}, ${dens}`;
  if (paper) return `${sidesPhrase} — ${paper}`;
  if (dens) return `${sidesPhrase}, ${dens}`;
  return sidesPhrase;
}

function colorPhraseFromSpecs(specs: Record<string, unknown>): string {
  const raw = String(specs.print_color_mode || specs.printColorMode || '')
    .trim()
    .toLowerCase();
  if (raw === 'color' || raw === 'цвет' || raw === 'цветная') return 'цвет';
  if (raw === 'bw' || raw === 'ч/б' || raw === 'mono' || raw === 'черно-белая') return 'ч/б';
  return '';
}

function pagesPhraseFromSpecs(
  specs: Record<string, unknown>,
  parameterSummary: Array<{ label?: string; key?: string; value?: string }>
): string {
  const fromSummary = parameterSummary.find((entry) =>
    /страниц/i.test(String(entry.label || entry.key || ''))
  )?.value;
  const raw = fromSummary || specs.pages || specs.pageCount;
  const count = Number(String(raw ?? '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(count) || count <= 1) return '';
  return `${count} стр.`;
}

/** Подпись строки тарифа печати для заказа (стороны, цвет, бумага, страницы). */
export function formatPrintOperationCaption(
  specs: Record<string, unknown>,
  materials: OrderItemMaterialRow[],
  parameterSummary: Array<{ label?: string; key?: string; value?: string }>
): string {
  const color = colorPhraseFromSpecs(specs);
  const sidesBase = printSidesPhraseFromSpecs(specs);
  const sidesPhrase =
    color && !sidesBase.toLowerCase().includes(color) ? `${sidesBase}, ${color}` : sidesBase;

  const basePaper = humanReadablePaperLabel(materials[0], parameterSummary);
  const densityNum = paperDensityGsm(specs, materials, parameterSummary);
  const densityPhrase =
    densityNum != null && densityNum > 0 ? `${densityNum} г/м²` : '';

  const caption = formatPrintCaptionLine(sidesPhrase, basePaper, densityPhrase);
  const pages = pagesPhraseFromSpecs(specs, parameterSummary);
  if (pages && !caption.toLowerCase().includes('стр')) return `${caption}, ${pages}`;
  return caption;
}

function paperDensityGsm(
  specs: Record<string, unknown>,
  materials: OrderItemMaterialRow[],
  parameterSummary: Array<{ label?: string; key?: string; value?: string }>
): number | undefined {
  let densityNum = parsePaperDensityFromSpecs(specs);
  const mainMaterial = materials[0];
  if (densityNum == null && mainMaterial?.density != null) {
    const d = Number(mainMaterial.density);
    if (Number.isFinite(d) && d > 0) densityNum = d;
  }
  if (densityNum == null) {
    const densLabel = parameterSummary.find((p) =>
      /плотность бумаги|^плотность$/i.test(String(p.label || p.key || '').trim())
    )?.value;
    if (densLabel) {
      const n = Number(String(densLabel).replace(/[^\d]/g, ''));
      if (Number.isFinite(n) && n > 0) densityNum = n;
    }
  }
  return densityNum;
}

/** Имя шага печати из калькулятора — то же, что в карточке заказа. */
export function plannedPrintStepName(params: Record<string, unknown> | null | undefined): string {
  if (!params || typeof params !== 'object') return '';
  const plan = params.productionPlan;
  if (!plan || typeof plan !== 'object') return '';
  const steps = (plan as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return '';
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    if (String((step as { type?: unknown }).type || '').toLowerCase() !== 'print') continue;
    const name = String((step as { name?: unknown }).name ?? '').trim();
    if (name) return name;
  }
  return '';
}

/** Дописывает плотность, если в названии шага её ещё нет. */
export function withPaperDensity(name: string, params: Record<string, unknown>): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const specs = (params.specifications || {}) as Record<string, unknown>;
  const parameterSummary = Array.isArray(params.parameterSummary)
    ? (params.parameterSummary as Array<{ label?: string; key?: string; value?: string }>)
    : [];
  const materials = Array.isArray(params.materials) ? (params.materials as OrderItemMaterialRow[]) : [];
  const densityNum = paperDensityGsm(specs, materials, parameterSummary);
  if (densityNum == null || densityNum <= 0) return trimmed;
  if (/г\/м/i.test(trimmed)) return trimmed;
  const escaped = String(densityNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|\\D)${escaped}(?:\\D|$)`).test(trimmed)) return trimmed;
  return `${trimmed}, ${densityNum} г/м²`;
}

/** Как на бэкенде commodityReceiptLabels — для актов/счетов (fallback на фронте). */
export function formatReceiptPaperCaptionFromParams(params: Record<string, unknown>): string {
  const specs = (params.specifications || {}) as Record<string, unknown>;
  const parameterSummary = Array.isArray(params.parameterSummary)
    ? (params.parameterSummary as Array<{ label?: string; key?: string; value?: string }>)
    : [];
  const materials = Array.isArray(params.materials) ? (params.materials as OrderItemMaterialRow[]) : [];
  return formatPrintOperationCaption(specs, materials, parameterSummary);
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.floor(n)) % 100;
  const rest10 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (rest10 === 1) return forms[0];
  if (rest10 >= 2 && rest10 <= 4) return forms[1];
  return forms[2];
}

export function formatMaterialQty(row: OrderItemMaterialRow): string {
  const q = Number(row.quantity);
  if (!Number.isFinite(q)) return '—';
  const unit = String(row.unit || '').toLowerCase();
  if (unit.includes('sheet') || unit.includes('лист')) {
    return `${q} ${pluralRu(q, ['лист', 'листа', 'листов'])}`;
  }
  if (unit.includes('m2') || unit.includes('м²') || unit.includes('sq')) {
    return `${q} м²`;
  }
  if ((unit.includes('m') || unit.includes('meter')) && !unit.includes('m2')) {
    return `${q} м`;
  }
  if (unit === 'шт' || unit.includes('piece') || unit.includes('item')) {
    return `${q} шт.`;
  }
  return `${q} ${row.unit || 'шт.'}`;
}

export function formatServiceQty(row: OrderItemServiceRow): string {
  const q = Number(row.quantity);
  if (!Number.isFinite(q)) return '—';
  const pu = String(row.priceUnit || row.unit || '').toLowerCase();
  if (pu.includes('sheet') || pu.includes('per_sheet') || pu.includes('лист')) {
    return `${q} ${pluralRu(q, ['лист', 'листа', 'листов'])}`;
  }
  if (pu.includes('meter') || pu.includes('per_meter') || pu === 'm') {
    return `${q} м`;
  }
  if (pu.includes('m2') || pu.includes('per_m2') || pu.includes('area')) {
    return `${q} м²`;
  }
  return `${q} шт.`;
}

export function materialRowTotal(m: OrderItemMaterialRow): number {
  const v = m.totalCost ?? m.total;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function serviceRowTotal(s: OrderItemServiceRow): number {
  const v = s.totalCost ?? s.total;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
