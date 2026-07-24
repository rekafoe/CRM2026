import { getDb } from '../config/database'
import { createEditorDraft } from './publicEditorDraftService'
import { hasColumn, invalidateTableSchemaCache } from '../utils/tableSchemaCache'

export interface CustomerProjectRow {
  id: number
  customer_id: number
  title: string | null
  design_state_json: string | null
  photo_batch_json: string | null
  source_order_id: number | null
  source_order_item_id: number | null
  editor_draft_token: string | null
  design_template_id: number | null
  editor_mode: string | null
  editable: number
  expires_at: string
  created_at: string
  updated_at: string
  product_id?: number | null
  type_id?: number | null
  size_id?: string | null
  resume_json?: string | null
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function oneYearFromNow(): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString()
}

async function ensureCustomerProjectResumeColumns(): Promise<void> {
  const db = await getDb()
  if (!(await hasColumn('customer_projects', 'product_id').catch(() => false))) {
    await db.exec('ALTER TABLE customer_projects ADD COLUMN product_id INTEGER')
  }
  if (!(await hasColumn('customer_projects', 'type_id').catch(() => false))) {
    await db.exec('ALTER TABLE customer_projects ADD COLUMN type_id INTEGER')
  }
  if (!(await hasColumn('customer_projects', 'size_id').catch(() => false))) {
    await db.exec('ALTER TABLE customer_projects ADD COLUMN size_id TEXT')
  }
  if (!(await hasColumn('customer_projects', 'resume_json').catch(() => false))) {
    await db.exec('ALTER TABLE customer_projects ADD COLUMN resume_json TEXT')
  }
  invalidateTableSchemaCache('customer_projects')
}

export async function createCustomerProjectFromOrderItem(input: {
  customerId: number
  orderId: number
  orderItemId: number
  title?: string
  editable?: boolean
}): Promise<CustomerProjectRow | null> {
  await ensureCustomerProjectResumeColumns()
  const db = await getDb()
  const item = await db.get<{ params: string | null }>(
    'SELECT params FROM items WHERE id = ? AND orderId = ?',
    [input.orderItemId, input.orderId],
  )
  if (!item?.params) return null

  let params: Record<string, unknown> = {}
  try {
    params = JSON.parse(item.params) as Record<string, unknown>
  } catch {
    return null
  }

  const designState = params.designState
  const photoBatch = params.photoBatch
  if (!designState && !photoBatch) return null

  const productId =
    params.productId != null
      ? Number(params.productId)
      : (params.crmProductId != null ? Number(params.crmProductId) : null)
  const typeId = params.typeId != null ? Number(params.typeId) : null
  const sizeId =
    params.sizeId != null
      ? String(params.sizeId)
      : (params.size_id != null ? String(params.size_id) : null)
  const resume = {
    productId: Number.isFinite(productId) ? productId : null,
    typeId: Number.isFinite(typeId) ? typeId : null,
    sizeId,
    poligrafySlug: typeof params.poligrafySlug === 'string' ? params.poligrafySlug : null,
    poligrafyTypeIdParam:
      typeof params.poligrafyTypeIdParam === 'string'
        ? params.poligrafyTypeIdParam
        : (params.typeId != null ? String(params.typeId) : null),
    designEditorMode: typeof params.editorDraftMode === 'string' ? params.editorDraftMode : null,
    designTemplateId: params.designTemplateId != null ? Number(params.designTemplateId) : null,
  }

  const result = await db.run(
    `INSERT INTO customer_projects (
      customer_id, title, design_state_json, photo_batch_json,
      source_order_id, source_order_item_id, editor_draft_token,
      design_template_id, editor_mode, editable, expires_at, updated_at,
      product_id, type_id, size_id, resume_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`,
    [
      input.customerId,
      input.title ?? `Макет заказа #${input.orderId}`,
      designState ? JSON.stringify(designState) : null,
      photoBatch ? JSON.stringify(photoBatch) : null,
      input.orderId,
      input.orderItemId,
      typeof params.editorDraftToken === 'string' ? params.editorDraftToken : null,
      params.designTemplateId != null ? Number(params.designTemplateId) : null,
      typeof params.editorDraftMode === 'string' ? params.editorDraftMode : null,
      input.editable === false ? 0 : 1,
      oneYearFromNow(),
      Number.isFinite(productId as number) ? productId : null,
      Number.isFinite(typeId as number) ? typeId : null,
      sizeId,
      JSON.stringify(resume),
    ],
  )

  const row = await db.get<CustomerProjectRow>('SELECT * FROM customer_projects WHERE id = ?', result.lastID)
  return row ?? null
}

