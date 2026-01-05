import { getDb } from '../config/database'

export interface MaterialCandidate {
  id: number
  name: string
  category_name?: string
  density?: number
  finish?: string | null
  price_per_sheet: number
  sheet_width?: number | null
  sheet_height?: number | null
  printable_width?: number | null
  printable_height?: number | null
  quantity: number
}

export interface ResolveSpecs {
  productId?: number
  trimSize: { width: number; height: number }
  printSheet?: 'SRA3' | 'A3' | 'B3' | 'B2' | { width: number; height: number }
  quantity: number
  constraints?: {
    materials?: {
      allowed_categories?: string[]
      density?: { min: number; max: number }
      finishes?: string[]
    }
    overrides?: { include_ids?: number[]; exclude_ids?: number[] }
  }
}

export interface ResolveResultItem {
  material: MaterialCandidate
  itemsPerSheet: number
  sheetsNeeded: number
  efficiency: number // itemsPerSheet / price_per_sheet
}

export interface ResolveResult {
  picked: ResolveResultItem | null
  candidates: ResolveResultItem[]
  excluded: Array<{ id: number; name: string; reasons: string[] }>
}

function getPresetSheetSize(preset: 'SRA3' | 'A3' | 'B3' | 'B2'): { width: number; height: number } {
  switch (preset) {
    case 'SRA3': return { width: 320, height: 450 }
    case 'A3': return { width: 297, height: 420 }
    case 'B3': return { width: 353, height: 500 }
    case 'B2': return { width: 500, height: 707 }
  }
}

function computeItemsPerSheet(
  trim: { width: number; height: number },
  printable: { width: number; height: number }
): number {
  // Технические поля согласно layoutCalculationService
  const MARGINS = {
    bleed: 2,      // 2мм на подрезку (bleed)
    gap: 2,        // 2мм между элементами
    gripper: 5     // 5мм на захват (только по ширине)
  }

  // Доступная область с учетом gripper margin (только по ширине)
  // Не используем edge margins, так как они слишком строгие для некоторых размеров
  const availableWidth = printable.width - MARGINS.gripper
  const availableHeight = printable.height

  // Функция расчета для одной ориентации
  const calculateSingleLayout = (itemW: number, itemH: number): number => {
    // Шаг размещения: размер изделия + gap между элементами
    // Bleed уже учтен в размере изделия (trim size), поэтому не добавляем его к шагу
    const stepW = itemW + MARGINS.gap
    const stepH = itemH + MARGINS.gap

    const cols = Math.floor(availableWidth / stepW)
    const rows = Math.floor(availableHeight / stepH)

    // Проверяем, действительно ли помещается раскладка с учетом bleed для крайних элементов
    // Общая ширина: cols элементов + bleed слева (между gripper и первым элементом) и справа + небольшой запас
    // Общая высота: rows элементов + bleed сверху и снизу + небольшой запас
    const SAFETY_MARGIN = 3 // 3мм запас для надежности
    const totalWidth = cols * stepW - MARGINS.gap + 2 * MARGINS.bleed + SAFETY_MARGIN
    const totalHeight = rows * stepH - MARGINS.gap + 2 * MARGINS.bleed + SAFETY_MARGIN

    // Если раскладка не помещается с учетом bleed и запаса, уменьшаем количество
    if (totalWidth > availableWidth) {
      // Пробуем уменьшить количество столбцов
      const newCols = Math.floor((availableWidth - 2 * MARGINS.bleed - SAFETY_MARGIN) / stepW)
      if (newCols < cols && newCols > 0) {
        return newCols * rows
      }
      return 0
    }
    if (totalHeight > availableHeight) {
      // Пробуем уменьшить количество строк
      const newRows = Math.floor((availableHeight - 2 * MARGINS.bleed - SAFETY_MARGIN) / stepH)
      if (newRows < rows && newRows > 0) {
        return cols * newRows
      }
      return 0
    }

    return cols * rows
  }

  // Проверяем оба варианта: обычный и с поворотом на 90°
  const variant1 = calculateSingleLayout(trim.width, trim.height)
  const variant2 = calculateSingleLayout(trim.height, trim.width)

  // Если вариант без поворота дает больше элементов, но разница небольшая (<= 4),
  // и вариант с поворотом более надежен, выбираем вариант с поворотом
  // Это обеспечивает более консервативный и надежный расчет
  if (variant1 > variant2 && variant1 - variant2 <= 4 && variant2 > 0) {
    // Проверяем, насколько близок вариант без поворота к границе
    const stepW1 = trim.width + MARGINS.gap
    const stepH1 = trim.height + MARGINS.gap
    const cols1 = Math.floor(availableWidth / stepW1)
    const rows1 = Math.floor(availableHeight / stepH1)
    const totalWidth1 = cols1 * stepW1 - MARGINS.gap + 2 * MARGINS.bleed
    const totalHeight1 = rows1 * stepH1 - MARGINS.gap + 2 * MARGINS.bleed
    
    // Если вариант без поворота близок к границе (остается менее 15мм запаса), выбираем вариант с поворотом
    // Это обеспечивает более надежный расчет для случаев, когда раскладка близка к границе
    const widthMargin = availableWidth - totalWidth1
    const heightMargin = availableHeight - totalHeight1
    if (widthMargin < 15 || heightMargin < 15) {
      return variant2
    }
  }

  // Возвращаем вариант с большим количеством изделий
  return Math.max(variant1, variant2)
}

