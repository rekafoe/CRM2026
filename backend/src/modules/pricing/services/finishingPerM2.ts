/**
 * Вся логика finishing price_unit=per_m2:
 * биллинг = м² рулона (ширина × подача), склад = пог. м подачи.
 * Пока фича новая — держим отдельно от simplifiedPricingService.
 */

import type { Database } from 'sqlite';
import { getTableColumns } from '../../../utils/tableSchemaCache';
import {
  resolveRollConsumedArea,
  type RollConsumedAreaInput,
  type RollConsumedAreaResult,
} from './rollConsumedArea';

export { resolveRollConsumedArea };
export type { RollConsumedAreaInput, RollConsumedAreaResult };

export type FinishingRef = {
  service_id: number;
  variant_id?: number | null;
};

export function finishingFinKey(serviceId: number, variantId?: number | null): string {
  return variantId != null && Number.isFinite(Number(variantId)) && Number(variantId) > 0
    ? `${serviceId}:${Number(variantId)}`
    : String(serviceId);
}

export type PerM2LayoutContext = {
  trimMm: { width: number; height: number };
  bleedMm: number;
  quantity: number;
  margins: { edgeMm: number; gapMm: number };
};

export type PerM2QuoteResult = {
  /** м² для биллинга (ставка × м²) */
  rawUnits: number;
  totalUnits: number;
  servicePrice: number;
  /** пог. м подачи рулона (для склада и отображения оператору) */
  feedMeters: number;
  usedRollLayout: boolean;
  warning?: string;
};

/** Биллинг одной услуги/варианта per_m2. */
export function quotePerM2Finishing(params: {
  rollWidthMm?: number | null;
  layout: PerM2LayoutContext;
  rate: number;
  serviceMinQty?: number;
  serviceLabel?: string;
}): PerM2QuoteResult {
  const consumed = resolveRollConsumedArea({
    rollWidthMm: params.rollWidthMm,
    trimMm: params.layout.trimMm,
    bleedMm: params.layout.bleedMm,
    quantity: params.layout.quantity,
    margins: params.layout.margins,
  });
  const rawUnits = consumed.billedM2;
  const totalUnits = Math.max(rawUnits, params.serviceMinQty ?? 0);
  const servicePrice = Number(params.rate ?? 0) * totalUnits;
  const warning = consumed.usedRollLayout
    ? undefined
    : `${params.serviceLabel || 'Услуга'}: per_m2 без ширины рулона материала — считаем площадь изделия (trim). Привяжите рулон к варианту/услуге.`;
  return {
    rawUnits,
    totalUnits,
    servicePrice,
    feedMeters: Math.max(0, consumed.feedMeters),
    usedRollLayout: consumed.usedRollLayout,
    warning,
  };
}

/** м² для выбора тиражной ступени / превью диапазонов. */
export function billedM2ForQuantity(params: {
  rollWidthMm?: number | null;
  trimMm: { width: number; height: number };
  bleedMm?: number;
  quantity: number;
  margins?: { edgeMm: number; gapMm: number };
}): number {
  return resolveRollConsumedArea({
    rollWidthMm: params.rollWidthMm,
    trimMm: params.trimMm,
    bleedMm: params.bleedMm,
    quantity: params.quantity,
    margins: params.margins,
  }).billedM2;
}

export type WarehouseFeedResult = {
  feedMeters: number;
  usedRollLayout: boolean;
  warning?: string;
};

/**
 * Складской расход в пог. м для per_m2 или roll_feed.
 * fallbackMeters — запасной feed (общий метраж печати и т.п.).
 */
export function resolveWarehouseFeedMeters(params: {
  rollWidthMm?: number | null;
  layout: PerM2LayoutContext;
  fallbackMeters?: number;
  materialId?: number;
}): WarehouseFeedResult {
  const consumed = resolveRollConsumedArea({
    rollWidthMm: params.rollWidthMm,
    trimMm: params.layout.trimMm,
    bleedMm: params.layout.bleedMm,
    quantity: params.layout.quantity,
    margins: params.layout.margins,
  });
  if (consumed.usedRollLayout) {
    return { feedMeters: Math.max(0, consumed.feedMeters), usedRollLayout: true };
  }
  const fallback = Math.max(
    0,
    Number(params.fallbackMeters) || 0,
    consumed.feedMeters
  );
  return {
    feedMeters: fallback,
    usedRollLayout: false,
    warning:
      params.materialId != null
        ? `Материал операции #${params.materialId}: для roll_feed/per_m2 не задана ширина рулона, использован fallback по feed.`
        : undefined,
  };
}

