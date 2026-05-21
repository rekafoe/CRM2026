import crypto from 'crypto'
import { getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { setLastWebsiteOrderAt } from '../utils/poolSync'
import { hasColumn, invalidateTableSchemaCache } from '../utils/tableSchemaCache'
import {
  createEditorDraftAsset,
  getEditorDraftAsset,
  listEditorDraftAssets,
  type EditorDraftFileRecord,
} from './publicEditorAssetService'

export interface EditorDraftRow {
  id: number
  token: string
  design_template_id: number | null
  product_id: number | null
  type_id: number | null
  size_id: string | null
  mode: string
  payload: string | null
  version?: number
  status: string
  order_id: number | null
  created_at: string
  updated_at: string
}

const MAX_DRAFT_PAYLOAD_BYTES = Number(process.env.EDITOR_DRAFT_MAX_PAYLOAD_BYTES || 2 * 1024 * 1024)

async function ensureEditorDraftVersionColumn(): Promise<void> {
  const exists = await hasColumn('editor_drafts', 'version').catch(() => false)
  if (exists) return
  const db = await getDb()
  await db.exec('ALTER TABLE editor_drafts ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
  invalidateTableSchemaCache('editor_drafts')
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

function stringifyDraftPayload(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DRAFT_PAYLOAD_BYTES) {
    throw new Error('Draft слишком большой. Уменьшите количество данных в макете.')
  }
  return serialized
}

function readExpectedVersion(patch: Record<string, unknown>): number | null {
  const raw = patch.expectedVersion ?? patch.__expectedVersion
  if (raw == null || raw === '') return null
  const expected = Number(raw)
  return Number.isInteger(expected) && expected > 0 ? expected : null
}

function stripDraftControlKeys(patch: Record<string, unknown>): Record<string, unknown> {
  const { expectedVersion: _expectedVersion, __expectedVersion: _legacyExpectedVersion, ...payloadPatch } = patch
  return payloadPatch
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
      stringifyDraftPayload(input.payload ?? {}),
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
  await ensureEditorDraftVersionColumn()
  const existing = await getEditorDraft(token)
  if (!existing) throw new Error('Draft не найден')
  if (existing.status !== 'draft') throw new Error('Draft уже финализирован')

  const expectedVersion = readExpectedVersion(patch)
  const payload = { ...existing.payloadParsed, ...stripDraftControlKeys(patch) }
  const db = await getDb()
  const serializedPayload = stringifyDraftPayload(payload)
  const result = expectedVersion
    ? await db.run(
      `UPDATE editor_drafts
       SET payload = ?, version = COALESCE(version, 1) + 1, updated_at = datetime('now')
       WHERE token = ? AND status = 'draft' AND COALESCE(version, 1) = ?`,
      [serializedPayload, token, expectedVersion],
    )
    : await db.run(
      `UPDATE editor_drafts
       SET payload = ?, version = COALESCE(version, 1) + 1, updated_at = datetime('now')
       WHERE token = ? AND status = 'draft'`,
      [serializedPayload, token],
    )
  if ((result.changes ?? 0) === 0) {
    throw new Error('Draft изменился в другой вкладке. Обновите страницу и повторите сохранение.')
  }
  const updated = await getEditorDraft(token)
  if (!updated) throw new Error('Draft не найден')
  return updated
}

function parseItemParams(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function createEditorDraftFromOrderItem(input: {
  orderId: number
  orderItemId: number
}): Promise<EditorDraftRow & { payloadParsed: Record<string, unknown> }> {
  const db = await getDb()
  const item = await db.get<{ id: number; orderId: number; params: string | null }>(
    'SELECT id, orderId, params FROM items WHERE id = ? AND orderId = ?',
    [input.orderItemId, input.orderId],
  )
  if (!item) throw new Error('Позиция заказа не найдена')
  const params = parseItemParams(item.params)
  const payload: Record<string, unknown> = {}
  if (params.designState) payload.designState = params.designState
  if (params.photoBatch) payload.photoBatch = params.photoBatch
  if (params.selectedEditorParams) payload.selectedParams = params.selectedEditorParams
  if (!payload.designState && !payload.photoBatch) throw new Error('В позиции нет сохранённого состояния редактора')

  return createEditorDraft({
    designTemplateId: params.designTemplateId != null ? Number(params.designTemplateId) : undefined,
    productId: params.productId != null ? Number(params.productId) : undefined,
    typeId: params.typeId != null ? Number(params.typeId) : undefined,
    sizeId: params.sizeId != null ? String(params.sizeId) : undefined,
    mode: typeof params.editorDraftMode === 'string' ? params.editorDraftMode : payload.photoBatch ? 'photo_batch' : 'single',
    payload,
  })
}

export async function addEditorDraftFile(
  token: string,
  file: { buffer?: Buffer; originalname?: string; mimetype?: string },
): Promise<EditorDraftFileRecord> {
  const draft = await getEditorDraft(token)
  if (!draft) throw new Error('Draft не найден')
  if (draft.status !== 'draft') throw new Error('Draft уже финализирован')

  return createEditorDraftAsset(draft.id, file)
}

export async function getEditorDraftFile(
  token: string,
  fileId: number,
): Promise<EditorDraftFileRecord | null> {
  const draft = await getEditorDraft(token)
  if (!draft) return null
  return getEditorDraftAsset(draft.id, fileId)
}

export async function listEditorDraftFiles(token: string): Promise<EditorDraftFileRecord[]> {
  const draft = await getEditorDraft(token)
  if (!draft) return []
  return listEditorDraftAssets(draft.id)
}

export {
  prepareWebsiteItemsWithEditorDrafts,
  attachEditorDraftsToOrderItems,
} from './editorDraftWebsitePrepare'

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
  const primaryOrderItemId = Array.isArray(result.itemIds) && result.itemIds.length > 0 ? Number(result.itemIds[0]) : null
  for (const file of draftFiles ?? []) {
    await db.run(
      'INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
      [result.order.id, primaryOrderItemId, file.filename, file.originalName, file.mime, file.size],
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
