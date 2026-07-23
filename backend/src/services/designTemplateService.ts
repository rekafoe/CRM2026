import { getDb } from '../config/database'
import { resolveTemplateCategory } from './designTemplateCategoryResolve'
import { enrichSpecWithRequiredFonts } from './designFontService'
import {
  allocateNextDesignCode,
  isValidDesignCode,
} from './designCodeService'

export interface DesignTemplateRow {
  id: number
  design_code: string
  name: string
  description: string | null
  category_id: number | null
  category: string | null
  preview_url: string | null
  site_preview_url: string | null
  spec: string | null
  is_active: number
  sort_order: number
  author_user_id: number | null
  usage_fee: number
  author_percent: number
  created_at: string
  updated_at: string
}

export type DesignTemplateListRow = DesignTemplateRow & {
  author_name?: string | null
  /** Число строк в product_subtype_designs для этого шаблона */
  subtype_link_count?: number
}

export interface DesignTemplateSpec {
  width_mm?: number
  height_mm?: number
  page_count?: number
  /** flat (полиграфия) | souvenir_3d (сувенирка). Default flat. */
  editorKind?: 'flat' | 'souvenir_3d'
  [key: string]: unknown
}

export interface DesignTemplateInput {
  name?: string
  /** 6-значный код семьи; если не задан при create — выделяется автоматически */
  design_code?: string
  description?: string
  /** Предпочтительно: FK на design_template_categories */
  category_id?: number | null
  /** Устаревшее: имя категории (разрешается в category_id при записи) */
  category?: string
  preview_url?: string | null
  /** Управляемое превью для карточек сайта. Не перезаписывается SVG reimport. */
  site_preview_url?: string | null
  spec?: DesignTemplateSpec
  is_active?: boolean
  sort_order?: number
  author_user_id?: number | null
  usage_fee?: number
  author_percent?: number
}

const PUBLIC_TEMPLATE_COLUMNS = `
  dt.id, dt.design_code, dt.name, dt.description, dt.category_id,
  COALESCE(c.name, dt.category) AS category,
  dt.preview_url, dt.site_preview_url, dt.spec,
  dt.is_active, dt.sort_order, dt.usage_fee, dt.created_at, dt.updated_at
`.trim()

const PUBLIC_TEMPLATE_JOIN = 'design_templates dt LEFT JOIN design_template_categories c ON c.id = dt.category_id'

/** product_subtype_designs + шаблон + категория (нельзя JOIN PUBLIC_TEMPLATE_JOIN — там уже есть LEFT JOIN). */
const PUBLIC_TEMPLATE_FROM_SUBTYPE_LINK = `
  product_subtype_designs psd
  INNER JOIN design_templates dt ON dt.id = psd.design_template_id
  LEFT JOIN design_template_categories c ON c.id = dt.category_id
`.trim()

