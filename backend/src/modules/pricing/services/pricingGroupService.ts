/**
 * Группировка позиций заказа / корзины для тиражной скидки по сумме физических листов.
 */

import { logger } from '../../../utils/logger';
import { UnifiedPricingService } from './unifiedPricingService';
import { getDb } from '../../../db';

export interface PricingLineInput {
  lineId: string | number;
  productId: number;
  quantity: number;
  configuration: Record<string, unknown>;
  /** Предрасчитанные листы (из params или первого прохода) */
  sheetsNeeded?: number;
}

export interface QuotedLineResult {
  lineId: string | number;
  productId: number;
  quantity: number;
  finalPrice: number;
  pricePerUnit: number;
  sheetsNeeded: number;
  groupKey: string | null;
  groupTotalSheets: number | null;
  groupTotalTierVolume?: number | null;
  tierMinQty: number | null;
  pricingMeta: {
    groupKey: string | null;
    groupTotalSheets: number | null;
    groupTotalTierVolume?: number | null;
    tierMinQty: number | null;
    sheetsNeeded: number;
  };
  skipped?: boolean;
  error?: string;
}

export interface PricingGroupSummary {
  groupKey: string;
  totalSheets: number;
  totalTierVolume: number;
  tierMinQty: number | null;
  lineIds: Array<string | number>;
}

export interface QuoteLinesResult {
  lines: QuotedLineResult[];
  groups: PricingGroupSummary[];
  cartTotal: number;
}

