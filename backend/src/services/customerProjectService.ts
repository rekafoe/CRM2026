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

export type CustomerProjectListDto = {
  id: number
  displayId: string
  title: string | null
  created_at: string
  updated_at: string
  expires_at: string
  source_order_id: number | null
  source_order_item_id?: number | null
  design_template_id: number | null
  editor_mode: string | null
  editable: boolean
  product_id: number | null
  type_id: number | null
  size_id: string | null
  resume: Record<string, unknown> | null
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function oneYearFromNow(): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString()
}

/** Стабильный публичный id макета в ЛК: web{project.id} */
export function customerProjectDisplayId(projectId: number): string {
  return `web${projectId}`
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

function readFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function readSizeId(params: Record<string, unknown>): string | null {
  if (params.sizeId != null && String(params.sizeId).trim()) return String(params.sizeId)
  if (params.size_id != null && String(params.size_id).trim()) return String(params.size_id)
  const specs = isRecord(params.specifications) ? params.specifications : null
  if (specs?.size_id != null && String(specs.size_id).trim()) return String(specs.size_id)
  if (specs?.sizeId != null && String(specs.sizeId).trim()) return String(specs.sizeId)
  return null
}

/** Контекст для повторного открытия редактора / калькулятора после дубля. */
export function buildCustomerProjectResume(
  params: Record<string, unknown>,
  quantity: number,
): Record<string, unknown> {
  const productId =
    readFiniteNumber(params.productId) ??
    readFiniteNumber(params.crmProductId)
  const typeId = readFiniteNumber(params.typeId)
  const sizeId = readSizeId(params)

  const selectedParams = isRecord(params.selectedParams)
    ? params.selectedParams
    : (isRecord(params.selectedEditorParams) ? params.selectedEditorParams : null)

  const configuration = isRecord(params.crmCalculateConfiguration)
    ? params.crmCalculateConfiguration
    : (isRecord(params.configuration) ? params.configuration : null)

  const editorPending = isRecord(params.editorPending) ? params.editorPending : null
  const fieldValues = isRecord(params.fieldValues)
    ? params.fieldValues
    : (editorPending && isRecord(editorPending.fieldValues) ? editorPending.fieldValues : null)
  const specifications = isRecord(params.specifications) ? params.specifications : null

  const qtyFromParams = readFiniteNumber(
    params.quantity ?? specifications?.quantity ?? editorPending?.quantity,
  )
  const resolvedQty =
    Number.isFinite(quantity) && quantity > 0
      ? quantity
      : (qtyFromParams != null && qtyFromParams > 0 ? qtyFromParams : 1)

  const priceType =
    typeof params.priceType === 'string' && params.priceType.trim()
      ? params.priceType.trim()
      : (typeof specifications?.priceType === 'string' && String(specifications.priceType).trim()
        ? String(specifications.priceType).trim()
        : (typeof editorPending?.priceType === 'string' ? editorPending.priceType : null))

  const slugFromPending =
    editorPending && typeof editorPending.slug === 'string' ? editorPending.slug : null
  const typeParamFromPending =
    editorPending && typeof editorPending.typeIdParam === 'string'
      ? editorPending.typeIdParam
      : null

  return {
    productId: productId != null && productId > 0 ? productId : null,
    typeId: typeId != null && Number.isFinite(typeId) ? typeId : null,
    sizeId:
      sizeId ??
      (editorPending && editorPending.sizeId != null && String(editorPending.sizeId).trim()
        ? String(editorPending.sizeId)
        : null),
    quantity: resolvedQty,
    priceType,
    poligrafySlug:
      typeof params.poligrafySlug === 'string' ? params.poligrafySlug : slugFromPending,
    poligrafyTypeIdParam:
      typeof params.poligrafyTypeIdParam === 'string'
        ? params.poligrafyTypeIdParam
        : (typeParamFromPending ?? (params.typeId != null ? String(params.typeId) : null)),
    designEditorMode:
      typeof params.editorDraftMode === 'string'
        ? params.editorDraftMode
        : (typeof editorPending?.designEditorMode === 'string'
          ? editorPending.designEditorMode
          : null),
    designTemplateId:
      readFiniteNumber(params.designTemplateId) ??
      readFiniteNumber(editorPending?.designTemplateId),
    designTemplateCode:
      typeof params.designTemplateCode === 'string'
        ? params.designTemplateCode
        : (typeof editorPending?.designTemplateCode === 'string'
          ? editorPending.designTemplateCode
          : null),
    selectedParams,
    configuration,
    fieldValues,
    specifications,
    editorPending,
    serviceId: typeof editorPending?.serviceId === 'string' ? editorPending.serviceId : null,
    productName:
      typeof params.productName === 'string'
        ? params.productName
        : (typeof editorPending?.productName === 'string' ? editorPending.productName : null),
    calculationResult: isRecord(editorPending?.calculationResult)
      ? editorPending.calculationResult
      : (isRecord(params.calculationResult) ? params.calculationResult : null),
    orderMode: typeof editorPending?.orderMode === 'string' ? editorPending.orderMode : null,
  }
}

export function toCustomerProjectListDto(
  project: CustomerProjectRow & { resume: Record<string, unknown> | null },
): CustomerProjectListDto {
  const displayId = customerProjectDisplayId(project.id)
  const resume = project.resume
    ? { ...project.resume, displayId }
    : { displayId }
  return {
    id: project.id,
    displayId,
    title: project.title,
    created_at: project.created_at,
    updated_at: project.updated_at,
    expires_at: project.expires_at,
    source_order_id: project.source_order_id,
    source_order_item_id: project.source_order_item_id,
    design_template_id: project.design_template_id,
    editor_mode: project.editor_mode,
    editable: Number(project.editable) === 1,
    product_id: project.product_id ?? null,
    type_id: project.type_id ?? null,
    size_id: project.size_id ?? null,
    resume,
  }
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
  const item = await db.get<{ params: string | null; quantity: number | null }>(
    'SELECT params, quantity FROM items WHERE id = ? AND orderId = ?',
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

  const itemQty = Math.max(1, Number(item.quantity) || 1)
  const resume = buildCustomerProjectResume(params, itemQty)
  const productId = readFiniteNumber(resume.productId)
  const typeId = readFiniteNumber(resume.typeId)
  const sizeId = typeof resume.sizeId === 'string' ? resume.sizeId : null

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
      productId != null && productId > 0 ? productId : null,
      typeId != null && Number.isFinite(typeId) ? typeId : null,
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
): Promise<{
  token: string
  displayId: string
  productId?: number | null
  typeId?: number | null
  sizeId?: string | null
  resume?: Record<string, unknown> | null
}> {
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

  const resume = (parseJson(row.resume_json ?? null) as Record<string, unknown> | null) ?? null
  const payload: Record<string, unknown> = {}
  const designState = parseJson(row.design_state_json)
  const photoBatch = parseJson(row.photo_batch_json)
  if (designState) payload.designState = designState
  if (photoBatch) payload.photoBatch = photoBatch
  if (row.title) payload.title = row.title

  const selectedParams = resume && isRecord(resume.selectedParams) ? resume.selectedParams : null
  if (selectedParams) payload.selectedParams = selectedParams

  const draft = await createEditorDraft({
    designTemplateId: row.design_template_id ?? undefined,
    productId: row.product_id ?? undefined,
    typeId: row.type_id ?? undefined,
    sizeId: row.size_id ?? undefined,
    mode: row.editor_mode ?? 'single',
    payload,
    customerId: row.customer_id,
  })

  const displayId = customerProjectDisplayId(row.id)
  return {
    token: draft.token,
    displayId,
    productId: row.product_id ?? null,
    typeId: row.type_id ?? null,
    sizeId: row.size_id ?? null,
    resume: resume ? { ...resume, displayId } : { displayId },
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
