import { getDb } from '../config/database'

export interface DesignTemplateRow {
  id: number
  name: string
  description: string | null
  category: string | null
  preview_url: string | null
  spec: string | null
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DesignTemplateSpec {
  width_mm?: number
  height_mm?: number
  page_count?: number
  [key: string]: unknown
}

export interface DesignTemplateInput {
  name: string
  description?: string
  category?: string
  preview_url?: string
  spec?: DesignTemplateSpec
  is_active?: boolean
  sort_order?: number
}

function stripPrivateImportFields(row: DesignTemplateRow): DesignTemplateRow {
  if (!row.spec) return row
  try {
    const spec = JSON.parse(row.spec) as Record<string, unknown>
    const importMeta = spec.import as Record<string, unknown> | undefined
    if (importMeta && typeof importMeta === 'object') {
      delete importMeta.sourceFile
      delete importMeta.sourceFileUrl
      delete importMeta.sourceOriginalName
      delete importMeta.sourceSize
    }
    return { ...row, spec: JSON.stringify(spec) }
  } catch {
    return row
  }
}

export async function getAllDesignTemplates(): Promise<DesignTemplateRow[]> {
  const db = await getDb()
  const rows = await db.all(
    'SELECT * FROM design_templates ORDER BY sort_order ASC, name ASC'
  ) as DesignTemplateRow[]
  return rows
}

export async function getDesignTemplatesByCategory(category: string): Promise<DesignTemplateRow[]> {
  const db = await getDb()
  const rows = await db.all(
    'SELECT * FROM design_templates WHERE category = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC',
    [category]
  ) as DesignTemplateRow[]
  return rows
}

export async function getDesignTemplate(id: number): Promise<DesignTemplateRow | null> {
  const db = await getDb()
  const row = await db.get('SELECT * FROM design_templates WHERE id = ?', [id]) as DesignTemplateRow | undefined
  return row ?? null
}

export async function getPublicDesignTemplate(id: number): Promise<DesignTemplateRow | null> {
  const db = await getDb()
  const row = await db.get(
    'SELECT * FROM design_templates WHERE id = ? AND is_active = 1',
    [id],
  ) as DesignTemplateRow | undefined
  return row ? stripPrivateImportFields(row) : null
}

export async function getPublicDesignTemplates(params: {
  productId?: number
  typeId?: number
  sizeId?: string
}): Promise<DesignTemplateRow[]> {
  const db = await getDb()
  let rows: DesignTemplateRow[]
  if (params.productId && params.typeId) {
    rows = await db.all(
      `SELECT dt.*
       FROM product_subtype_designs psd
       JOIN design_templates dt ON dt.id = psd.design_template_id
       WHERE psd.product_id = ? AND psd.type_id = ? AND dt.is_active = 1
       ORDER BY psd.sort_order ASC, dt.sort_order ASC, dt.name ASC`,
      [params.productId, params.typeId],
    ) as DesignTemplateRow[]
  } else {
    rows = await db.all(
      'SELECT * FROM design_templates WHERE is_active = 1 ORDER BY sort_order ASC, name ASC',
    ) as DesignTemplateRow[]
  }

  const filteredRows = !params.sizeId ? rows : rows.filter((row) => {
    try {
      const spec = row.spec ? JSON.parse(row.spec) as Record<string, unknown> : {}
      return spec.sizeId == null || String(spec.sizeId) === params.sizeId
    } catch {
      return true
    }
  })
  return filteredRows.map(stripPrivateImportFields)
}

export async function createDesignTemplate(input: DesignTemplateInput): Promise<DesignTemplateRow> {
  const db = await getDb()
  const spec = input.spec ? JSON.stringify(input.spec) : null
  const result = await db.run(
    `INSERT INTO design_templates (name, description, category, preview_url, spec, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.preview_url ?? null,
      spec,
      input.is_active !== false ? 1 : 0,
      input.sort_order ?? 0,
    ]
  )
  const id = (result as any).lastID
  const created = await getDesignTemplate(id)
  if (!created) throw new Error('Failed to fetch created template')
  return created
}

export async function updateDesignTemplate(id: number, input: Partial<DesignTemplateInput>): Promise<DesignTemplateRow | null> {
  const existing = await getDesignTemplate(id)
  if (!existing) return null

  const name = input.name ?? existing.name
  const description = input.description !== undefined ? input.description : existing.description
  const category = input.category !== undefined ? input.category : existing.category
  const preview_url = input.preview_url !== undefined ? input.preview_url : existing.preview_url
  const spec = input.spec !== undefined
    ? (typeof input.spec === 'string' ? input.spec : JSON.stringify(input.spec))
    : existing.spec
  const is_active = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active
  const sort_order = input.sort_order !== undefined ? input.sort_order : existing.sort_order

  const db = await getDb()
  await db.run(
    `UPDATE design_templates SET
      name = ?, description = ?, category = ?, preview_url = ?, spec = ?,
      is_active = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [name, description, category, preview_url, spec, is_active, sort_order, id]
  )
  return getDesignTemplate(id)
}

export async function deleteDesignTemplate(id: number): Promise<boolean> {
  const existing = await getDesignTemplate(id)
  if (!existing) return false

  const db = await getDb()
  await db.run('DELETE FROM design_templates WHERE id = ?', [id])
  return true
}

