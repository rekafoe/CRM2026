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
import {
  assertMultipagePagesConsistency,
  readOrderItemPagesParam,
} from '../utils/multipagePagesConsistency'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

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
  customer_id?: number | null
  guest_token?: string | null
  expires_at?: string | null
  created_at: string
  updated_at: string
}

/** Список незавершённых без полного payload (для UI). */
export type EditorDraftListItem = {
  token: string
  product_id: number | null
  type_id: number | null
  size_id: string | null
  design_template_id: number | null
  mode: string
  status: string
  updated_at: string
  created_at: string
  expires_at: string | null
  customer_id: number | null
  guest_token: string | null
  title: string
}

export const EDITOR_DRAFT_TTL_GUEST_DAYS = 14
export const EDITOR_DRAFT_TTL_CUSTOMER_DAYS = 90

function parseByteLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const value = raw.trim().toLowerCase()
  if (!value) return fallback
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)
  if (!match) return fallback
  const amount = Number(match[1])
  const unit = (match[2] || 'b').toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) return fallback
  const multiplier = unit === 'gb'
    ? 1024 ** 3
    : unit === 'mb'
      ? 1024 ** 2
      : unit === 'kb'
        ? 1024
        : 1
  return Math.max(1, Math.floor(amount * multiplier))
}

const REQUEST_BODY_LIMIT_BYTES = parseByteLimit(process.env.REQUEST_BODY_LIMIT, 2 * 1024 * 1024)
const CONFIGURED_DRAFT_PAYLOAD_BYTES = parseByteLimit(
  process.env.EDITOR_DRAFT_MAX_PAYLOAD_BYTES,
  REQUEST_BODY_LIMIT_BYTES,
)
const MAX_DRAFT_PAYLOAD_BYTES = Math.max(
  128 * 1024,
  Math.min(
    CONFIGURED_DRAFT_PAYLOAD_BYTES,
    REQUEST_BODY_LIMIT_BYTES,
  ),
)
const DRAFT_UPDATE_RATE_WINDOW_MS = (() => {
  const parsed = Number(process.env.EDITOR_DRAFT_RATE_WINDOW_MS || 10_000)
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1000, Math.floor(parsed)) : 10_000
})()
const DRAFT_UPDATE_RATE_MAX = (() => {
  const parsed = Number(process.env.EDITOR_DRAFT_RATE_MAX || 25)
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(2, Math.floor(parsed)) : 25
})()
const draftUpdateRateState = new Map<string, { windowStart: number; count: number; lastSeen: number }>()

export class EditorDraftRateLimitError extends Error {
  constructor(message = 'Слишком частые autosave-запросы. Подождите несколько секунд и повторите.') {
    super(message)
    this.name = 'EditorDraftRateLimitError'
  }
}

function enforceEditorDraftRateLimit(token: string): void {
  const now = Date.now()
  const state = draftUpdateRateState.get(token)
  if (!state || now - state.windowStart > DRAFT_UPDATE_RATE_WINDOW_MS) {
    draftUpdateRateState.set(token, {
      windowStart: now,
      count: 1,
      lastSeen: now,
    })
    return
  }
  state.count += 1
  state.lastSeen = now
  if (state.count > DRAFT_UPDATE_RATE_MAX) {
    throw new EditorDraftRateLimitError()
  }
}

function cleanupEditorDraftRateState(): void {
  const now = Date.now()
  const ttlMs = DRAFT_UPDATE_RATE_WINDOW_MS * 8
  for (const [token, state] of draftUpdateRateState.entries()) {
    if (now - state.lastSeen > ttlMs) {
      draftUpdateRateState.delete(token)
    }
  }
}

