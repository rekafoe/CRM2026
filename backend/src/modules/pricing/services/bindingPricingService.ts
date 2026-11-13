import { PricingServiceRepository } from '../repositories/serviceRepository';
import { flatFinishingUnits, isFlatFinishingPriceUnit } from './finishingQuantity';

const LAYOUT_BINDING_UNITS = new Set(['per_sheet', 'per_meter', 'per_m2', 'per_cut']);

function statusError(message: string, status: number): Error {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

function isLeafVariant(
  variants: Array<{ id: number; parentVariantId?: number | null }>,
  variantId: number,
): boolean {
  return !variants.some((variant) => Number(variant.parentVariantId) === Number(variantId));
}

export interface BindingQuoteRequest {
  serviceId: number;
  variantId?: number;
  quantity: number;
  unitsPerItem?: number;
}

export type TemplateBindingRef = {
  service_id?: number;
  variant_id?: number;
  units_per_item?: number;
};

/**
 * Источник переплёта для упрощённого расчёта.
 * На листовых продуктах client binding_service_id игнорируется: иначе id обязательной
 * отделки вырезается из finishing без BindingPricingService → undercharge.
 * В multi_page шаблон важнее клиента (service_id / units); variant клиент может выбрать.
 */
export function resolveConfiguredBindingInput(opts: {
  usePagesMultiplier: boolean;
  templateBinding?: TemplateBindingRef | null;
  clientBindingServiceId?: unknown;
  clientBindingVariantId?: unknown;
  clientBindingUnitsPerItem?: unknown;
}): { serviceId: number | null; variantId?: number; unitsPerItem: number } {
  if (!opts.usePagesMultiplier) {
    return { serviceId: null, unitsPerItem: 1 };
  }

  const templateSid = Number(opts.templateBinding?.service_id);
  const clientSid = Number(opts.clientBindingServiceId);
  const serviceId =
    Number.isFinite(templateSid) && templateSid > 0
      ? templateSid
      : Number.isFinite(clientSid) && clientSid > 0
        ? clientSid
        : null;

  if (serviceId == null) {
    return { serviceId: null, unitsPerItem: 1 };
  }

  const templateUnits = Number(opts.templateBinding?.units_per_item);
  const clientUnits = Number(opts.clientBindingUnitsPerItem);
  const unitsPerItem =
    Number.isFinite(templateUnits) && templateUnits > 0
      ? templateUnits
      : Number.isFinite(clientUnits) && clientUnits >= 1
        ? clientUnits
        : 1;

  const templateVid = Number(opts.templateBinding?.variant_id);
  const clientVid = Number(opts.clientBindingVariantId);
  const variantId =
    Number.isFinite(clientVid) && clientVid > 0
      ? clientVid
      : Number.isFinite(templateVid) && templateVid > 0
        ? templateVid
        : undefined;

  return {
    serviceId,
    ...(variantId != null ? { variantId } : {}),
    unitsPerItem,
  };
}

export interface BindingQuoteResult {
  serviceId: number;
  serviceName: string;
  variantId?: number;
  variantName?: string;
  priceUnit: string;
  unitPrice: number;
  units: number;
  total: number;
}

function resolveTierPrice(
  tiers: Array<{ minQuantity: number; rate: number }>,
  quantity: number
): number | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  let best = sorted[0];
  for (const tier of sorted) {
    if (tier.minQuantity <= quantity) {
      best = tier;
    } else {
      break;
    }
  }
  return Number(best.rate);
}

export class BindingPricingService {
  static async listBindingsDetailed() {
    const bindings = await PricingServiceRepository.listBindings();
    const result = await Promise.all(
      bindings.map(async (binding) => {
        const [variants, tiers] = await Promise.all([
          PricingServiceRepository.listServiceVariants(binding.id),
          PricingServiceRepository.listServiceTiers(binding.id),
        ]);
        return {
          ...binding,
          variants,
          tiers,
        };
      })
    );
    return result;
  }

