import { getDb } from '../../db'

export interface PriceRule {
  min_qty: number
  max_qty?: number
  unit_price?: number
  discount_percent?: number
}

export interface TemplateConfig {
  trim_size?: { width: number | string; height: number | string }
  finishing?: Array<{ name: string }>
  packaging?: Array<{ name: string }>
  print_run?: { enabled?: boolean; min?: number; max?: number }
  price_rules?: PriceRule[]
  print_sheet?:
    | { key?: string; width?: number; height?: number }
    | string; // ключ стандартного формата
}

export async function getTemplateConfig(productId: number): Promise<TemplateConfig | null> {
  const db = await getDb()
  try {
    const row = await db.get(
      `SELECT config_data FROM product_configs WHERE product_id = ? AND name = 'template' AND is_active = 1 ORDER BY id DESC LIMIT 1`,
      productId
    )
    if (!row || !row.config_data) return null
    try { return JSON.parse(row.config_data) as TemplateConfig } catch { return null }
  } catch {
    return null
  }
}

export function applyPriceRulesBySheets(
  cfg: TemplateConfig | null,
  sheets: number,
  currentSubtotal: number
): { subtotal: number; ruleApplied?: PriceRule } {
  if (!cfg || !Array.isArray(cfg.price_rules) || cfg.price_rules.length === 0) {
    return { subtotal: currentSubtotal }
  }

  const rules = cfg.price_rules
    .map(r => ({
      min_qty: Number(r.min_qty || 0),
      max_qty: r.max_qty !== undefined && r.max_qty !== null ? Number(r.max_qty) : undefined,
      unit_price: r.unit_price !== undefined && r.unit_price !== null ? Number(r.unit_price) : undefined,
      discount_percent: r.discount_percent !== undefined && r.discount_percent !== null ? Number(r.discount_percent) : undefined
    }))
    .sort((a, b) => a.min_qty - b.min_qty)

  const rule = rules.find(r => sheets >= r.min_qty && (r.max_qty === undefined || sheets <= r.max_qty))
  if (!rule) return { subtotal: currentSubtotal }

  // Приоритет unit_price: цена за лист печати
  if (rule.unit_price !== undefined) {
    const newSubtotal = Math.max(0, sheets * Number(rule.unit_price))
    return { subtotal: newSubtotal, ruleApplied: rule }
  }

  // Иначе дисконт на текущую стоимость
  if (rule.discount_percent !== undefined) {
    const factor = Math.max(0, 1 - Number(rule.discount_percent) / 100)
    const newSubtotal = Math.max(0, currentSubtotal * factor)
    return { subtotal: newSubtotal, ruleApplied: rule }
  }

  return { subtotal: currentSubtotal }
}

export function getPrintSheetSizeFromConfig(cfg: TemplateConfig | null): { width: number; height: number } | null {
  if (!cfg || !cfg.print_sheet) return null
  const v = cfg.print_sheet as any
  if (typeof v === 'string') {
    // базовые ключи
    if (v === 'SRA3') return { width: 320, height: 450 }
    if (v === 'A3') return { width: 297, height: 420 }
    if (v === 'B3') return { width: 353, height: 500 }
    if (v === 'B2') return { width: 500, height: 707 }
    return null
  }
  const w = Number(v.width || 0)
  const h = Number(v.height || 0)
  if (w > 0 && h > 0) return { width: w, height: h }
  return null
}