function normalizeUsageFee(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function normalizeAuthorPercent(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
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

/** Public: отдаём usage_fee, скрываем author_user_id / author_percent. */
function stripAuthorRoyaltyFields(row: DesignTemplateRow): DesignTemplateRow {
  const { author_user_id: _a, author_percent: _p, ...rest } = row as DesignTemplateRow & {
    author_user_id?: number | null
    author_percent?: number
  }
  return rest as DesignTemplateRow
}

async function enrichPublicTemplateSpec(spec: string | null): Promise<string | null> {
  if (!spec) return spec
  try {
    const parsed = JSON.parse(spec) as Record<string, unknown>
    const enriched = await enrichSpecWithRequiredFonts(parsed)
    return JSON.stringify(enriched)
  } catch {
    return spec
  }
}

/**
 * Лёгкий spec для сетки каталога: без designState / fabricJSON / шрифтов.
 * Полный designState — только в GET /public/:id (редактор).
 */
function toPublicListSpec(spec: string | null): string | null {
  if (!spec) return null
  try {
    const parsed = JSON.parse(spec) as Record<string, unknown>
    const designState =
      parsed.designState && typeof parsed.designState === 'object' && !Array.isArray(parsed.designState)
        ? (parsed.designState as Record<string, unknown>)
        : null
    const pages = Array.isArray(designState?.pages) ? designState.pages.length : 0
    const pageCount = Math.max(
      pages,
      Math.floor(Number(designState?.pageCount)) || 0,
      Math.floor(Number(parsed.page_count)) || 0,
    )
    const light: Record<string, unknown> = {}
    for (const key of ['productId', 'typeId', 'sizeId', 'width_mm', 'height_mm'] as const) {
      if (parsed[key] != null) light[key] = parsed[key]
    }
    if (pageCount > 0) light.page_count = pageCount
    const importMeta = parsed.import
    if (importMeta && typeof importMeta === 'object' && !Array.isArray(importMeta)) {
      const imp = importMeta as Record<string, unknown>
      light.import = {
        ...(imp.status != null ? { status: imp.status } : {}),
        ...(Array.isArray(imp.warnings) ? { warnings: imp.warnings.slice(0, 5) } : {}),
      }
    }
    return Object.keys(light).length > 0 ? JSON.stringify(light) : null
  } catch {
    return null
  }
}

async function enrichPublicTemplateRow(row: DesignTemplateRow): Promise<DesignTemplateRow> {
  const stripped = stripPrivateImportFields(stripAuthorRoyaltyFields(row))
  return {
    ...stripped,
    spec: await enrichPublicTemplateSpec(stripped.spec),
  }
}

function mapPublicListRow(row: DesignTemplateRow): DesignTemplateRow {
  const stripped = stripAuthorRoyaltyFields(row)
  return {
    ...stripped,
    spec: toPublicListSpec(stripped.spec),
  }
}

function mapListRow(row: Record<string, unknown>): DesignTemplateListRow {
  const designCode = row.design_code != null ? String(row.design_code) : ''
  return {
    id: Number(row.id),
    design_code: designCode,
    name: String(row.name ?? designCode),
    description: row.description != null ? String(row.description) : null,
    category_id: row.category_id != null ? Number(row.category_id) : null,
    category: row.category != null ? String(row.category) : null,
    preview_url: row.preview_url != null ? String(row.preview_url) : null,
    site_preview_url: row.site_preview_url != null ? String(row.site_preview_url) : null,
    spec: row.spec != null ? String(row.spec) : null,
    is_active: Number(row.is_active) ? 1 : 0,
    sort_order: Number(row.sort_order) || 0,
    author_user_id: row.author_user_id != null ? Number(row.author_user_id) : null,
    usage_fee: normalizeUsageFee(row.usage_fee),
    author_percent: normalizeAuthorPercent(row.author_percent),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    author_name: row.author_name != null ? String(row.author_name) : null,
    subtype_link_count:
      row.subtype_link_count != null ? Number(row.subtype_link_count) || 0 : undefined,
  }
}

function parseSpecMm(spec: string | null | undefined): { width_mm: number; height_mm: number } | null {
  if (!spec) return null
  try {
    const parsed = JSON.parse(spec) as Record<string, unknown>
    const w = Number(parsed.width_mm)
    const h = Number(parsed.height_mm)
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      return { width_mm: w, height_mm: h }
    }
  } catch {
    /* noop */
  }
  return null
}

function rowHasPublicPreview(row: DesignTemplateRow): boolean {
  const site = String(row.site_preview_url ?? '').trim()
  const preview = String(row.preview_url ?? '').trim()
  return Boolean(site || preview)
}

/**
 * Одна карточка на design_code.
 * Превью общее для семьи: берём site_preview_url / preview_url с любого варианта.
 */
function dedupePublicByDesignCode(rows: DesignTemplateRow[]): DesignTemplateRow[] {
  const groups = new Map<string, DesignTemplateRow[]>()
  const order: string[] = []
  for (const row of rows) {
    const code = String((row as { design_code?: string }).design_code ?? '').trim()
    const key = code || `id:${row.id}`
    if (!groups.has(key)) {
      order.push(key)
      groups.set(key, [])
    }
    groups.get(key)!.push(row)
  }

  return order.map((key) => {
    const group = groups.get(key) ?? []
    const preferred = group.find(rowHasPublicPreview) ?? group[0]!
    const siteDonor = group.find((r) => String(r.site_preview_url ?? '').trim())
    const previewDonor = group.find((r) => String(r.preview_url ?? '').trim())
    return {
      ...preferred,
      site_preview_url: preferred.site_preview_url || siteDonor?.site_preview_url || null,
      preview_url: preferred.preview_url || previewDonor?.preview_url || null,
    }
  })
}

export async function getDesignTemplatesByIds(ids: number[]): Promise<Map<number, DesignTemplateRow>> {
  const map = new Map<number, DesignTemplateRow>()
  if (ids.length === 0) return map
  const db = await getDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT * FROM design_templates WHERE id IN (${placeholders})`,
    ids,
  ) as DesignTemplateRow[]
  rows.forEach((row) => map.set(row.id, mapListRow(row as unknown as Record<string, unknown>)))
  return map
}

export async function getDesignTemplatesByCode(designCode: string): Promise<DesignTemplateListRow[]> {
  if (!isValidDesignCode(designCode)) return []
  const db = await getDb()
  const rows = await db.all(
    `SELECT dt.*, u.name AS author_name, COALESCE(c.name, dt.category) AS category,
      (SELECT COUNT(*) FROM product_subtype_designs psd WHERE psd.design_template_id = dt.id) AS subtype_link_count
     FROM design_templates dt
     LEFT JOIN design_template_categories c ON c.id = dt.category_id
     LEFT JOIN users u ON u.id = dt.author_user_id
     WHERE dt.design_code = ?
     ORDER BY dt.sort_order ASC, dt.id ASC`,
    [designCode],
  ) as Record<string, unknown>[]
  return rows.map(mapListRow)
}

async function syncFamilyRoyaltyFields(
  designCode: string,
  fields: {
    author_user_id: number | null
    usage_fee: number
    author_percent: number
  },
  exceptId?: number,
): Promise<void> {
  if (!isValidDesignCode(designCode)) return
  const db = await getDb()
  if (exceptId != null) {
    await db.run(
      `UPDATE design_templates SET
        author_user_id = ?, usage_fee = ?, author_percent = ?, updated_at = datetime('now')
       WHERE design_code = ? AND id != ?`,
      [fields.author_user_id, fields.usage_fee, fields.author_percent, designCode, exceptId],
    )
  } else {
    await db.run(
      `UPDATE design_templates SET
        author_user_id = ?, usage_fee = ?, author_percent = ?, updated_at = datetime('now')
       WHERE design_code = ?`,
      [fields.author_user_id, fields.usage_fee, fields.author_percent, designCode],
    )
  }
}

/** Превью для сайта — общее на всю семью design_code. */
async function syncFamilySitePreviewUrl(
  designCode: string,
  sitePreviewUrl: string | null,
  exceptId?: number,
): Promise<void> {
  if (!isValidDesignCode(designCode)) return
  const db = await getDb()
  if (exceptId != null) {
    await db.run(
      `UPDATE design_templates SET
        site_preview_url = ?, updated_at = datetime('now')
       WHERE design_code = ? AND id != ?`,
      [sitePreviewUrl, designCode, exceptId],
    )
  } else {
    await db.run(
      `UPDATE design_templates SET
        site_preview_url = ?, updated_at = datetime('now')
       WHERE design_code = ?`,
      [sitePreviewUrl, designCode],
    )
  }
}

/**
 * Размазать site_preview_url по семьям, где оно есть хотя бы у одного варианта.
 * Нужно для уже существующих данных до введения общей превью.
 */
let familySitePreviewBackfillDone = false
async function ensureFamilySitePreviewBackfill(): Promise<void> {
  if (familySitePreviewBackfillDone) return
  familySitePreviewBackfillDone = true
  const db = await getDb()
  const donors = await db.all(
    `SELECT design_code, site_preview_url
     FROM design_templates
     WHERE design_code IS NOT NULL
       AND TRIM(design_code) != ''
       AND site_preview_url IS NOT NULL
       AND TRIM(site_preview_url) != ''
     GROUP BY design_code
     HAVING COUNT(*) >= 1`,
  ) as Array<{ design_code: string; site_preview_url: string }>

  for (const donor of donors) {
    const code = String(donor.design_code ?? '').trim()
    const url = String(donor.site_preview_url ?? '').trim()
    if (!isValidDesignCode(code) || !url) continue
    await db.run(
      `UPDATE design_templates SET
        site_preview_url = ?, updated_at = datetime('now')
       WHERE design_code = ?
         AND (site_preview_url IS NULL OR TRIM(site_preview_url) = '')`,
      [url, code],
    )
  }
}

export async function getAllDesignTemplates(): Promise<DesignTemplateListRow[]> {
  const db = await getDb()
  const rows = await db.all(
    `SELECT dt.*, u.name AS author_name,
      COALESCE(c.name, dt.category) AS category,
      (SELECT COUNT(*) FROM product_subtype_designs psd WHERE psd.design_template_id = dt.id) AS subtype_link_count
     FROM design_templates dt
     LEFT JOIN design_template_categories c ON c.id = dt.category_id
     LEFT JOIN users u ON u.id = dt.author_user_id
     ORDER BY dt.sort_order ASC, dt.name ASC`,
  ) as Record<string, unknown>[]
  return rows.map(mapListRow)
}

export async function getDesignTemplatesByCategory(category: string): Promise<DesignTemplateListRow[]> {
  const db = await getDb()
  const byId = Number(category)
  const rows = await db.all(
    Number.isFinite(byId) && byId > 0
      ? `SELECT dt.*, u.name AS author_name, COALESCE(c.name, dt.category) AS category
         FROM design_templates dt
         LEFT JOIN design_template_categories c ON c.id = dt.category_id
         LEFT JOIN users u ON u.id = dt.author_user_id
         WHERE dt.category_id = ? AND dt.is_active = 1
         ORDER BY dt.sort_order ASC, dt.name ASC`
      : `SELECT dt.*, u.name AS author_name, COALESCE(c.name, dt.category) AS category
         FROM design_templates dt
         LEFT JOIN design_template_categories c ON c.id = dt.category_id
         LEFT JOIN users u ON u.id = dt.author_user_id
         WHERE COALESCE(c.name, dt.category) = ? AND dt.is_active = 1
         ORDER BY dt.sort_order ASC, dt.name ASC`,
    [Number.isFinite(byId) && byId > 0 ? byId : category],
  ) as Record<string, unknown>[]
  return rows.map(mapListRow)
}

export async function getDesignTemplate(id: number): Promise<DesignTemplateListRow | null> {
  const db = await getDb()
  const row = await db.get(
    `SELECT dt.*, u.name AS author_name, COALESCE(c.name, dt.category) AS category
     FROM design_templates dt
     LEFT JOIN design_template_categories c ON c.id = dt.category_id
     LEFT JOIN users u ON u.id = dt.author_user_id
     WHERE dt.id = ?`,
    [id],
  ) as Record<string, unknown> | undefined
  if (!row) return null
  const mapped = mapListRow(row)
  if (!mapped.spec) return mapped
  try {
    const parsed = JSON.parse(mapped.spec) as Record<string, unknown>
    const enriched = await enrichSpecWithRequiredFonts(parsed)
    return { ...mapped, spec: JSON.stringify(enriched) }
  } catch {
    return mapped
  }
}

export async function getPublicDesignTemplate(id: number): Promise<DesignTemplateRow | null> {
  const db = await getDb()
  const row = await db.get(
    `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
     FROM ${PUBLIC_TEMPLATE_JOIN}
     WHERE dt.id = ? AND dt.is_active = 1`,
    [id],
  ) as DesignTemplateRow | undefined
  return row ? await enrichPublicTemplateRow(row) : null
}

export async function getPublicDesignTemplates(params: {
  productId?: number
  typeId?: number
  sizeId?: string
}): Promise<DesignTemplateRow[]> {
  await ensureFamilySitePreviewBackfill()
  const db = await getDb()
  let rows: DesignTemplateRow[]
  if (params.productId && params.typeId) {
    const sizeId = params.sizeId != null ? String(params.sizeId).trim() : ''
    if (sizeId) {
      rows = await db.all(
        `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
         FROM ${PUBLIC_TEMPLATE_FROM_SUBTYPE_LINK}
         WHERE psd.product_id = ? AND psd.type_id = ? AND psd.size_id = ? AND dt.is_active = 1
         ORDER BY psd.sort_order ASC, dt.sort_order ASC, dt.name ASC`,
        [params.productId, params.typeId, sizeId],
      ) as DesignTemplateRow[]
      const legacy = await db.all(
        `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
         FROM ${PUBLIC_TEMPLATE_FROM_SUBTYPE_LINK}
         WHERE psd.product_id = ? AND psd.type_id = ? AND (psd.size_id IS NULL OR psd.size_id = '') AND dt.is_active = 1`,
        [params.productId, params.typeId],
      ) as DesignTemplateRow[]
      // Legacy-линки без size_id: только если в spec явно указан тот же sizeId.
      // Раньше `spec.sizeId == null` попадал в ответ для ЛЮБОГО размера →
      // на сайте размер без sibling семьи ошибочно считался доступным.
      const legacyFiltered = legacy.filter((row) => {
        try {
          const spec = row.spec ? JSON.parse(row.spec) as Record<string, unknown> : {}
          return spec.sizeId != null && String(spec.sizeId) === sizeId
        } catch {
          return false
        }
      })
      const seen = new Set(rows.map((r) => r.id))
      for (const row of legacyFiltered) {
        if (!seen.has(row.id)) rows.push(row)
      }
    } else {
      rows = await db.all(
        `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
         FROM ${PUBLIC_TEMPLATE_FROM_SUBTYPE_LINK}
         WHERE psd.product_id = ? AND psd.type_id = ? AND dt.is_active = 1
         ORDER BY psd.size_id ASC, psd.sort_order ASC, dt.sort_order ASC, dt.name ASC`,
        [params.productId, params.typeId],
      ) as DesignTemplateRow[]
    }
  } else {
    rows = await db.all(
      `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
       FROM ${PUBLIC_TEMPLATE_JOIN}
       WHERE dt.is_active = 1
       ORDER BY dt.sort_order ASC, dt.design_code ASC, dt.name ASC`,
    ) as DesignTemplateRow[]
  }

  // Без sizeId — одна карточка на семью; с sizeId уже отфильтрованы варианты размера.
  const prepared = params.sizeId
    ? rows
    : dedupePublicByDesignCode(rows)

  // List: без designState и без enrich шрифтов (иначе N× listDesignFonts на каждый макет).
  return prepared.map((row) => mapPublicListRow(row))
}

/**
 * Лёгкий список size_id для семьи design_code (вместо N полных public list при открытии калькулятора).
 */
export async function getPublicAvailableSizeIdsForDesignCode(params: {
  productId: number
  typeId: number
  designCode: string
}): Promise<string[]> {
  const designCode = params.designCode.trim()
  if (!designCode || !Number.isFinite(params.productId) || !Number.isFinite(params.typeId)) {
    return []
  }
  const db = await getDb()
  const rows = await db.all(
    `SELECT DISTINCT psd.size_id AS size_id
     FROM product_subtype_designs psd
     INNER JOIN design_templates dt ON dt.id = psd.design_template_id
     WHERE psd.product_id = ?
       AND psd.type_id = ?
       AND dt.design_code = ?
       AND dt.is_active = 1
       AND psd.size_id IS NOT NULL
       AND TRIM(psd.size_id) != ''
     ORDER BY psd.size_id ASC`,
    [params.productId, params.typeId, designCode],
  ) as Array<{ size_id: string | null }>
  return rows
    .map((row) => String(row.size_id ?? '').trim())
    .filter(Boolean)
}

/**
 * Один вариант семьи по design_code + size (без списка всех макетов subtype).
 */
export async function getPublicDesignTemplateByCodeAndSize(params: {
  productId: number
  typeId: number
  designCode: string
  sizeId: string
}): Promise<DesignTemplateRow | null> {
  const designCode = params.designCode.trim()
  const sizeId = String(params.sizeId ?? '').trim()
  if (!designCode || !sizeId) return null
  const db = await getDb()
  const row = await db.get(
    `SELECT ${PUBLIC_TEMPLATE_COLUMNS}
     FROM ${PUBLIC_TEMPLATE_FROM_SUBTYPE_LINK}
     WHERE psd.product_id = ?
       AND psd.type_id = ?
       AND psd.size_id = ?
       AND dt.design_code = ?
       AND dt.is_active = 1
     ORDER BY psd.sort_order ASC, dt.sort_order ASC, dt.id ASC
     LIMIT 1`,
    [params.productId, params.typeId, sizeId, designCode],
  ) as DesignTemplateRow | undefined
  return row ? mapPublicListRow(row) : null
}

async function resolveInputCategory(
  input: Pick<DesignTemplateInput, 'category_id' | 'category'>,
  createIfNameMissing = false,
): Promise<{ category_id: number | null; category: string | null }> {
  if (input.category_id === null && (input.category === undefined || input.category === '')) {
    return { category_id: null, category: null }
  }
  const resolved = await resolveTemplateCategory({
    category_id: input.category_id,
    category: input.category,
    createIfNameMissing,
  })
  return { category_id: resolved.category_id, category: resolved.category_name }
}

export async function createDesignTemplate(input: DesignTemplateInput): Promise<DesignTemplateListRow> {
  const db = await getDb()
  const spec = input.spec ? JSON.stringify(input.spec) : null
  const cat = await resolveInputCategory(input, true)
  let designCode = input.design_code?.trim() ?? ''
  if (!isValidDesignCode(designCode)) {
    designCode = await allocateNextDesignCode()
  }
  const name = (input.name?.trim() || designCode)
  const result = await db.run(
    `INSERT INTO design_templates (
      design_code, name, description, category_id, category, preview_url, site_preview_url, spec, is_active, sort_order,
      author_user_id, usage_fee, author_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      designCode,
      name,
      input.description ?? null,
      cat.category_id,
      cat.category,
      input.preview_url ?? null,
      input.site_preview_url ?? null,
      spec,
      input.is_active !== false ? 1 : 0,
      input.sort_order ?? 0,
      input.author_user_id ?? null,
      normalizeUsageFee(input.usage_fee),
      normalizeAuthorPercent(input.author_percent),
    ],
  )
  const id = (result as { lastID: number }).lastID

  // Если в семье уже есть royalty — подтянуть; иначе при явном input — размазать на семью.
  const siblings = await getDesignTemplatesByCode(designCode)
  const siblingWithRoyalty = siblings.find((s) => s.id !== id)
  if (siblingWithRoyalty) {
    const fee = input.usage_fee !== undefined
      ? normalizeUsageFee(input.usage_fee)
      : siblingWithRoyalty.usage_fee
    const pct = input.author_percent !== undefined
      ? normalizeAuthorPercent(input.author_percent)
      : siblingWithRoyalty.author_percent
    const author = input.author_user_id !== undefined
      ? input.author_user_id
      : siblingWithRoyalty.author_user_id
    await syncFamilyRoyaltyFields(designCode, {
      author_user_id: author ?? null,
      usage_fee: fee,
      author_percent: pct,
    })
  } else if (
    input.usage_fee !== undefined
    || input.author_percent !== undefined
    || input.author_user_id !== undefined
  ) {
    await syncFamilyRoyaltyFields(designCode, {
      author_user_id: input.author_user_id ?? null,
      usage_fee: normalizeUsageFee(input.usage_fee),
      author_percent: normalizeAuthorPercent(input.author_percent),
    })
  }

  // Превью для сайта — общее на семью.
  const siblingSitePreview = siblings.find((s) => s.id !== id && String(s.site_preview_url ?? '').trim())
  if (input.site_preview_url !== undefined) {
    await syncFamilySitePreviewUrl(designCode, input.site_preview_url ?? null)
  } else if (siblingSitePreview?.site_preview_url) {
    await syncFamilySitePreviewUrl(designCode, siblingSitePreview.site_preview_url)
  }

  const created = await getDesignTemplate(id)
  if (!created) throw new Error('Failed to fetch created template')
  return created
}

