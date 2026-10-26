import {
  PriceTypeDTO,
  CreatePriceTypeDTO,
  UpdatePriceTypeDTO,
} from '../dtos/priceType.dto';
import { PriceTypeRepository } from '../repositories/priceTypeRepository';

function filterPriceTypeKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let key = '';
    if (typeof entry === 'string' || typeof entry === 'number') {
      key = String(entry).trim().toLowerCase();
    } else if (entry && typeof entry === 'object') {
      const row = entry as { key?: unknown; id?: unknown; value?: unknown };
      key = String(row.key ?? row.id ?? row.value ?? '').trim().toLowerCase();
    }
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Эффективный allow-list типа цены: продукт ∩ подтип (как CRM/Mini App UI).
 * Пустой список = без ограничения на уровне шаблона (тогда действуют только is_active).
 */
export function resolveAllowedPriceTypeKeys(opts: {
  productAllowed?: unknown;
  subtypeAllowed?: unknown;
}): string[] {
  const product = filterPriceTypeKeys(opts.productAllowed);
  const subtype = filterPriceTypeKeys(opts.subtypeAllowed);
  if (subtype.length === 0) return product;
  if (product.length === 0) return subtype;
  const subtypeSet = new Set(subtype);
  return product.filter((key) => subtypeSet.has(key));
}

/** Ключи из constraints шаблона (overrides или корень). */
export function productAllowedPriceTypesFromConstraints(constraints: unknown): string[] {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return [];
  const root = constraints as {
    allowed_price_types?: unknown;
    overrides?: { allowed_price_types?: unknown };
  };
  const fromOverrides = filterPriceTypeKeys(root.overrides?.allowed_price_types);
  if (fromOverrides.length > 0) return fromOverrides;
  return filterPriceTypeKeys(root.allowed_price_types);
}

/**
 * Клиентский priceType → ключ для биллинга.
 * Не из allow-list / неактивный / неизвестный → standard (×1), без throw:
 * иначе quoteLines глотает ошибку и website create оставляет клиентский underpay.
 */
export function sanitizePriceTypeKeyForBilling(
  rawKey: unknown,
  allowedKeys: string[],
  priceType: Pick<PriceTypeDTO, 'key' | 'isActive'> | null | undefined,
): string {
  const requested = String(rawKey ?? 'standard').trim().toLowerCase() || 'standard';
  if (allowedKeys.length > 0 && !allowedKeys.includes(requested)) {
    return 'standard';
  }
  if (!priceType || !priceType.isActive) {
    return 'standard';
  }
  return priceType.key;
}

export class PriceTypeService {
  static list(activeOnly = false): Promise<PriceTypeDTO[]> {
    return PriceTypeRepository.list(activeOnly);
  }

  static getById(id: number): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.getById(id);
  }

  static getByKey(key: string): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.getByKey(key);
  }

  static create(payload: CreatePriceTypeDTO): Promise<PriceTypeDTO> {
    return PriceTypeRepository.create(payload);
  }

  static update(id: number, payload: UpdatePriceTypeDTO): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.update(id, payload);
  }

  static delete(id: number): Promise<boolean> {
    return PriceTypeRepository.delete(id);
  }

  /** Множитель по ключу (для расчётов). Fallback 1 если не найден или выключен. */
  static async getMultiplier(key: string): Promise<number> {
    const pt = await PriceTypeRepository.getByKey(key);
    if (!pt || !pt.isActive) return 1;
    const mult = Number(pt.multiplier);
    return Number.isFinite(mult) && mult > 0 ? mult : 1;
  }
}