async function ensureEditorDraftVersionColumn(): Promise<void> {
  const exists = await hasColumn('editor_drafts', 'version').catch(() => false)
  if (exists) return
  const db = await getDb()
  await db.exec('ALTER TABLE editor_drafts ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
  invalidateTableSchemaCache('editor_drafts')
}

async function ensureEditorDraftOwnerColumns(): Promise<void> {
  const db = await getDb()
  if (!(await hasColumn('editor_drafts', 'customer_id').catch(() => false))) {
    await db.exec('ALTER TABLE editor_drafts ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL')
  }
  if (!(await hasColumn('editor_drafts', 'guest_token').catch(() => false))) {
    await db.exec('ALTER TABLE editor_drafts ADD COLUMN guest_token TEXT')
  }
  if (!(await hasColumn('editor_drafts', 'expires_at').catch(() => false))) {
    await db.exec('ALTER TABLE editor_drafts ADD COLUMN expires_at TEXT')
  }
  invalidateTableSchemaCache('editor_drafts')
}

function daysFromNowIso(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export function resolveEditorDraftExpiresAt(input: {
  customerId?: number | null
  guestToken?: string | null
}): string {
  if (input.customerId != null && Number.isFinite(Number(input.customerId))) {
    return daysFromNowIso(EDITOR_DRAFT_TTL_CUSTOMER_DAYS)
  }
  return daysFromNowIso(EDITOR_DRAFT_TTL_GUEST_DAYS)
}

function normalizeGuestToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128) return null
  return trimmed
}

