/**
 * Ламинация только обложки многостраничного изделия.
 * Объём — физические листы обложки (одна плёнка на лист), не листы блока.
 */

import type { Database } from 'sqlite';
import { PricingServiceRepository } from '../repositories/serviceRepository';
import {
  finishingFinKey,
  loadFinishingRollWidthMmMap,
  quotePerM2Finishing,
} from './finishingPerM2';

export type CoverLaminationQuote = {
  serviceId: number;
  serviceName: string;
  variantId?: number;
  priceUnit: string;
  unitPrice: number;
  units: number;
  total: number;
  feedMeters?: number;
};

function statusError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function tierRate(
  tiers: Array<{ minQuantity: number; rate: number; isActive?: boolean }>,
  quantity: number,
): number | null {
  const active = tiers.filter((tier) => tier.isActive !== false);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => a.minQuantity - b.minQuantity);
  let best = sorted[0];
  for (const tier of sorted) {
    if (tier.minQuantity <= quantity) best = tier;
    else break;
  }
  return Number(best.rate);
}

type DbLike = {
  get: Database['get'];
  all: Database['all'];
};

export async function quoteCoverLamination(
  db: DbLike,
  params: {
    serviceId: number;
    variantId?: number;
    orderQuantity: number;
    /** Физические листы обложки на весь тираж. Оборот без печати сюда не входит. */
    coverSheetsTotal: number;
    trimMm: { width: number; height: number };
    bleedMm?: number;
    margins?: { edgeMm: number; gapMm: number };
  },
): Promise<CoverLaminationQuote> {
  const serviceId = Number(params.serviceId);
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    throw statusError('Некорректная ламинация обложки', 400);
  }

  const service = await db.get<{
    id: number;
    name?: string | null;
    operation_type?: string | null;
    price_unit?: string | null;
    price?: number | null;
    min_quantity?: number | null;
    is_active?: number | null;
  }>(
    `SELECT id, name, operation_type, price_unit, price, min_quantity, is_active
     FROM post_processing_services WHERE id = ?`,
    [serviceId],
  );
  if (!service) throw statusError('Ламинация обложки не найдена', 400);
  if (Number(service.is_active) === 0) throw statusError('Ламинация обложки выключена', 400);
  const operation = String(service.operation_type || '').toLowerCase();
  if (operation === 'bind' || operation === 'print' || operation === 'printing') {
    throw statusError('Для ламинации обложки нужна услуга ламинации, не переплёт и не печать', 400);
  }

  const variantId =
    params.variantId != null && Number.isFinite(Number(params.variantId)) && Number(params.variantId) > 0
      ? Number(params.variantId)
      : undefined;
  const priceUnit = String(service.price_unit || 'per_item').trim().toLowerCase();
  const orderQuantity = Math.max(1, Math.floor(Number(params.orderQuantity)) || 1);
  const coverSheetsTotal = Math.max(0, Math.floor(Number(params.coverSheetsTotal)) || 0);
  const minQty = Number(service.min_quantity ?? 0);
  if (coverSheetsTotal <= 0) {
    return {
      serviceId,
      serviceName: service.name || 'Ламинация обложки',
      ...(variantId != null ? { variantId } : {}),
      priceUnit,
      unitPrice: Number(service.price ?? 0),
      units: 0,
      total: 0,
    };
  }

  const widthMap = await loadFinishingRollWidthMmMap(
    db as Database,
    [{ service_id: serviceId, variant_id: variantId }],
    [serviceId],
  );
  const filmLayout = {
    trimMm: params.trimMm,
    bleedMm: Math.max(0, Number(params.bleedMm) || 0),
    quantity: coverSheetsTotal,
    margins: {
      edgeMm: Math.max(0, Number(params.margins?.edgeMm) || 0),
      gapMm: Math.max(0, Number(params.margins?.gapMm) || 0),
    },
  };
  const filmProbe =
    priceUnit === 'per_m2' || priceUnit === 'per_meter'
      ? quotePerM2Finishing({
          rollWidthMm: widthMap.get(finishingFinKey(serviceId, variantId)),
          layout: filmLayout,
          rate: 0,
        })
      : null;

  const volume =
    priceUnit === 'per_m2'
      ? Number(filmProbe?.rawUnits ?? 0)
      : priceUnit === 'per_meter'
        ? Number(filmProbe?.feedMeters ?? 0)
        : priceUnit === 'per_sheet'
          ? coverSheetsTotal
          : priceUnit === 'fixed' || priceUnit === 'per_order' || priceUnit === 'per_hour'
            ? 1
            : orderQuantity;

  let tiers = await PricingServiceRepository.listServiceTiers(serviceId, variantId);
  if ((!tiers || tiers.length === 0) && variantId != null) {
    tiers = await PricingServiceRepository.listServiceTiers(serviceId);
  }
  const fromTier = tierRate(
    (tiers ?? []).map((tier) => ({
      minQuantity: tier.minQuantity,
      rate: tier.rate,
      isActive: tier.isActive,
    })),
    volume,
  );
  const rate = fromTier != null ? fromTier : Number(service.price ?? 0);

  if (priceUnit === 'per_m2' || priceUnit === 'per_meter') {
    const quoted = quotePerM2Finishing({
      rollWidthMm: widthMap.get(finishingFinKey(serviceId, variantId)),
      layout: filmLayout,
      rate: priceUnit === 'per_m2' ? rate : 0,
      serviceMinQty: priceUnit === 'per_m2' && Number.isFinite(minQty) ? minQty : 0,
      serviceLabel: service.name || 'Ламинация обложки',
    });
    if (priceUnit === 'per_meter') {
      const meters = Number.isFinite(minQty) && minQty > 0
        ? Math.max(quoted.feedMeters, minQty)
        : quoted.feedMeters;
      return {
        serviceId,
        serviceName: service.name || 'Ламинация обложки',
        ...(variantId != null ? { variantId } : {}),
        priceUnit,
        unitPrice: rate,
        units: meters,
        total: Math.round(rate * meters * 100) / 100,
        feedMeters: quoted.feedMeters,
      };
    }
    return {
      serviceId,
      serviceName: service.name || 'Ламинация обложки',
      ...(variantId != null ? { variantId } : {}),
      priceUnit,
      unitPrice: rate,
      units: quoted.totalUnits,
      total: Math.round(quoted.servicePrice * 100) / 100,
      feedMeters: quoted.feedMeters,
    };
  }

  const billed = Number.isFinite(minQty) && minQty > 0 ? Math.max(volume, minQty) : volume;
  return {
    serviceId,
    serviceName: service.name || 'Ламинация обложки',
    ...(variantId != null ? { variantId } : {}),
    priceUnit,
    unitPrice: rate,
    units: billed,
    total: Math.round(rate * billed * 100) / 100,
  };
}
