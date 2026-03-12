import { getDb } from '../config/database'

/** Ячейка раскладки: относительные координаты 0–1 */
export interface CollageLayoutCell {
  x: number
  y: number
  w: number
  h: number
}

export interface CollageLayout {
  cells: CollageLayoutCell[]
}

export interface CollageTemplateRow {
  id: number
  name: string | null
  photo_count: number
  layout: string
  padding_default: number
  sort_order: number
  is_active: number
  created_at: string
  updated_at: string
}

export interface CollageTemplateInput {
  name?: string
  photo_count: number
  layout: CollageLayout
  padding_default?: number
  sort_order?: number
  is_active?: boolean
}

function parseLayout(layout: string): CollageLayout {
  try {
    const parsed = JSON.parse(layout) as CollageLayout
    if (!Array.isArray(parsed?.cells)) return { cells: [] }
    return parsed
  } catch {
    return { cells: [] }
  }
}

export async function getCollageTemplates(filters?: {
  photo_count?: number
  only_suitable?: boolean
}): Promise<(CollageTemplateRow & { layoutParsed: CollageLayout })[]> {
  const db = await getDb()
  let sql = 'SELECT * FROM collage_templates WHERE is_active = 1'
  const params: (number | boolean)[] = []
  if (filters?.photo_count != null) {
    sql += ' AND photo_count = ?'
    params.push(filters.photo_count)
  }
  sql += ' ORDER BY sort_order ASC, id ASC'
  const rows = (await db.all(sql, params)) as CollageTemplateRow[]
  return rows.map((r) => ({
    ...r,
    layoutParsed: parseLayout(r.layout),
  }))
}

export async function getCollageTemplate(id: number): Promise<(CollageTemplateRow & { layoutParsed: CollageLayout }) | null> {
  const db = await getDb()
  const row = (await db.get('SELECT * FROM collage_templates WHERE id = ?', [id])) as CollageTemplateRow | undefined
  if (!row) return null
  return { ...row, layoutParsed: parseLayout(row.layout) }
}

export async function createCollageTemplate(input: CollageTemplateInput): Promise<CollageTemplateRow & { layoutParsed: CollageLayout }> {
  const db = await getDb()
  const layoutStr = JSON.stringify(input.layout)
  const result = await db.run(
    `INSERT INTO collage_templates (name, photo_count, layout, padding_default, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.name ?? null,
      input.photo_count,
      layoutStr,
      input.padding_default ?? 20,
      input.sort_order ?? 0,
      input.is_active !== false ? 1 : 0,
    ]
  )
  const id = (result as { lastID?: number }).lastID
  if (id == null) throw new Error('Failed to create collage template')
  const created = await getCollageTemplate(id)
  if (!created) throw new Error('Failed to fetch created template')
  return created
}

export async function updateCollageTemplate(
  id: number,
  input: Partial<CollageTemplateInput>
): Promise<(CollageTemplateRow & { layoutParsed: CollageLayout }) | null> {
  const existing = await getCollageTemplate(id)
  if (!existing) return null

  const name = input.name !== undefined ? input.name : existing.name
  const photo_count = input.photo_count !== undefined ? input.photo_count : existing.photo_count
  const layout = input.layout !== undefined ? JSON.stringify(input.layout) : existing.layout
  const padding_default = input.padding_default !== undefined ? input.padding_default : existing.padding_default
  const sort_order = input.sort_order !== undefined ? input.sort_order : existing.sort_order
  const is_active = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active

  const db = await getDb()
  await db.run(
    `UPDATE collage_templates SET
      name = ?, photo_count = ?, layout = ?, padding_default = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [name, photo_count, layout, padding_default, sort_order, is_active, id]
  )
  return getCollageTemplate(id)
}

export async function deleteCollageTemplate(id: number): Promise<boolean> {
  const existing = await getCollageTemplate(id)
  if (!existing) return false
  const db = await getDb()
  await db.run('DELETE FROM collage_templates WHERE id = ?', [id])
  return true
}
