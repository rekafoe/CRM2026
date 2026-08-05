import type { Material } from '../types/shared';

/** Минимальный остаток из карточки материала. */
export function getMaterialMinStock(material: Material): number {
  const min = Number(material.min_stock_level ?? (material as any).min_quantity);
  return Number.isFinite(min) && min > 0 ? min : 10;
}

/**
 * Сколько нужно принять, чтобы выйти на мин. остаток.
 * Если уже на минимуме или выше — предлагаем один «пакет» = мин. уровень.
 */
export function getSuggestedReplenishQty(material: Material): number {
  const qty = Number(material.quantity) || 0;
  const min = getMaterialMinStock(material);
  const toMin = Math.max(0, Math.round((min - qty) * 100) / 100);
  return toMin > 0 ? toMin : min;
}
