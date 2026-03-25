import type { DesignTemplate } from '../../../api'
import type { SimplifiedPagesConfig, SimplifiedSizeConfig } from '../hooks/useProductTemplate'

/** Размеры и число страниц из spec / designState шаблона редактора */
export type ParsedTemplateDimensions = {
  width_mm: number
  height_mm: number
  page_count: number
}

/**
 * Читает мм и page_count из design_templates.spec (учитывает сохранённый designState).
 */
export function parseDesignTemplateDimensions(template: DesignTemplate): ParsedTemplateDimensions | null {
  try {
    const raw = template.spec
    if (raw == null || raw === '') return null
    const spec = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : { ...(raw as object) }
    const ds = spec.designState as Record<string, unknown> | undefined
    const w = Number(ds?.pageWidth ?? spec.width_mm)
    const h = Number(ds?.pageHeight ?? spec.height_mm)
    const pc = Number(ds?.pageCount ?? spec.page_count ?? 1)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return {
      width_mm: w,
      height_mm: h,
      page_count: Number.isFinite(pc) && pc >= 1 ? Math.min(99, Math.floor(pc)) : 1,
    }
  } catch {
    return null
  }
}

/** Два прямоугольника совпадают с точностью до поворота на 90° (одинаковая пара сторон). */
export function sizeMatchesTrimFormat(
  widthMm: number,
  heightMm: number,
  sizes: SimplifiedSizeConfig[],
): boolean {
  if (!sizes.length) return true
  const a = Math.min(widthMm, heightMm)
  const b = Math.max(widthMm, heightMm)
  return sizes.some((s) => {
    const x = Math.min(s.width_mm, s.height_mm)
    const y = Math.max(s.width_mm, s.height_mm)
    return Math.abs(a - x) < 0.01 && Math.abs(b - y) < 0.01
  })
}

/** Если заданы варианты числа страниц у подтипа — проверяем попадание. */
export function pageCountAllowedForSubtype(
  pageCount: number,
  pagesConfig: SimplifiedPagesConfig | undefined,
): boolean {
  if (!pagesConfig?.options?.length) return true
  return pagesConfig.options.some((n) => Number(n) === pageCount)
}
