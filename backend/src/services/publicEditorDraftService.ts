import crypto from 'crypto'
import { getDb } from '../config/database'
import { saveBufferToOrderFiles } from '../config/upload'
import { OrderService } from '../modules/orders/services/orderService'
import { setLastWebsiteOrderAt } from '../utils/poolSync'

export interface EditorDraftRow {
  id: number
  token: string
  design_template_id: number | null
  product_id: number | null
  type_id: number | null
  size_id: string | null
  mode: string
  payload: string | null
  status: string
  order_id: number | null
  created_at: string
  updated_at: string
}

function parsePayload(row: EditorDraftRow): Record<string, unknown> {
  try {
    return row.payload ? JSON.parse(row.payload) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function createToken(): string {
  return crypto.randomBytes(18).toString('base64url')
}

export async function createEditorDraft(input: {
  designTemplateId?: number
  productId?: number
  typeId?: number
  sizeId?: string
  mode?: string
  payload?: Record<string, unknown>
}): Promise<EditorDraftRow & { payloadParsed: Record<string, unknown> }> {
  const db = await getDb()
  const token = createToken()
  const result = await db.run(
    `INSERT INTO editor_drafts (token, design_template_id, product_id, type_id, size_id, mode, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      token,
      input.designTemplateId ?? null,
      input.productId ?? null,
      input.typeId ?? null,
      input.sizeId ?? null,
      input.mode ?? 'single',
      JSON.stringify(input.payload ?? {}),
    ],
  )
  const row = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE id = ?', result.lastID)
  if (!row) throw new Error('Не удалось создать draft редактора')
  return { ...row, payloadParsed: parsePayload(row) }
}

export async function getEditorDraft(token: string): Promise<(EditorDraftRow & { payloadParsed: Record<string, unknown> }) | null> {
  const db = await getDb()
  const row = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE token = ?', token)
  return row ? { ...row, payloadParsed: parsePayload(row) } : null
}

export async function updateEditorDraftPayload(
  token: string,
  patch: Record<string, unknown>,
): Promise<EditorDraftRow & { payloadParsed: Record<string, unknown> }> {
  const existing = await getEditorDraft(token)
  if (!existing) throw new Error('Draft не найден')
  if (existing.status !== 'draft') throw new Error('Draft уже финализирован')

  const payload = { ...existing.payloadParsed, ...patch }
  const db = await getDb()
  await db.run(
    `UPDATE editor_drafts SET payload = ?, updated_at = datetime('now') WHERE token = ?`,
    [JSON.stringify(payload), token],
  )
  const updated = await getEditorDraft(token)
  if (!updated) throw new Error('Draft не найден')
  return updated
}

export async function addEditorDraftFile(
  token: string,
  file: { buffer?: Buffer; originalname?: string; mimetype?: string },
): Promise<Record<string, unknown>> {
  const draft = await getEditorDraft(token)
  if (!draft) throw new Error('Draft не найден')
  if (draft.status !== 'draft') throw new Error('Draft уже финализирован')

  const saved = saveBufferToOrderFiles(file.buffer, file.originalname)
  if (!saved) throw new Error('Файл пустой или не загружен')

  const db = await getDb()
  const result = await db.run(
    `INSERT INTO editor_draft_files (draft_id, filename, originalName, mime, size)
     VALUES (?, ?, ?, ?, ?)`,
    [draft.id, saved.filename, saved.originalName, file.mimetype ?? null, saved.size],
  )
  return {
    id: result.lastID,
    draftId: draft.id,
    filename: saved.filename,
    originalName: saved.originalName,
    mime: file.mimetype ?? null,
    size: saved.size,
  }
}

export async function finalizeEditorDraft(
  token: string,
  input: {
    customerName?: string
    customerPhone?: string
    customerEmail?: string
    prepaymentAmount?: number
    customer_id?: number
    items?: Array<{ type: string; params: Record<string, unknown>; price: number; quantity: number; components?: Array<{ materialId: number; qtyPerItem: number }> }>
  },
): Promise<Record<string, unknown>> {
  const draft = await getEditorDraft(token)
  if (!draft) throw new Error('Draft не найден')
  if (draft.status !== 'draft') throw new Error('Draft уже финализирован')
  if (!input.customerName && !input.customerPhone) {
    throw new Error('customerName или customerPhone обязательны')
  }

  const draftPayload = draft.payloadParsed
  const items = Array.isArray(input.items) && input.items.length > 0
    ? input.items.map((item, index) => ({
      ...item,
      params: {
        ...(item.params ?? {}),
        editorDraftToken: token,
        designTemplateId: draft.design_template_id ?? undefined,
        designState: draftPayload.designState,
        photoBatch: draftPayload.photoBatch,
        selectedEditorParams: draftPayload.selectedParams,
        editorItemIndex: index,
      },
    }))
    : [{
      type: 'design',
      price: 0,
      quantity: 1,
      params: {
        description: 'Макет из онлайн-редактора',
        editorDraftToken: token,
        designTemplateId: draft.design_template_id ?? undefined,
        designState: draftPayload.designState,
        photoBatch: draftPayload.photoBatch,
        selectedEditorParams: draftPayload.selectedParams,
      },
    }]

  const result = await OrderService.createOrderWithAutoDeduction({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    prepaymentAmount: input.prepaymentAmount,
    customer_id: input.customer_id,
    source: 'website',
    items,
  })

  const db = await getDb()
  const draftFiles = await db.all<Array<{ filename: string; originalName: string | null; mime: string | null; size: number | null }>>(
    'SELECT filename, originalName, mime, size FROM editor_draft_files WHERE draft_id = ? ORDER BY id ASC',
    [draft.id],
  )
  for (const file of draftFiles ?? []) {
    await db.run(
      'INSERT INTO order_files (orderId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?)',
      [result.order.id, file.filename, file.originalName, file.mime, file.size],
    )
  }

  await db.run(
    `UPDATE editor_drafts SET status = 'finalized', order_id = ?, updated_at = datetime('now') WHERE token = ?`,
    [result.order.id, token],
  )
  setLastWebsiteOrderAt(Date.now())

  return {
    order: result.order,
    itemIds: result.itemIds ?? [],
    deductionResult: result.deductionResult,
    message: 'Заказ из онлайн-редактора создан',
  }
}