export async function listCustomerProjects(customerId: number): Promise<Array<CustomerProjectRow & {
  designState: unknown
  photoBatch: unknown
  resume: Record<string, unknown> | null
}>> {
  await ensureCustomerProjectResumeColumns()
  const db = await getDb()
  const rows = (await db.all(
    `SELECT * FROM customer_projects
     WHERE customer_id = ?
       AND datetime(expires_at) > datetime('now')
     ORDER BY datetime(created_at) DESC, id DESC`,
    [customerId],
  )) as CustomerProjectRow[]
  return rows.map((row) => ({
    ...row,
    designState: parseJson(row.design_state_json),
    photoBatch: parseJson(row.photo_batch_json),
    resume: (parseJson(row.resume_json ?? null) as Record<string, unknown> | null) ?? null,
  }))
}

export async function cloneCustomerProjectToDraft(
  projectId: number,
  options?: { customerId?: number | null },
): Promise<{ token: string; productId?: number | null; typeId?: number | null; sizeId?: string | null; resume?: Record<string, unknown> | null }> {
  await ensureCustomerProjectResumeColumns()
  const db = await getDb()
  const row = await db.get<CustomerProjectRow>('SELECT * FROM customer_projects WHERE id = ?', projectId)
  if (!row) throw new Error('Проект не найден')
  if (datetimeExpired(row.expires_at)) throw new Error('Срок хранения проекта истёк')

  const requiredCustomerId = options?.customerId != null ? Number(options.customerId) : null
  if (requiredCustomerId != null && Number.isFinite(requiredCustomerId)) {
    if (Number(row.customer_id) !== requiredCustomerId) {
      throw new Error('Проект принадлежит другому клиенту')
    }
  }

  const payload: Record<string, unknown> = {}
  const designState = parseJson(row.design_state_json)
  const photoBatch = parseJson(row.photo_batch_json)
  if (designState) payload.designState = designState
  if (photoBatch) payload.photoBatch = photoBatch
  if (row.title) payload.title = row.title

  const draft = await createEditorDraft({
    designTemplateId: row.design_template_id ?? undefined,
    productId: row.product_id ?? undefined,
    typeId: row.type_id ?? undefined,
    sizeId: row.size_id ?? undefined,
    mode: row.editor_mode ?? 'single',
    payload,
    customerId: row.customer_id,
  })

  return {
    token: draft.token,
    productId: row.product_id ?? null,
    typeId: row.type_id ?? null,
    sizeId: row.size_id ?? null,
    resume: (parseJson(row.resume_json ?? null) as Record<string, unknown> | null) ?? null,
  }
}

function datetimeExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const ms = Date.parse(expiresAt)
  return Number.isFinite(ms) && ms < Date.now()
}

export async function snapshotCustomerProjectsForOrder(
  orderId: number,
  customerId: number | null | undefined,
  itemIds: number[],
): Promise<void> {
  if (!customerId || !Number.isFinite(customerId)) return
  for (const orderItemId of itemIds) {
    await createCustomerProjectFromOrderItem({
      customerId,
      orderId,
      orderItemId,
      editable: false,
    })
  }
}