/**
 * Склад для отделки price_unit=per_meter + meter_basis=feed при consumption_mode=fixed.
 * filmFeedMeters уже посчитан по ширине плёнки отделки — нельзя раздувать до метров
 * материала печати (иначе при более широкой плёнке склад списывает лишнее).
 */
export function resolvePerMeterFeedFixedWarehouseMeters(filmFeedMeters: number): number {
  const meters = Number(filmFeedMeters);
  return Number.isFinite(meters) && meters > 0 ? meters : 0;
}

function parsePositiveWidth(sheetWidth?: number | null, printableWidth?: number | null): number | null {
  const w = Number(sheetWidth ?? printableWidth ?? 0);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/**
 * Карта finKey → ширина рулона (мм) по material_id варианта/услуги.
 */
export async function loadFinishingRollWidthMmMap(
  db: Database,
  finishing: FinishingRef[],
  normalServiceIds: number[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!finishing.length) return out;

  const variantMaterialIdMap = new Map<number, number>();
  const serviceMaterialIdMap = new Map<number, number>();

  const selectedVariantIds = [
    ...new Set(
      finishing
        .map((f) => Number(f.variant_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  try {
    const variantCols = await getTableColumns('service_variants');
    if (variantCols.has('material_id') && selectedVariantIds.length > 0) {
      const rows = await db.all<Array<{ id: number; material_id: number | null }>>(
        `SELECT id, material_id FROM service_variants
         WHERE id IN (${selectedVariantIds.map(() => '?').join(',')}) AND material_id IS NOT NULL`,
        selectedVariantIds
      );
      for (const r of rows) {
        if (r.material_id != null) variantMaterialIdMap.set(r.id, Number(r.material_id));
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const ppsCols = await getTableColumns('post_processing_services');
    if (ppsCols.has('material_id') && normalServiceIds.length > 0) {
      const rows = await db.all<Array<{ id: number; material_id: number | null }>>(
        `SELECT id, material_id FROM post_processing_services
         WHERE id IN (${normalServiceIds.map(() => '?').join(',')}) AND material_id IS NOT NULL`,
        normalServiceIds
      );
      for (const r of rows) {
        if (r.material_id != null) serviceMaterialIdMap.set(r.id, Number(r.material_id));
      }
    }
  } catch {
    /* ignore */
  }

  const materialIds = new Set<number>([
    ...variantMaterialIdMap.values(),
    ...serviceMaterialIdMap.values(),
  ]);
  const widthByMaterialId = new Map<number, number>();
  if (materialIds.size > 0) {
    try {
      const mats = await db.all<
        Array<{ id: number; sheet_width?: number | null; printable_width?: number | null }>
      >(
        `SELECT id, sheet_width, printable_width FROM materials
         WHERE id IN (${[...materialIds].map(() => '?').join(',')})`,
        [...materialIds]
      );
      for (const m of mats) {
        const w = parsePositiveWidth(m.sheet_width, m.printable_width);
        if (w != null) widthByMaterialId.set(m.id, w);
      }
    } catch {
      /* ignore */
    }
  }

  for (const fin of finishing) {
    const sid = Number(fin.service_id);
    if (!Number.isFinite(sid)) continue;
    const vid =
      fin.variant_id != null && Number.isFinite(Number(fin.variant_id)) && Number(fin.variant_id) > 0
        ? Number(fin.variant_id)
        : undefined;
    const mid = (vid != null ? variantMaterialIdMap.get(vid) : undefined) ?? serviceMaterialIdMap.get(sid);
    if (mid == null) continue;
    const w = widthByMaterialId.get(mid);
    if (w != null) out.set(finishingFinKey(sid, vid), w);
  }

  return out;
}

/** Нужен ли roll_feed по умолчанию для price_unit / operation_type. */
export function defaultRollFeedForPriceUnit(
  priceUnit: string | null | undefined,
  operationType?: string | null
): boolean {
  const pu = String(priceUnit || '').toLowerCase();
  const op = String(operationType || '').toLowerCase();
  return pu === 'per_m2' || (op === 'laminate' && (pu === 'per_meter' || pu === 'per_m2'));
}