function normStr(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** Ключ группы: бумага + параметры печати (без priceType). */
export function buildGroupKey(configuration: Record<string, unknown>): string | null {
  const materialId = configuration.material_id ?? configuration.materialId;
  const tech = configuration.print_technology ?? configuration.printTechnology;
  const color = configuration.print_color_mode ?? configuration.printColorMode;
  let sides = configuration.print_sides_mode ?? configuration.printSidesMode;
  if (!sides && configuration.sides != null) {
    sides = Number(configuration.sides) === 2 ? 'duplex' : 'single';
  }
  if (materialId == null || materialId === '' || !tech || !color || !sides) {
    return null;
  }
  return `${Number(materialId)}|${normStr(tech)}|${normStr(color)}|${normStr(sides)}`;
}

export function configurationFromItemParams(params: Record<string, unknown>): {
  productId: number | null;
  configuration: Record<string, unknown>;
  sheetsNeeded: number | undefined;
} {
  const specs =
    params.specifications && typeof params.specifications === 'object' && !Array.isArray(params.specifications)
      ? (params.specifications as Record<string, unknown>)
      : {};

  const productIdRaw = params.productId ?? params.product_id ?? specs.productId;
  const productId =
    productIdRaw != null && Number.isFinite(Number(productIdRaw)) && Number(productIdRaw) > 0
      ? Number(productIdRaw)
      : null;

  const configuration: Record<string, unknown> = {
    ...specs,
    ...(params.priceType != null ? { priceType: params.priceType } : {}),
    ...(params.price_type != null ? { price_type: params.price_type } : {}),
    ...(params.urgency != null ? { urgency: params.urgency } : {}),
    ...(params.typeId != null ? { typeId: params.typeId } : {}),
    ...(params.type_id != null ? { type_id: params.type_id } : {}),
    ...(params.pages != null ? { pages: params.pages } : {}),
    ...(specs.pages != null ? { pages: specs.pages } : {}),
  };

  const sheetsRaw =
    params.sheetsNeeded ??
    specs.sheetsNeeded ??
    (params.layout && typeof params.layout === 'object'
      ? (params.layout as { sheetsNeeded?: number }).sheetsNeeded
      : undefined) ??
    (specs.layout && typeof specs.layout === 'object'
      ? (specs.layout as { sheetsNeeded?: number }).sheetsNeeded
      : undefined);

  const sheetsNeeded =
    sheetsRaw != null && Number.isFinite(Number(sheetsRaw)) && Number(sheetsRaw) > 0
      ? Math.floor(Number(sheetsRaw))
      : undefined;

  return { productId, configuration, sheetsNeeded };
}

export function isGroupableLine(line: PricingLineInput): boolean {
  if (!Number.isFinite(line.productId) || line.productId <= 0) return false;
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return false;
  return buildGroupKey(line.configuration) != null;
}

export function buildPricingGroups(
  lines: Array<PricingLineInput & { sheetsNeeded: number; tierVolume: number }>
): Map<string, { lineIds: Array<string | number>; totalSheets: number; totalTierVolume: number }> {
  const groups = new Map<
    string,
    { lineIds: Array<string | number>; totalSheets: number; totalTierVolume: number }
  >();
  for (const line of lines) {
    const key = buildGroupKey(line.configuration);
    if (!key) continue;
    const sheets = Math.max(1, Math.floor(line.sheetsNeeded));
    const tierVol = Math.max(1, Math.floor(line.tierVolume));
    const existing = groups.get(key);
    if (existing) {
      existing.lineIds.push(line.lineId);
      existing.totalSheets += sheets;
      existing.totalTierVolume += tierVol;
    } else {
      groups.set(key, {
        lineIds: [line.lineId],
        totalSheets: sheets,
        totalTierVolume: tierVol,
      });
    }
  }
  return groups;
}

/** Физические листы и объём tier (для группировки) — всегда из актуального расчёта, не из устаревших params. */
async function resolveLinePricingVolumes(
  line: PricingLineInput
): Promise<{ sheetsNeeded: number; tierVolume: number }> {
  try {
    const result = await UnifiedPricingService.calculatePrice(
      line.productId,
      line.configuration,
      line.quantity
    );
    const sheets = result.sheetsNeeded ?? result.layout?.sheetsNeeded;
    const sheetsNeeded =
      sheets != null && Number.isFinite(Number(sheets)) && Number(sheets) > 0
        ? Math.max(1, Math.floor(Number(sheets)))
        : 1;
    const tierRaw = result.tierVolumeForGrouping ?? sheetsNeeded;
    const tierVolume =
      Number.isFinite(Number(tierRaw)) && Number(tierRaw) > 0
        ? Math.max(1, Math.floor(Number(tierRaw)))
        : sheetsNeeded;
    return { sheetsNeeded, tierVolume };
  } catch (error) {
    logger.warn('[PricingGroupService] не удалось получить объёмы для группировки', {
      lineId: line.lineId,
      productId: line.productId,
      error: (error as Error).message,
    });
    const fallback =
      line.sheetsNeeded != null && line.sheetsNeeded > 0
        ? Math.floor(line.sheetsNeeded)
        : 1;
    return { sheetsNeeded: fallback, tierVolume: fallback };
  }
}

export async function quoteLines(
  lines: PricingLineInput[],
  options?: { skipNonGroupable?: boolean }
): Promise<QuoteLinesResult> {
  const skipNonGroupable = options?.skipNonGroupable !== false;

  const enriched: Array<
    PricingLineInput & { sheetsNeeded: number; tierVolume: number; groupKey: string | null }
  > = [];
  for (const line of lines) {
    const groupKey = buildGroupKey(line.configuration);
    const volumes = await resolveLinePricingVolumes(line);
    enriched.push({ ...line, ...volumes, groupKey });
  }

  const groupable = enriched.filter((l) => l.groupKey != null);
  const groupsMap = buildPricingGroups(
    groupable.map((l) => ({
      lineId: l.lineId,
      productId: l.productId,
      quantity: l.quantity,
      configuration: l.configuration,
      sheetsNeeded: l.sheetsNeeded,
      tierVolume: l.tierVolume,
    }))
  );

  const lineOverride = new Map<string | number, number>();
  const lineGroupKey = new Map<string | number, string>();
  for (const [groupKey, group] of groupsMap) {
    for (const lid of group.lineIds) {
      lineOverride.set(lid, group.totalTierVolume);
      lineGroupKey.set(lid, groupKey);
    }
  }

  const quotedLines: QuotedLineResult[] = [];
  let cartTotal = 0;

  for (const line of enriched) {
    const groupKey = line.groupKey;
    const groupTotalTierVolume = groupKey != null ? lineOverride.get(line.lineId) ?? null : null;
    const groupTotalSheets =
      groupKey != null
        ? groupsMap.get(groupKey)?.totalSheets ?? line.sheetsNeeded
        : null;

    if (groupKey == null && skipNonGroupable) {
      quotedLines.push({
        lineId: line.lineId,
        productId: line.productId,
        quantity: line.quantity,
        finalPrice: 0,
        pricePerUnit: 0,
        sheetsNeeded: line.sheetsNeeded,
        groupKey: null,
        groupTotalSheets: null,
        tierMinQty: null,
        pricingMeta: {
          groupKey: null,
          groupTotalSheets: null,
          tierMinQty: null,
          sheetsNeeded: line.sheetsNeeded,
        },
        skipped: true,
      });
      continue;
    }

    try {
      const configWithContext = {
        ...line.configuration,
        ...(groupTotalTierVolume != null
          ? { orderPricingContext: { tierSheetsOverride: groupTotalTierVolume } }
          : {}),
      };
      const result = await UnifiedPricingService.calculatePrice(
        line.productId,
        configWithContext,
        line.quantity
      );
      const finalPrice = Math.round(Number(result.finalPrice) * 100) / 100;
      const pricePerUnit = Math.round(Number(result.pricePerUnit) * 100) / 100;
      const sheetsNeeded =
        result.sheetsNeeded ?? result.layout?.sheetsNeeded ?? line.sheetsNeeded;

      const pricingMeta = {
        groupKey: groupKey ?? lineGroupKey.get(line.lineId) ?? null,
        groupTotalSheets,
        groupTotalTierVolume: groupTotalTierVolume,
        tierMinQty: null as number | null,
        sheetsNeeded: Math.max(1, Math.floor(Number(sheetsNeeded) || line.sheetsNeeded)),
      };

      quotedLines.push({
        lineId: line.lineId,
        productId: line.productId,
        quantity: line.quantity,
        finalPrice,
        pricePerUnit,
        sheetsNeeded: pricingMeta.sheetsNeeded,
        groupKey: pricingMeta.groupKey,
        groupTotalSheets,
        groupTotalTierVolume: groupTotalTierVolume,
        tierMinQty: null,
        pricingMeta,
      });
      cartTotal += finalPrice;
    } catch (error) {
      logger.error('[PricingGroupService] quote line failed', {
        lineId: line.lineId,
        productId: line.productId,
        error: (error as Error).message,
      });
      quotedLines.push({
        lineId: line.lineId,
        productId: line.productId,
        quantity: line.quantity,
        finalPrice: 0,
        pricePerUnit: 0,
        sheetsNeeded: line.sheetsNeeded,
        groupKey,
        groupTotalSheets,
        groupTotalTierVolume,
        tierMinQty: null,
        pricingMeta: {
          groupKey,
          groupTotalSheets,
          groupTotalTierVolume,
          tierMinQty: null,
          sheetsNeeded: line.sheetsNeeded,
        },
        error: (error as Error).message,
      });
    }
  }

  const groups: PricingGroupSummary[] = [];
  for (const [groupKey, group] of groupsMap) {
    groups.push({
      groupKey,
      totalSheets: group.totalSheets,
      totalTierVolume: group.totalTierVolume,
      tierMinQty: null,
      lineIds: group.lineIds,
    });
  }

  return {
    lines: quotedLines,
    groups,
    cartTotal: Math.round(cartTotal * 100) / 100,
  };
}

/** Проверка, что продукт — simplified (для фильтрации позиций заказа). */
export async function isSimplifiedProduct(productId: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ calculator_type?: string | null }>(
    'SELECT calculator_type FROM products WHERE id = ?',
    productId
  );
  return row?.calculator_type === 'simplified';
}
