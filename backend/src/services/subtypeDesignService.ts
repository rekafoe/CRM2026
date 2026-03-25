import { getDb } from '../config/database'

export interface SubtypeDesignRow {
  id: number
  product_id: number
  type_id: number
  design_template_id: number
  sort_order: number
  created_at: string
  // joined from design_templates
  name: string
  description: string | null
  category: string | null
  preview_url: string | null
  spec: string | null
  is_active: number
}

export async function getSubtypeDesigns(
  productId: number,
  typeId: number,
): Promise<SubtypeDesignRow[]> {
  const db = await getDb()
  return db.all<SubtypeDesignRow[]>(
    `SELECT
       psd.id, psd.product_id, psd.type_id, psd.design_template_id, psd.sort_order, psd.created_at,
       dt.name, dt.description, dt.category, dt.preview_url, dt.spec, dt.is_active
     FROM product_subtype_designs psd
     JOIN design_templates dt ON dt.id = psd.design_template_id
     WHERE psd.product_id = ? AND psd.type_id = ?
     ORDER BY psd.sort_order ASC, psd.id ASC`,
    productId,
    typeId,
  )
}

export async function addSubtypeDesign(
  productId: number,
  typeId: number,
  designTemplateId: number,
): Promise<SubtypeDesignRow> {
  const db = await getDb()
  const maxOrder = await db.get<{ max_order: number | null }>(
    'SELECT MAX(sort_order) as max_order FROM product_subtype_designs WHERE product_id = ? AND type_id = ?',
    productId,
    typeId,
  )
  const sortOrder = (maxOrder?.max_order ?? -1) + 1

  const result = await db.run(
    `INSERT INTO product_subtype_designs (product_id, type_id, design_template_id, sort_order)
     VALUES (?, ?, ?, ?)`,
    productId,
    typeId,
    designTemplateId,
    sortOrder,
  )

  const row = await db.get<SubtypeDesignRow>(
    `SELECT
       psd.id, psd.product_id, psd.type_id, psd.design_template_id, psd.sort_order, psd.created_at,
       dt.name, dt.description, dt.category, dt.preview_url, dt.spec, dt.is_active
     FROM product_subtype_designs psd
     JOIN design_templates dt ON dt.id = psd.design_template_id
     WHERE psd.id = ?`,
    result.lastID,
  )
  if (!row) throw new Error('Не удалось добавить дизайн к подтипу')
  return row
}

export async function removeSubtypeDesign(productId: number, linkId: number): Promise<void> {
  const db = await getDb()
  await db.run(
    'DELETE FROM product_subtype_designs WHERE id = ? AND product_id = ?',
    linkId,
    productId,
  )
}

export async function reorderSubtypeDesigns(
  productId: number,
  typeId: number,
  orderedLinkIds: number[],
): Promise<void> {
  const db = await getDb()
  for (let i = 0; i < orderedLinkIds.length; i++) {
    await db.run(
      'UPDATE product_subtype_designs SET sort_order = ? WHERE id = ? AND product_id = ? AND type_id = ?',
      i,
      orderedLinkIds[i],
      productId,
      typeId,
    )
  }
}
