import { getDb } from '../config/database'
import { createDesignTemplateCategory } from './designTemplateCategoryService'

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export type ResolvedTemplateCategory = {
  category_id: number | null
  category_name: string | null
}

/**
 * Разрешает category_id и дублирующее текстовое поле category (для обратной совместимости).
 * Приоритет: category_id, затем category по имени (с опциональным созданием записи в справочнике).
 */
export async function resolveTemplateCategory(input: {
  category_id?: number | null
  category?: string | null
  createIfNameMissing?: boolean
}): Promise<ResolvedTemplateCategory> {
  const db = await getDb()

  if (input.category_id != null) {
    const id = Number(input.category_id)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('Некорректный ID категории')
    }
    const row = await db.get<{ name: string }>(
      'SELECT name FROM design_template_categories WHERE id = ?',
      [id],
    )
    if (!row) throw new Error('Категория не найдена')
    return { category_id: id, category_name: row.name }
  }

  const nameRaw = input.category != null ? normalizeName(String(input.category)) : ''
  if (!nameRaw) {
    return { category_id: null, category_name: null }
  }

  let row = await db.get<{ id: number; name: string }>(
    'SELECT id, name FROM design_template_categories WHERE name = ?',
    [nameRaw],
  )
  if (!row && input.createIfNameMissing) {
    const created = await createDesignTemplateCategory(nameRaw)
    row = { id: created.id, name: created.name }
  }
  if (!row) {
    throw new Error(`Категория «${nameRaw}» не найдена в справочнике`)
  }
  return { category_id: row.id, category_name: row.name }
}
