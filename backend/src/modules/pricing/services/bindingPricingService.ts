import { PricingServiceRepository } from '../repositories/serviceRepository';

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
      const err: any = new Error('Переплёт не найден');
      err.status = 404;
      throw err;
    }

    let variantName: string | undefined;
    if (variantId != null) {
      const variants = await PricingServiceRepository.listServiceVariants(serviceId);
      const variant = variants.find((v) => Number(v.id) === variantId);
      if (!variant) {
        const err: any = new Error('Вариант переплёта не найден');
        err.status = 404;
        throw err;
      }
      await PricingServiceRepository.assertVariantPricingLeaf(serviceId, variantId);
      variantName = variant.variantName;
    }

    const billableUnits = quantity * unitsPerItem;
    let tiers = await PricingServiceRepository.listServiceTiers(serviceId, variantId);
    if ((!tiers || tiers.length === 0) && variantId != null) {
      tiers = await PricingServiceRepository.listServiceTiers(serviceId);
    }

    const tierPrice = resolveTierPrice(
      tiers.map((t) => ({ minQuantity: t.minQuantity, rate: t.rate })),
      billableUnits
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