  static async quoteBinding(request: BindingQuoteRequest): Promise<BindingQuoteResult> {
    const serviceId = Number(request.serviceId);
    const quantity = Number(request.quantity);
    const unitsPerItem = Number(request.unitsPerItem ?? 1);
    const variantId = request.variantId != null ? Number(request.variantId) : undefined;

    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      const err: any = new Error('Некорректный serviceId');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      const err: any = new Error('Некорректный quantity');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(unitsPerItem) || unitsPerItem <= 0) {
      const err: any = new Error('Некорректный unitsPerItem');
      err.status = 400;
      throw err;
    }

    const service = await PricingServiceRepository.getServiceById(serviceId);
    if (!service || String(service.operationType || '').toLowerCase() !== 'bind') {
      throw statusError('Переплёт не найден', 404);
    }
    if (service.isActive === false) {
      throw statusError('Переплёт выключен', 400);
    }

    const priceUnit = String(service.priceUnit || 'per_item').trim().toLowerCase();
    if (LAYOUT_BINDING_UNITS.has(priceUnit)) {
      throw statusError(`Единица «${priceUnit}» для переплёта не считается`, 400);
    }

    const variants = await PricingServiceRepository.listServiceVariants(serviceId);
    const activeLeaves = variants.filter(
      (variant) => variant.isActive !== false && isLeafVariant(variants, Number(variant.id)),
    );
    let variantName: string | undefined;
    if (variantId == null) {
      if (activeLeaves.length > 0) {
        throw statusError('Выберите лист переплёта', 400);
      }
    } else {
      const variant = variants.find((v) => Number(v.id) === variantId);
      if (!variant) {
        throw statusError('Вариант переплёта не найден', 404);
      }
      if (variant.isActive === false) {
        throw statusError('Вариант переплёта выключен', 400);
      }
      await PricingServiceRepository.assertVariantPricingLeaf(serviceId, variantId);
      variantName = variant.variantName;
    }

    const flatUnits = flatFinishingUnits(priceUnit, unitsPerItem);
    const perItem = !isFlatFinishingPriceUnit(priceUnit);
    if (perItem) {
      const minQuantity = Number(service.minQuantity ?? 1);
      const maxQuantity = service.maxQuantity != null ? Number(service.maxQuantity) : null;
      if (maxQuantity != null && Number.isFinite(maxQuantity) && quantity > maxQuantity) {
        throw statusError(
          `Тираж для операции "${service.name}" должен быть от ${minQuantity} до ${maxQuantity} шт`,
          400,
        );
      }
      if (Number.isFinite(minQuantity) && quantity < minQuantity) {
        throw statusError(
          `Тираж для операции "${service.name}" должен быть не меньше ${minQuantity} шт`,
          400,
        );
      }
    }

    const billableUnits = flatUnits != null ? flatUnits : quantity * unitsPerItem;
    let tiers = await PricingServiceRepository.listServiceTiers(serviceId, variantId);
    if ((!tiers || tiers.length === 0) && variantId != null) {
      tiers = await PricingServiceRepository.listServiceTiers(serviceId);
    }

    const tierPrice = resolveTierPrice(
      tiers.map((t) => ({ minQuantity: t.minQuantity, rate: t.rate })),
      quantity
    );
    const unitPrice = tierPrice != null ? tierPrice : Number(service.rate ?? 0);
    const total = unitPrice * billableUnits;

    return {
      serviceId,
      serviceName: service.name,
      ...(variantId != null ? { variantId } : {}),
      ...(variantName ? { variantName } : {}),
      priceUnit: service.priceUnit ?? 'per_item',
      unitPrice: Math.round(unitPrice * 10000) / 10000,
      units: Math.round(billableUnits * 10000) / 10000,
      total: Math.round(total * 100) / 100,
    };
  }
}

