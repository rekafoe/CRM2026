/** Утилиты отображения рулонных материалов: ширина × намотка (напр. 630×50 м). */

export function isRollMaterial(material: {
  material_kind?: string | null
  unit?: string | null
}): boolean {
  if (material.material_kind === 'roll') return true
  const unit = String(material.unit || '').trim().toLowerCase()
  return unit === 'м' || unit === 'm' || unit === 'meter' || unit === 'meters' || unit === 'пог.м' || unit === 'пог. м'
}

export function formatMeters(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return Number.isInteger(num) ? String(num) : String(Math.round(num * 100) / 100)
}

/**
 * Формат остатка рулона: «630×50 м» (ширина мм × намотка пог. м).
 * Если ширины нет — только «50 м».
 */
export function formatRollStockLabel(material: {
  sheet_width?: number | null
  quantity?: number | null
}): string {
  const meters = formatMeters(material.quantity ?? 0)
  const width = Number(material.sheet_width)
  if (Number.isFinite(width) && width > 0) {
    const widthLabel = Number.isInteger(width) ? String(width) : String(Math.round(width))
    return `${widthLabel}×${meters} м`
  }
  return `${meters} м`
}

/** Подпись колонки/поля остатка для рулона vs обычного материала. */
export function materialStockFieldLabel(material: {
  material_kind?: string | null
  unit?: string | null
}): string {
  return isRollMaterial(material) ? 'Намотка' : 'Количество'
}
