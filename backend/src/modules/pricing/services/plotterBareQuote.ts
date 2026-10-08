/**
 * Калькулятор «Плоттерная резка» в заказе: резка плёнки для аппликации.
 * Резка — площадь изделий, м², умноженная на ставку и на уровень.
 * Плёнка — погонные метры подачи рулона. Без материала в сумме только резка.
 */

import type { PlotterCuttingModeTariffDTO } from '../dtos/plotterCuttingTariff.dto';
import { matchPlotterCutLevel } from './plotterCutLevel';
import {
  SHEET_PLOTTER_SRA3_MM,
  computeKnifePathMetersSheet,
  computeOptimizedRollFeedMeters,
  resolvePlotterMargins,
} from './plotterLayout';
import { buildPlotterTiersFromDto, findPlotterVolumeTier, resolvePlotterTierVolumeQty } from './plotterVolumeTier';

export type PlotterBareQuoteLine = {
  key: 'cut' | 'material' | 'weeding' | 'mounting' | 'proof';
  title: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export type PlotterBareQuote = {
  mode: 'roll' | 'sheet';
  lines: PlotterBareQuoteLine[];
  total: number;
  unitPrice: number;
  warnings: string[];
  knifePathM: number;
  feedM: number;
  sheetsNeeded: number;
  multiplier: number;
  levelName: string | null;
  cellLongSideMm: number;
};

export type PlotterBareQuoteInput = {
  widthMm: number;
  heightMm: number;
  quantity: number;
  mode: 'roll' | 'sheet';
  rollWidthMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  materialPrice: number;
  materialName: string;
  /** false — в сумме только резка и рулонные операции, строка материала не добавляется. */
  includeMaterial?: boolean;
  tariff: PlotterCuttingModeTariffDTO;
  weeding: boolean;
  mounting: boolean;
  proof: boolean;
  /** Задан — множитель выбранного уровня. Пусто — уровень по длинной стороне. */
  levelMultiplier?: number | null;
  levelName?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function tierAtQty(
  rows: Array<{ min_quantity: number; price_per_unit: number }> | undefined,
  qty: number,
): number {
  if (!rows?.length) return 0;
  const asc = [...rows].sort((a, b) => a.min_quantity - b.min_quantity);
  let pick = asc[0];
  for (const row of asc) if (qty >= row.min_quantity) pick = row;
  return Number(pick.price_per_unit) || 0;
}

export function quoteBarePlotter(input: PlotterBareQuoteInput): PlotterBareQuote {
  const warnings: string[] = [];
  const widthMm = Math.max(0, Number(input.widthMm) || 0);
  const heightMm = Math.max(0, Number(input.heightMm) || 0);
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const mode = input.mode === 'sheet' ? 'sheet' : 'roll';
  const margins = resolvePlotterMargins(mode);
  const cellLongSideMm = Math.max(widthMm, heightMm);
  const autoLevel = matchPlotterCutLevel(cellLongSideMm, input.tariff.cut_level_rules);
  const forced =
    input.levelMultiplier != null && Number.isFinite(Number(input.levelMultiplier)) && Number(input.levelMultiplier) > 0
      ? Number(input.levelMultiplier)
      : null;
  const multiplier = forced ?? autoLevel.multiplier;
  const levelName = forced != null ? (input.levelName?.trim() || null) : autoLevel.name;

  let feedM = 0;
  let sheetsNeeded = 0;
  const cutAreaM2 = (widthMm * heightMm * quantity) / 1_000_000;

  if (mode === 'roll') {
    const rollWidthMm = Math.max(0, Number(input.rollWidthMm) || 0);
    if (rollWidthMm <= 0) {
      if (input.includeMaterial !== false) {
        warnings.push('Ширина рулона неизвестна. Метраж плёнки не посчитан.');
      }
    } else {
      feedM =
        computeOptimizedRollFeedMeters({
          rollWidthMm,
          trimMm: { width: widthMm, height: heightMm },
          bleedMm: 0,
          quantity,
          margins,
        })?.feedMeters ?? 0;
    }
  } else {
    let sw = Number(input.sheetWidthMm) || 0;
    let sh = Number(input.sheetHeightMm) || 0;
    if (sw <= 0 || sh <= 0) {
      sw = SHEET_PLOTTER_SRA3_MM.width;
      sh = SHEET_PLOTTER_SRA3_MM.height;
      warnings.push('У материала нет формата листа — для раскладки взят SRA3, 320×450 мм.');
    }
    const layout = computeKnifePathMetersSheet({
      sheetMm: { width: sw, height: sh },
      trimMm: { width: widthMm, height: heightMm },
      bleedMm: 0,
      quantity,
      margins,
    });
    sheetsNeeded = layout.sheetsNeeded ?? quantity;
    if (layout.fitsOnSheet === false) {
      warnings.push('Изделие не помещается на лист. Листов к оплате столько же, сколько штук.');
    }
  }

  const tariff = input.tariff;
  const sheetByCount = mode === 'sheet' && tariff.meter_basis === 'feed';
  const feedForTier = sheetByCount ? sheetsNeeded : feedM;
  const tiers = buildPlotterTiersFromDto(tariff);
  const volumeQty = resolvePlotterTierVolumeQty({
    basis: tariff.volume_tier_basis ?? null,
    tariffMeterBasis: tariff.meter_basis,
    knifePathM: 0,
    feedM: feedForTier,
    cutAreaM2,
  });
  const tier = findPlotterVolumeTier(tiers, volumeQty);
  const rate = (tier?.unit_price ?? tariff.price_per_meter ?? 0) * multiplier;
  const rawUnits = sheetByCount ? sheetsNeeded : tariff.meter_basis === 'feed' ? feedM : cutAreaM2;
  const minUnits = Math.max(0, Number(tariff.min_quantity) || 0);
  const billedUnits = Math.max(rawUnits, minUnits);
  const cutTotal = roundMoney(rate * billedUnits);
  const cutUnit = sheetByCount ? 'лист' : tariff.meter_basis === 'feed' ? 'м' : 'м²';
  const lines: PlotterBareQuoteLine[] = [
    {
      key: 'cut',
      title: levelName ? `Резка, ${levelName}` : 'Резка',
      quantity: Math.round(billedUnits * 1000) / 1000,
      unit: cutUnit,
      unitPrice: roundMoney(rate),
      total: cutTotal,
    },
  ];

  if (input.includeMaterial !== false) {
    const materialQty = mode === 'roll' ? feedM : sheetsNeeded;
    const materialUnit = mode === 'roll' ? 'м' : 'лист';
    const materialPrice = Math.max(0, Number(input.materialPrice) || 0);
    lines.push({
      key: 'material',
      title: input.materialName?.trim() || 'Материал',
      quantity: Math.round(materialQty * 1000) / 1000,
      unit: materialUnit,
      unitPrice: roundMoney(materialPrice),
      total: roundMoney(materialPrice * materialQty),
    });
  }

  const extra = (
    key: PlotterBareQuoteLine['key'],
    title: string,
    enabled: boolean,
    rows: Array<{ min_quantity: number; price_per_unit: number }> | undefined,
  ) => {
    if (mode !== 'roll' || !enabled) return;
    if (!rows?.length) {
      warnings.push(`${title}: тариф не задан, в сумму не входит.`);
      return;
    }
    const unitPrice = tierAtQty(rows, quantity);
    lines.push({
      key,
      title,
      quantity,
      unit: 'шт',
      unitPrice: roundMoney(unitPrice),
      total: roundMoney(unitPrice * quantity),
    });
  };

  extra('weeding', 'Выборка', input.weeding, tariff.weeding_tiers);
  extra('mounting', 'Накатка монтажной плёнки', input.mounting, tariff.mounting_tiers);
  extra('proof', 'Проверка', input.proof, tariff.proof_tiers);

  const total = roundMoney(lines.reduce((sum, line) => sum + line.total, 0));
  return {
    mode,
    lines,
    total,
    unitPrice: quantity > 0 ? roundMoney(total / quantity) : 0,
    warnings,
    knifePathM: 0,
    feedM,
    sheetsNeeded,
    multiplier,
    levelName,
    cellLongSideMm,
  };
}
