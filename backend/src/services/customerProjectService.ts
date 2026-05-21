import { getDb } from '../config/database'
import { createEditorDraft, getEditorDraft } from './publicEditorDraftService'

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

export async function createCustomerProjectFromOrderItem(input: {
  customerId: number
  orderId: number
  orderItemId: number
  title?: string
  editable?: boolean
}): Promise<CustomerProjectRow | null> {
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

  const result = await db.run(
    `INSERT INTO customer_projects (
      customer_id, title, design_state_json, photo_batch_json,
      source_order_id, source_order_item_id, editor_draft_token,
      design_template_id, editor_mode, editable, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
    ],
  )

  const row = await db.get<CustomerProjectRow>('SELECT * FROM customer_projects WHERE id = ?', result.lastID)
  return row ?? null
}

export async function listCustomerProjects(customerId: number): Promise<Array<CustomerProjectRow & {
  designState: unknown
  photoBatch: unknown
}>> {
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
  }))
}

export async function cloneCustomerProjectToDraft(projectId: number): Promise<{ token: string }> {
  const db = await getDb()
  const row = await db.get<CustomerProjectRow>('SELECT * FROM customer_projects WHERE id = ?', projectId)
  if (!row) throw new Error('Проект не найден')
  if (Number(row.editable) === 0) throw new Error('Проект доступен только для дублирования заказа')

  const payload: Record<string, unknown> = {}
  const designState = parseJson(row.design_state_json)
  const photoBatch = parseJson(row.photo_batch_json)
  if (designState) payload.designState = designState
  if (photoBatch) payload.photoBatch = photoBatch

  const draft = await createEditorDraft({
    designTemplateId: row.design_template_id ?? undefined,
    mode: row.editor_mode ?? 'single',
    payload,
  })

  return { token: draft.token }
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
