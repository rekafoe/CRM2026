import { getDb } from '../config/database'

export interface DesignTemplateCategoryRow {
  id: number
  name: string
  sort_order: number
  created_at: string
  template_count: number
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export async function getDesignTemplateCategories(): Promise<DesignTemplateCategoryRow[]> {
  const db = await getDb()
  const rows = await db.all<DesignTemplateCategoryRow[]>(
    `SELECT
      c.id,
      c.name,
      c.sort_order,
      c.created_at,
      COUNT(dt.id) AS template_count
     FROM design_template_categories c
     LEFT JOIN design_templates dt ON dt.category = c.name
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`,
  )
  return rows.map((row) => ({
    ...row,
    template_count: Number(row.template_count) || 0,
  }))
}

export async function createDesignTemplateCategory(name: string): Promise<DesignTemplateCategoryRow> {
  const db = await getDb()
  const normalized = normalizeName(name)
  if (!normalized) {
    throw new Error('Укажите название категории')
  }
  const maxOrder = await db.get<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM design_template_categories',
  )
  const sortOrder = (maxOrder?.m ?? -1) + 1
  const result = await db.run(
    'INSERT INTO design_template_categories (name, sort_order) VALUES (?, ?)',
    [normalized, sortOrder],
  )
  const id = (result as { lastID: number }).lastID
  const rows = await getDesignTemplateCategories()
  const created = rows.find((r) => r.id === id)
  if (!created) throw new Error('Не удалось создать категорию')
  return created
}

export async function updateDesignTemplateCategory(
  id: number,
  input: { name?: string; sort_order?: number },
): Promise<DesignTemplateCategoryRow | null> {
  const db = await getDb()
  const existing = await db.get<{ id: number; name: string; sort_order: number }>(
    'SELECT id, name, sort_order FROM design_template_categories WHERE id = ?',
    [id],
  )
  if (!existing) return null

  const newName = input.name != null ? normalizeName(input.name) : existing.name
  if (!newName) throw new Error('Название категории не может быть пустым')

  const sortOrder = input.sort_order !== undefined ? input.sort_order : existing.sort_order

  await db.run('BEGIN')
  try {
    if (newName !== existing.name) {
      await db.run(
        'UPDATE design_templates SET category = ? WHERE category = ?',
        [newName, existing.name],
      )
    }
    await db.run(
      'UPDATE design_template_categories SET name = ?, sort_order = ? WHERE id = ?',
      [newName, sortOrder, id],
    )
    await db.run('COMMIT')
  } catch (err) {
    await db.run('ROLLBACK')
    const msg = String((err as Error)?.message ?? err)
    if (msg.includes('UNIQUE')) {
      throw new Error('Категория с таким названием уже есть')
    }
    throw err
  }

  const rows = await getDesignTemplateCategories()
  return rows.find((r) => r.id === id) ?? null
}

export async function deleteDesignTemplateCategory(id: number): Promise<boolean> {
  const db = await getDb()
  const existing = await db.get<{ name: string }>(
    'SELECT name FROM design_template_categories WHERE id = ?',
    [id],
  )
  if (!existing) return false

  await db.run('BEGIN')
  try {
    await db.run(
      'UPDATE design_templates SET category = NULL WHERE category = ?',
      [existing.name],
    )
    await db.run('DELETE FROM design_template_categories WHERE id = ?', [id])
    await db.run('COMMIT')
    return true
  } catch {
    await db.run('ROLLBACK')
    throw new Error('Не удалось удалить категорию')
  }
}

export async function categoryNameExists(name: string, excludeId?: number): Promise<boolean> {
  const db = await getDb()
  const normalized = normalizeName(name)
  const row = await db.get<{ id: number }>(
    excludeId != null
      ? 'SELECT id FROM design_template_categories WHERE name = ? AND id != ?'
      : 'SELECT id FROM design_template_categories WHERE name = ?',
    excludeId != null ? [normalized, excludeId] : [normalized],
  )
  return Boolean(row)
}
