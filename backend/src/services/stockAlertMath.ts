export type StockAlertLevel = 'critical' | 'out_of_stock'

export function configuredMinimum(minQuantity: unknown, minStockLevel: unknown): number | null {
  const primary = Number(minQuantity)
  if (Number.isFinite(primary) && primary > 0) return primary
  const fallback = Number(minStockLevel)
  if (Number.isFinite(fallback) && fallback > 0) return fallback
  return null
}

/** Ниже заданного минимума. Запас выше минимума алертом не становится, 10 не подставляется. */
export function alertLevelFor(available: number, minimum: number | null): StockAlertLevel | null {
  if (minimum == null || !(minimum > 0)) return null
  if (!(available > minimum)) {
    return available <= 0 ? 'out_of_stock' : 'critical'
  }
  return null
}

export function formatStockQty(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

export function formatStockAlertLine(input: {
  materialName: string
  currentQuantity: number
  minQuantity: number
  unit?: string | null
  warehouseLabel?: string | null
}): string {
  const unit = input.unit ? ` ${input.unit}` : ''
  const place = input.warehouseLabel ? ` · ${input.warehouseLabel}` : ''
  return `${input.materialName}: ${formatStockQty(input.currentQuantity)}${unit} / мин ${formatStockQty(input.minQuantity)}${place}`
}
