import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'

/**
 * Копия только блока «Печать» с другого размера (технология по умолчанию + все строки print_prices с диапазонами).
 * Габариты размера, материалы, отделка не копируются.
 */
export function clonePrintBlockFromSize(
  source: SimplifiedSizeConfig,
): Pick<SimplifiedSizeConfig, 'default_print' | 'print_prices'> {
  const print_prices = (source.print_prices || []).map((pp) => ({
    technology_code: pp.technology_code,
    color_mode: pp.color_mode,
    sides_mode: pp.sides_mode,
    tiers: (pp.tiers || []).map((t) => ({
      min_qty: t.min_qty,
      max_qty: t.max_qty,
      unit_price: t.unit_price,
    })),
  }))
  const default_print = source.default_print
    ? { ...source.default_print }
    : undefined
  return { default_print, print_prices }
}
