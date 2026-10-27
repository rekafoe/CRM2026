/**
 * Подписи «печать + материал» для товарного чека и актов (как в orderItemBreakdownUtils на фронте).
 */

export type MaterialRowLike = {
  materialName?: string;
  material?: string;
  paper_type_name?: string;
  density?: number;
};

export type SummaryRowLike = { label?: string; key?: string; value?: string };

export function humanReadablePaperLabel(
  row: MaterialRowLike | undefined,
  parameterSummary: SummaryRowLike[]
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

  if (fromSummary) return fromSummary;

  const paperType = String(row?.paper_type_name || '').trim();
  if (paperType) return paperType;

  const raw = String(row?.materialName || row?.material || '').trim();
  return raw || 'Материал';
}

export function printSidesPhraseFromSpecs(specs: Record<string, unknown>): string {
  const raw = specs.sides;
  const sides = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
  if (sides === 2) return 'Печать двусторонняя';
  if (sides === 1) return 'Печать односторонняя';
  return 'Печать';
}

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

function parseDensityFromSpecs(specs: Record<string, unknown>): number | undefined {
  const pd = specs.paperDensity;
  if (typeof pd === 'number' && Number.isFinite(pd)) return pd;
  if (pd != null && pd !== '') {
    const n = Number(String(pd).replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function paperDensityGsm(params: Record<string, unknown>): number | undefined {
  const specs = (params.specifications || {}) as Record<string, unknown>;
  const parameterSummary = Array.isArray(params.parameterSummary)
    ? (params.parameterSummary as SummaryRowLike[])
    : [];
  const materials = Array.isArray(params.materials) ? params.materials : [];
  const mainMaterial = materials[0] as MaterialRowLike | undefined;

  let densityNum = parseDensityFromSpecs(specs);
  if (densityNum == null && mainMaterial?.density != null) {
    const d = Number(mainMaterial.density);
    if (Number.isFinite(d) && d > 0) densityNum = d;
  }
  if (densityNum == null && parameterSummary.length) {
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

/** Полная строка для чека: без «на бумаге …»; каталожное имя в номинативе. */
export function formatReceiptPaperCaptionFromItemParams(params: Record<string, unknown>): string {
  const specs = (params.specifications || {}) as Record<string, unknown>;
  const parameterSummary = Array.isArray(params.parameterSummary)
    ? (params.parameterSummary as SummaryRowLike[])
    : [];
  const materials = Array.isArray(params.materials) ? params.materials : [];
  const mainMaterial = materials[0] as MaterialRowLike | undefined;

  const sidesPhrase = printSidesPhraseFromSpecs(specs);
  const basePaper = humanReadablePaperLabel(mainMaterial, parameterSummary);
  const densityNum = paperDensityGsm(params);
  const densityPhrase =
    densityNum != null && densityNum > 0 ? `${densityNum} г/м²` : '';

  return formatPrintCaptionLine(sidesPhrase, basePaper, densityPhrase);
}

/** Имя шага печати из калькулятора: технология и материал, как в карточке заказа. */
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
  const densityNum = paperDensityGsm(params);
  if (densityNum == null || densityNum <= 0) return trimmed;
  if (/г\/м/i.test(trimmed)) return trimmed;
  const escaped = String(densityNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(?:^|\\D)${escaped}(?:\\D|$)`).test(trimmed)) return trimmed;
  return `${trimmed}, ${densityNum} г/м²`;
}

/**
 * Строка печати для товарного чека.
 * С планом производства — его название плюс плотность. Иначе прежняя подпись бумаги.
 */
export function receiptPrintLineName(params: Record<string, unknown>): string {
  const planned = plannedPrintStepName(params);
  if (!planned) return formatReceiptPaperCaptionFromItemParams(params);
  return withPaperDensity(planned, params);
}

export type CommodityReceiptItemRow = {
  name: string;
  quantity: number;
  unit: string;
  totalCost?: number;
};

function isGenericPrintName(name: string): boolean {
  return /^печать$/i.test(name.trim());
}

function isReceiptPrintLine(rowName: string, plannedLine: string): boolean {
  if (/печать|листы/i.test(rowName)) return true;
  return plannedLine.length > 0 && rowName === plannedLine;
}

/**
 * Строки позиции для товарного чека, акта и счёта.
 * Услуга «Печать» не дублируется: её сумма переносится на строку с технологией и материалом.
 */
export function buildCommodityReceiptItemRows(it: {
  name?: unknown;
  type?: unknown;
  quantity?: unknown;
  params?: unknown;
}): CommodityReceiptItemRow[] {
  const rows: CommodityReceiptItemRow[] = [];
  try {
    const params = (
      typeof it.params === 'string' ? JSON.parse(it.params || '{}') : (it.params || {})
    ) as Record<string, unknown>;
    const specs = (params.specifications || {}) as Record<string, unknown>;
    const layout = (params.layout || specs.layout || {}) as Record<string, unknown>;
    const sheetsNeeded = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0;
    const paperPhrase = formatReceiptPaperCaptionFromItemParams(params);
    const plannedLine = plannedPrintStepName(params) ? receiptPrintLineName(params) : '';
    const productName = String(it.name || params.productName || params.name || it.type || 'Услуга').trim();
    const rawServices = params.services;

    if (sheetsNeeded > 0) {
      rows.push({
        name: plannedLine || paperPhrase || 'Печать (листы)',
        quantity: sheetsNeeded,
        unit: 'шт.',
      });
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
          String(s.operationType || s.operation_type || '').toLowerCase() === 'print' ||
          isGenericPrintName(name);
        const printLine = plannedLine || paperPhrase;
        if (
          isPrintOp &&
          rows.length > 0 &&
          typeof totalCost === 'number' &&
          totalCost >= 0 &&
          isReceiptPrintLine(rows[0].name, printLine)
        ) {
          if (plannedLine && isGenericPrintName(name)) rows[0].name = plannedLine;
          rows[0].totalCost = totalCost;
          continue;
        }
        const displayName = plannedLine && isGenericPrintName(name) ? plannedLine : name;
        if (plannedLine && isGenericPrintName(name) && rows.some((row) => row.name === plannedLine)) {
          continue;
        }
        const pu = String(s.priceUnit || s.unit || '').toLowerCase();
        const unit = pu.includes('sheet') || pu.includes('лист') ? 'лист.' : 'шт.';
        rows.push({
          name: displayName,
          quantity: q,
          unit,
          ...(typeof totalCost === 'number' && totalCost >= 0 ? { totalCost } : {}),
        });
      }
    }
    if (rows.length > 0) return rows;
    const qty = Number(it.quantity) || 1;
    rows.push({ name: productName, quantity: qty, unit: 'шт.' });
  } catch (_) {
    const qty = Number(it.quantity) || 1;
    rows.push({ name: String(it.name || it.type || 'Позиция'), quantity: qty, unit: 'шт.' });
  }
  return rows;
}