export class CompatibilityService {
  static async resolveCompatibleMaterials(productId: number | undefined, specs: ResolveSpecs, topN: number = 10): Promise<ResolveResult> {
    const db = await getDb()
    const excluded: ResolveResult['excluded'] = []

    // Load product constraints if not provided
    let constraints = specs.constraints
    if (!constraints && productId) {
      try {
        const row = await db.get<any>(`SELECT constraints FROM product_configs WHERE id = ?`, productId)
        if (row?.constraints) constraints = JSON.parse(row.constraints)
      } catch {}
    }

    // Build base query
    const rows = await db.all<Array<MaterialCandidate & { sheet_price_single: number | null; finish: string | null }>>(
      `SELECT 
        m.id, m.name, m.quantity, 
        c.name as category_name,
        m.density,
        COALESCE(m.finish, pt.finish) as finish,
        COALESCE(m.sheet_price_single, 0) as price_per_sheet,
        m.sheet_width, m.sheet_height,
        m.printable_width, m.printable_height
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
       WHERE COALESCE(m.is_active, 1) = 1 AND m.quantity > 0`
    )

    const printSheetSize = typeof specs.printSheet === 'string'
      ? getPresetSheetSize(specs.printSheet)
      : specs.printSheet

    const candidates: ResolveResultItem[] = []

    for (const m of rows) {
      const reasons: string[] = []

      if (constraints?.overrides?.exclude_ids?.includes(m.id)) {
        reasons.push('excluded_by_override')
      }
      if (constraints?.overrides?.include_ids && !constraints.overrides.include_ids.includes(m.id)) {
        // only if include list present: exclude others
        reasons.push('not_in_include_list')
      }
      if (constraints?.materials?.allowed_categories && m.category_name && !constraints.materials.allowed_categories.includes(m.category_name)) {
        reasons.push('category_not_allowed')
      }
      if (constraints?.materials?.density) {
        const d = m.density ?? 0
        if (d < constraints.materials.density.min || d > constraints.materials.density.max) reasons.push('density_out_of_range')
      }
      if (constraints?.materials?.finishes && m.finish && !constraints.materials.finishes.includes(m.finish)) {
        reasons.push('finish_not_allowed')
      }

      // Determine printable area
      const printableW = (m.printable_width ?? undefined) || (printSheetSize?.width ?? m.sheet_width ?? null)
      const printableH = (m.printable_height ?? undefined) || (printSheetSize?.height ?? m.sheet_height ?? null)
      if (!printableW || !printableH) {
        reasons.push('no_printable_area')
      } else {
        const itemsPerSheet = computeItemsPerSheet(specs.trimSize, { width: printableW, height: printableH })
        if (itemsPerSheet <= 0) reasons.push('does_not_fit')
        if (reasons.length === 0) {
          const sheetsNeeded = Math.max(1, Math.ceil(specs.quantity / itemsPerSheet))
          const efficiency = itemsPerSheet / Math.max(0.0001, m.price_per_sheet)
          candidates.push({
            material: m,
            itemsPerSheet,
            sheetsNeeded,
            efficiency
          })
        }
      }

      if (reasons.length > 0) excluded.push({ id: m.id, name: m.name, reasons })
    }

    candidates.sort((a, b) => b.efficiency - a.efficiency || a.sheetsNeeded - b.sheetsNeeded)
    const top = candidates.slice(0, topN)
    return { picked: top[0] ?? null, candidates: top, excluded }
  }
}