function normalizeCustomerId(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function draftListTitle(row: EditorDraftRow): string {
  const payload = parsePayloadRaw(row.payload)
  const selected = isRecord(payload.selectedParams) ? payload.selectedParams : null
  const fromPayload =
    (typeof payload.title === 'string' && payload.title.trim())
    || (selected && typeof selected.productName === 'string' && selected.productName.trim())
    || (typeof payload.productName === 'string' && payload.productName.trim())
  if (fromPayload) return fromPayload
  if (row.design_template_id) return `Макет #${row.design_template_id}`
  if (row.product_id) return `Продукт #${row.product_id}`
  return 'Незавершённый макет'
}

function isDraftExpired(row: Pick<EditorDraftRow, 'expires_at'>): boolean {
  if (!row.expires_at) return false
  const expiresMs = Date.parse(row.expires_at)
  if (!Number.isFinite(expiresMs)) return false
  return expiresMs < Date.now()
}

function toDraftListItem(row: EditorDraftRow): EditorDraftListItem {
  return {
    token: row.token,
    product_id: row.product_id,
    type_id: row.type_id,
    size_id: row.size_id,
    design_template_id: row.design_template_id,
    mode: row.mode,
    status: row.status,
    updated_at: row.updated_at,
    created_at: row.created_at,
    expires_at: row.expires_at ?? null,
    customer_id: row.customer_id ?? null,
    guest_token: row.guest_token ?? null,
    title: draftListTitle(row),
  }
}

function parsePayload(row: EditorDraftRow): Record<string, unknown> {
  try {
    return row.payload ? JSON.parse(row.payload) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parsePayloadRaw(payload: string | null): Record<string, unknown> {
  try {
    return payload ? JSON.parse(payload) as Record<string, unknown> : {}
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
  const {
    expectedVersion: _expectedVersion,
    __expectedVersion: _legacyExpectedVersion,
    customerId: _customerId,
    customer_id: _customer_id,
    guestToken: _guestToken,
    guest_token: _guest_token,
    ...payloadPatch
  } = patch
  return payloadPatch
}

export async function createEditorDraft(input: {
  designTemplateId?: number
  productId?: number
  typeId?: number
  sizeId?: string
  mode?: string
  payload?: Record<string, unknown>
  customerId?: number | null
  guestToken?: string | null
}): Promise<EditorDraftRow & { payloadParsed: Record<string, unknown> }> {
  await ensureEditorDraftOwnerColumns()
  const db = await getDb()
  const token = createToken()
  const customerId = normalizeCustomerId(input.customerId)
  const guestToken = customerId ? null : normalizeGuestToken(input.guestToken)
  const expiresAt = resolveEditorDraftExpiresAt({ customerId, guestToken })
  const result = await db.run(
    `INSERT INTO editor_drafts (
      token, design_template_id, product_id, type_id, size_id, mode, payload,
      customer_id, guest_token, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      token,
      input.designTemplateId ?? null,
      input.productId ?? null,
      input.typeId ?? null,
      input.sizeId ?? null,
      input.mode ?? 'single',
      stringifyDraftPayload(input.payload ?? {}),
      customerId,
      guestToken,
      expiresAt,
    ],
  )
  const row = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE id = ?', result.lastID)
  if (!row) throw new Error('Не удалось создать draft редактора')
  return { ...row, payloadParsed: parsePayload(row) }
}

export async function getEditorDraft(token: string): Promise<(EditorDraftRow & { payloadParsed: Record<string, unknown> }) | null> {
  await ensureEditorDraftOwnerColumns()
  const db = await getDb()
  const row = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE token = ?', token)
  if (!row) return null
  if (row.status === 'draft' && isDraftExpired(row)) {
    return null
  }
  return { ...row, payloadParsed: parsePayload(row) }
}

export async function listEditorDraftsForOwner(input: {
  customerId?: number | null
  guestToken?: string | null
}): Promise<EditorDraftListItem[]> {
  await ensureEditorDraftOwnerColumns()
  const customerId = normalizeCustomerId(input.customerId)
  const guestToken = normalizeGuestToken(input.guestToken)
  if (!customerId && !guestToken) return []

  const db = await getDb()
  const rows = customerId
    ? ((await db.all(
      `SELECT * FROM editor_drafts
       WHERE status = 'draft'
         AND customer_id = ?
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
       ORDER BY datetime(updated_at) DESC, id DESC
       LIMIT 50`,
      [customerId],
    )) as EditorDraftRow[])
    : ((await db.all(
      `SELECT * FROM editor_drafts
       WHERE status = 'draft'
         AND guest_token = ?
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
       ORDER BY datetime(updated_at) DESC, id DESC
       LIMIT 50`,
      [guestToken],
    )) as EditorDraftRow[])

  return (rows ?? []).map(toDraftListItem)
}

export async function claimEditorDraftsForCustomer(input: {
  guestToken: string
  customerId: number
}): Promise<{ claimed: number }> {
  await ensureEditorDraftOwnerColumns()
  const guestToken = normalizeGuestToken(input.guestToken)
  const customerId = normalizeCustomerId(input.customerId)
  if (!guestToken || !customerId) {
    throw new Error('Нужны guestToken и customerId')
  }
  const db = await getDb()
  const expiresAt = resolveEditorDraftExpiresAt({ customerId })
  const result = await db.run(
    `UPDATE editor_drafts
     SET customer_id = ?, guest_token = NULL, expires_at = ?, updated_at = datetime('now')
     WHERE status = 'draft'
       AND guest_token = ?
       AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
    [customerId, expiresAt, guestToken],
  )
  return { claimed: result.changes ?? 0 }
}

export async function cleanupExpiredEditorDrafts(): Promise<{ deleted: number }> {
  await ensureEditorDraftOwnerColumns()
  const db = await getDb()
  const expired = (await db.all(
    `SELECT id FROM editor_drafts
     WHERE status = 'draft'
       AND expires_at IS NOT NULL
       AND datetime(expires_at) <= datetime('now')
     LIMIT 500`,
  )) as Array<{ id: number }>
  if (!expired?.length) return { deleted: 0 }

  let deleted = 0
  for (const row of expired) {
    await db.run('DELETE FROM editor_draft_files WHERE draft_id = ?', [row.id])
    const result = await db.run('DELETE FROM editor_drafts WHERE id = ? AND status = ?', [row.id, 'draft'])
    deleted += result.changes ?? 0
  }
  return { deleted }
}

export async function updateEditorDraftPayload(
  token: string,
  patch: Record<string, unknown>,
): Promise<EditorDraftRow & { payloadParsed: Record<string, unknown> }> {
  await ensureEditorDraftVersionColumn()
  await ensureEditorDraftOwnerColumns()
  cleanupEditorDraftRateState()
  enforceEditorDraftRateLimit(token)
  const db = await getDb()
  const existing = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE token = ?', token)
  if (!existing) throw new Error('Draft не найден')
  if (existing.status !== 'draft') throw new Error('Draft уже финализирован')
  if (isDraftExpired(existing)) throw new Error('Срок хранения макета истёк')

  const ownerCustomerId = normalizeCustomerId(patch.customerId ?? patch.customer_id)
  const ownerGuestToken = normalizeGuestToken(patch.guestToken ?? patch.guest_token)
  const payloadPatch = stripDraftControlKeys({
    ...patch,
    customerId: undefined,
    customer_id: undefined,
    guestToken: undefined,
    guest_token: undefined,
  })
  const expectedVersion = readExpectedVersion(patch)
  const currentPayload = parsePayloadRaw(existing.payload)
  const payload = { ...currentPayload, ...payloadPatch }
  const serializedPayload = stringifyDraftPayload(payload)
  const currentSerialized = existing.payload ?? '{}'
  const versionNow = Number(existing.version ?? 1) || 1

  const nextCustomerId = ownerCustomerId ?? existing.customer_id ?? null
  const nextGuestToken = nextCustomerId
    ? null
    : (ownerGuestToken ?? existing.guest_token ?? null)
  const nextExpiresAt = resolveEditorDraftExpiresAt({
    customerId: nextCustomerId,
    guestToken: nextGuestToken,
  })

  if (serializedPayload === currentSerialized) {
    if (expectedVersion && versionNow !== expectedVersion) {
      throw new Error('Draft изменился в другой вкладке. Обновите страницу и повторите сохранение.')
    }
    await db.run(
      `UPDATE editor_drafts
       SET customer_id = ?, guest_token = ?, expires_at = ?, updated_at = datetime('now')
       WHERE token = ? AND status = 'draft'`,
      [nextCustomerId, nextGuestToken, nextExpiresAt, token],
    )
    const refreshed = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE token = ?', token)
    return {
      ...(refreshed ?? existing),
      payloadParsed: payload,
      version: versionNow,
    }
  }
  const result = expectedVersion
    ? await db.run(
      `UPDATE editor_drafts
       SET payload = ?, version = COALESCE(version, 1) + 1, updated_at = datetime('now'),
           customer_id = ?, guest_token = ?, expires_at = ?
       WHERE token = ? AND status = 'draft' AND COALESCE(version, 1) = ?`,
      [serializedPayload, nextCustomerId, nextGuestToken, nextExpiresAt, token, expectedVersion],
    )
    : await db.run(
      `UPDATE editor_drafts
       SET payload = ?, version = COALESCE(version, 1) + 1, updated_at = datetime('now'),
           customer_id = ?, guest_token = ?, expires_at = ?
       WHERE token = ? AND status = 'draft'`,
      [serializedPayload, nextCustomerId, nextGuestToken, nextExpiresAt, token],
    )
  if ((result.changes ?? 0) === 0) {
    throw new Error('Draft изменился в другой вкладке. Обновите страницу и повторите сохранение.')
  }
  const updated = await db.get<EditorDraftRow>('SELECT * FROM editor_drafts WHERE token = ?', token)
  if (!updated) throw new Error('Draft не найден')
  return {
    ...updated,
    payloadParsed: payload,
  }
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

function readProductionDesignState(payload: Record<string, unknown>): unknown {
  return payload.productionDesignState ?? payload.designState
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
  const draftMode = typeof draft.mode === 'string' ? draft.mode : 'single'
  const orderDesignState = readProductionDesignState(draftPayload)
  if (draftMode === 'multipage' && orderDesignState) {
    const selectedParams = isRecord(draftPayload.selectedParams) ? draftPayload.selectedParams : {}
    const orderPages =
      readOrderItemPagesParam({ pages: selectedParams.pages, specifications: selectedParams }) ??
      readOrderItemPagesParam(draftPayload)
    assertMultipagePagesConsistency({
      strict: true,
      editorDraftMode: 'multipage',
      orderPages,
      designState: orderDesignState,
    })
  }

  const items = Array.isArray(input.items) && input.items.length > 0
    ? input.items.map((item, index) => ({
      ...item,
      params: {
        ...(item.params ?? {}),
        editorDraftToken: token,
        designTemplateId: draft.design_template_id ?? undefined,
        designState: orderDesignState,
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
        designState: orderDesignState,
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
