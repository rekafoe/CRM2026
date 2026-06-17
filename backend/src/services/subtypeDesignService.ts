import { getDb } from '../config/database'
import { getDesignTemplate, updateDesignTemplate } from './designTemplateService'

export interface SubtypeDesignRow {
  id: number
  product_id: number
  type_id: number
  size_id: string
  design_template_id: number
  sort_order: number
  created_at: string
  name: string
  description: string | null
  category: string | null
  preview_url: string | null
  site_preview_url: string | null
  spec: string | null
  is_active: number
}

function normalizeSizeId(sizeId?: string | null): string {
  return String(sizeId ?? '').trim()
}

async function syncTemplateSpecBinding(
  designTemplateId: number,
  productId: number,
  typeId: number,
  sizeId: string,
): Promise<void> {
  const template = await getDesignTemplate(designTemplateId)
  if (!template?.spec) return
  try {
    const spec = JSON.parse(template.spec) as Record<string, unknown>
    await updateDesignTemplate(designTemplateId, {
      spec: {
        ...spec,
        productId,
        typeId,
        sizeId: sizeId || spec.sizeId,
      },
    })
  } catch {
    // ignore invalid spec
  }
}

export async function getSubtypeDesigns(
  productId: number,
  typeId: number,
  sizeId?: string,
): Promise<SubtypeDesignRow[]> {
  const db = await getDb()
  const normalizedSize = normalizeSizeId(sizeId)
  if (normalizedSize) {
    return db.all<SubtypeDesignRow[]>(
      `SELECT
         psd.id, psd.product_id, psd.type_id, psd.size_id, psd.design_template_id, psd.sort_order, psd.created_at,
         dt.name, dt.description, dt.category, dt.preview_url, dt.site_preview_url, dt.spec, dt.is_active
       FROM product_subtype_designs psd
       JOIN design_templates dt ON dt.id = psd.design_template_id
       WHERE psd.product_id = ? AND psd.type_id = ? AND psd.size_id = ?
       ORDER BY psd.sort_order ASC, psd.id ASC`,
      productId,
      typeId,
      normalizedSize,
    )
  }
  return db.all<SubtypeDesignRow[]>(
    `SELECT
       psd.id, psd.product_id, psd.type_id, psd.size_id, psd.design_template_id, psd.sort_order, psd.created_at,
       dt.name, dt.description, dt.category, dt.preview_url, dt.site_preview_url, dt.spec, dt.is_active
     FROM product_subtype_designs psd
     JOIN design_templates dt ON dt.id = psd.design_template_id
     WHERE psd.product_id = ? AND psd.type_id = ?
     ORDER BY psd.size_id ASC, psd.sort_order ASC, psd.id ASC`,
    productId,
    typeId,
  )
}

export async function addSubtypeDesign(
  productId: number,
  typeId: number,
  designTemplateId: number,
  sizeId: string,
): Promise<SubtypeDesignRow> {
  const normalizedSize = normalizeSizeId(sizeId)
  if (!normalizedSize) {
    throw new Error('sizeId обязателен: привязка дизайна выполняется к конкретному размеру подтипа')
  }

  const db = await getDb()
  const maxOrder = await db.get<{ max_order: number | null }>(
    `SELECT MAX(sort_order) as max_order FROM product_subtype_designs
     WHERE product_id = ? AND type_id = ? AND size_id = ?`,
    productId,
    typeId,
    normalizedSize,
  )
  const sortOrder = (maxOrder?.max_order ?? -1) + 1

  const result = await db.run(
    `INSERT INTO product_subtype_designs (product_id, type_id, size_id, design_template_id, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    productId,
    typeId,
    normalizedSize,
    designTemplateId,
    sortOrder,
  )

  await syncTemplateSpecBinding(designTemplateId, productId, typeId, normalizedSize)

  const row = await db.get<SubtypeDesignRow>(
    `SELECT
       psd.id, psd.product_id, psd.type_id, psd.size_id, psd.design_template_id, psd.sort_order, psd.created_at,
       dt.name, dt.description, dt.category, dt.preview_url, dt.site_preview_url, dt.spec, dt.is_active
     FROM product_subtype_designs psd
     JOIN design_templates dt ON dt.id = psd.design_template_id
     WHERE psd.id = ?`,
    result.lastID,
  )
  if (!row) throw new Error('Не удалось добавить дизайн к размеру подтипа')
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
  sizeId: string,
  orderedLinkIds: number[],
): Promise<void> {
  const normalizedSize = normalizeSizeId(sizeId)
  const db = await getDb()
  for (let i = 0; i < orderedLinkIds.length; i++) {
    await db.run(
      `UPDATE product_subtype_designs SET sort_order = ?
       WHERE id = ? AND product_id = ? AND type_id = ? AND size_id = ?`,
      i,
      orderedLinkIds[i],
      productId,
      typeId,
      normalizedSize,
    )
  }
}

/** Размеры подтипа без ни одного привязанного дизайна */
export async function getSubtypeSizesMissingDesigns(
  productId: number,
  typeId: number,
  sizeIds: string[],
): Promise<string[]> {
  const normalized = sizeIds.map(normalizeSizeId).filter(Boolean)
  if (normalized.length === 0) return []

  const db = await getDb()
  const rows = await db.all<Array<{ size_id: string; n: number }>>(
    `SELECT size_id, COUNT(*) AS n FROM product_subtype_designs
     WHERE product_id = ? AND type_id = ? AND size_id IN (${normalized.map(() => '?').join(',')})
     GROUP BY size_id`,
    productId,
    typeId,
    ...normalized,
  )
  const covered = new Set((rows ?? []).filter((r) => r.n > 0).map((r) => r.size_id))
  return normalized.filter((id) => !covered.has(id))
}