export async function updateDesignTemplate(
  id: number,
  input: Partial<DesignTemplateInput>,
): Promise<DesignTemplateListRow | null> {
  const existing = await getDesignTemplate(id)
  if (!existing) return null

  const name = input.name ?? existing.name
  const description = input.description !== undefined ? input.description : existing.description
  let category_id = existing.category_id
  let category = existing.category
  if (input.category_id !== undefined || input.category !== undefined) {
    const cat = await resolveInputCategory(
      {
        category_id: input.category_id !== undefined ? input.category_id : existing.category_id,
        category: input.category !== undefined ? input.category : existing.category,
      },
      false,
    )
    category_id = cat.category_id
    category = cat.category
  }
  const preview_url = input.preview_url !== undefined ? input.preview_url : existing.preview_url
  const site_preview_url = input.site_preview_url !== undefined
    ? input.site_preview_url
    : existing.site_preview_url
  let spec = input.spec !== undefined
    ? (typeof input.spec === 'string' ? input.spec : JSON.stringify(input.spec))
    : existing.spec
  if (input.spec !== undefined && spec) {
    try {
      const parsed = typeof spec === 'string' ? JSON.parse(spec) as Record<string, unknown> : spec
      const enriched = await enrichSpecWithRequiredFonts(parsed)
      spec = JSON.stringify(enriched)
    } catch {
      // keep original spec if JSON invalid
    }
  }
  const is_active = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active
  const sort_order = input.sort_order !== undefined ? input.sort_order : existing.sort_order
  const author_user_id = input.author_user_id !== undefined
    ? input.author_user_id
    : existing.author_user_id
  const usage_fee = input.usage_fee !== undefined
    ? normalizeUsageFee(input.usage_fee)
    : existing.usage_fee
  const author_percent = input.author_percent !== undefined
    ? normalizeAuthorPercent(input.author_percent)
    : existing.author_percent
  const design_code = existing.design_code

  const db = await getDb()
  await db.run(
    `UPDATE design_templates SET
      name = ?, description = ?, category_id = ?, category = ?, preview_url = ?, site_preview_url = ?, spec = ?,
      is_active = ?, sort_order = ?, author_user_id = ?, usage_fee = ?, author_percent = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      name, description, category_id, category, preview_url, site_preview_url, spec,
      is_active, sort_order, author_user_id, usage_fee, author_percent, id,
    ],
  )

  if (
    input.usage_fee !== undefined
    || input.author_percent !== undefined
    || input.author_user_id !== undefined
  ) {
    await syncFamilyRoyaltyFields(design_code, {
      author_user_id: author_user_id ?? null,
      usage_fee,
      author_percent,
    })
  }

  if (input.site_preview_url !== undefined) {
    await syncFamilySitePreviewUrl(design_code, site_preview_url ?? null)
  }

  return getDesignTemplate(id)
}

export { parseSpecMm }
export { isValidDesignCode } from './designCodeService'

export async function deleteDesignTemplate(id: number): Promise<boolean> {
  const existing = await getDesignTemplate(id)
  if (!existing) return false

  const db = await getDb()
  await db.run('DELETE FROM design_templates WHERE id = ?', [id])
  return true
}
