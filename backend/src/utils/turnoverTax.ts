/** УСН: 6% от оборота, начисление в налоговую за квартал. */
export const TURNOVER_TAX_RATE = 0.06

export function turnoverTaxAmount(revenue: number): number {
  const base = Number(revenue)
  if (!Number.isFinite(base) || base <= 0) return 0
  return Math.round(base * TURNOVER_TAX_RATE * 100) / 100
}
