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

  const densityPhrase =
    densityNum != null && densityNum > 0 ? `${densityNum} г/м²` : '';

  return formatPrintCaptionLine(sidesPhrase, basePaper, densityPhrase);
}
