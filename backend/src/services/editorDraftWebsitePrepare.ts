import { getDb } from '../config/database'
import {
  analyzeDesignStatePreflight,
  buildLayoutReviewPath,
} from './editorDesignPreflight'
import { getEditorDraft, type EditorDraftRow } from './publicEditorDraftService'
import { readEditorDraftMode, readOrderItemPagesParam } from '../utils/multipagePagesConsistency'
import { logger } from '../utils/logger'

type FabricPage = { fabricJSON?: unknown }

function parseItemParams(params: Record<string, unknown>): Record<string, unknown> {
  return params ?? {}
}

function parseDesignState(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readProductionDesignState(payload: Record<string, unknown>): Record<string, unknown> | null {
  return parseDesignState(payload.productionDesignState) ?? parseDesignState(payload.designState)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function walkFabricLikeTree(value: unknown, visit: (obj: Record<string, unknown>) => void): void {
  const obj = asRecord(value)
  if (!obj) return
  visit(obj)
  const keys = ['objects', '_objects', 'clipPath']
  for (const key of keys) {
    const child = obj[key]
    if (Array.isArray(child)) {
      for (const node of child) walkFabricLikeTree(node, visit)
      continue
    }
    walkFabricLikeTree(child, visit)
  }
}

function summarizeDesignStateForAgentDebug(value: unknown): Record<string, unknown> {
  const state = parseDesignState(value) ?? {}
  const pages = Array.isArray(state.pages) ? state.pages : []
  let objects = 0
  let images = 0
  let photoFields = 0
  let filledPhotoFields = 0
  let textObjects = 0
  for (const page of pages) {
    const pageRec = asRecord(page)
    const fabricRoot = pageRec?.fabricJSON ?? page
    walkFabricLikeTree(fabricRoot, (obj) => {
      objects += 1
      const type = String(obj.type ?? '').toLowerCase()
      if (type === 'image' || typeof obj.src === 'string') images += 1
      if (obj.isPhotoField === true) {
        photoFields += 1
        if (obj.photoFieldFilled === true) filledPhotoFields += 1
      }
      if (type === 'i-text' || type === 'itext' || type === 'textbox' || type === 'text') textObjects += 1
    })
  }
  return {
    pageCount: Number(state.pageCount ?? pages.length) || pages.length,
    pages: pages.length,
    sceneScale: state.sceneScale,
    pageWidth: state.pageWidth,
    pageHeight: state.pageHeight,
    objects,
    images,
    photoFields,
    filledPhotoFields,
    textObjects,
  }
}

function fingerprintAgentDebugToken(value: string): Record<string, unknown> {
  let hash = 2_166_136_261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 1_677_761_9)
  }
  return {
    present: value.length > 0,
    length: value.length,
    fingerprint: value ? `${value.length}:${(hash >>> 0).toString(36)}` : null,
  }
}

function extractDraftFileIdFromSrc(src: string): number | null {
  const raw = src.trim()
  if (!raw) return null
  const parsePath = (pathname: string): number | null => {
    const match = pathname.match(/\/drafts\/[^/]+\/files\/(\d+)\/content$/i)
    if (!match?.[1]) return null
    const fileId = Number(match[1])
    return Number.isFinite(fileId) ? fileId : null
  }
  try {
    const parsed = new URL(raw, 'https://draft.local')
    return parsePath(parsed.pathname)
  } catch {
    return parsePath(raw)
  }
}

function normalizeDesignStateDraftImageUrls(
  designState: unknown,
  fileNameByDraftFileId: Map<number, string>,
): void {
  const state = parseDesignState(designState)
  if (!state) return
  const pages = Array.isArray(state.pages) ? state.pages : []
  for (const page of pages) {
    const pageRec = asRecord(page)
    if (!pageRec) continue
    const fabricRoot = asRecord(pageRec.fabricJSON) ?? pageRec
    walkFabricLikeTree(fabricRoot, (obj) => {
      const src = typeof obj.src === 'string' ? obj.src : null
      if (!src) return
      const fileId = extractDraftFileIdFromSrc(src)
      if (fileId == null) return
      const fileName = fileNameByDraftFileId.get(fileId)
      if (!fileName) return
      obj.src = fileName
    })
  }
}

function mergeDesignStates(states: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (states.length === 0) return null
  const base = { ...states[0] }
  const pages: FabricPage[] = []
  for (const state of states) {
    const statePages = Array.isArray(state.pages) ? state.pages : []
    for (const page of statePages) {
      if (page && typeof page === 'object') pages.push(page as FabricPage)
    }
  }
  base.pages = pages
  base.pageCount = pages.length
  return base
}

export type EditorLayoutSlot = {
  editorDraftToken?: string
  label?: string
}

export type EditorLayoutGroup = {
  groupKey?: string
  slots: EditorLayoutSlot[]
}

function readEditorLayoutGroup(params: Record<string, unknown>): EditorLayoutGroup | null {
  const raw = params.editorLayoutGroup
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const slots = (raw as EditorLayoutGroup).slots
  if (!Array.isArray(slots) || slots.length === 0) return null
  return raw as EditorLayoutGroup
}

async function loadDraftForToken(token: string, positionLabel: string): Promise<{
  draft: EditorDraftRow & { payloadParsed: Record<string, unknown> }
  designState: Record<string, unknown> | null
}> {
  const draft = await getEditorDraft(token)
  if (!draft) throw new Error(`Editor draft не найден для позиции ${positionLabel}`)
  if (draft.status !== 'draft') throw new Error(`Editor draft уже использован для позиции ${positionLabel}`)
  const payload = draft.payloadParsed
  if (!payload.designState && !payload.productionDesignState && !payload.photoBatch) {
    throw new Error(`Editor draft пустой для позиции ${positionLabel}`)
  }
  const productionState = readProductionDesignState(payload)
  // #region agent log
  logger.info('[agent:pdf-mismatch] CRM loaded editor draft for website order summary', {
    runId: 'pdf-mismatch-prod',
    hypothesisId: 'H1,H2,H3',
    positionLabel,
    token: fingerprintAgentDebugToken(token),
    mode: draft.mode,
    status: draft.status,
    hasDesignState: Boolean(payload.designState),
    hasProductionDesignState: Boolean(payload.productionDesignState),
    design: summarizeDesignStateForAgentDebug(payload.designState),
    production: summarizeDesignStateForAgentDebug(payload.productionDesignState),
    chosen: summarizeDesignStateForAgentDebug(productionState),
  })
  // #endregion
  return {
    draft,
    designState: productionState,
  }
}

function enrichParamsWithPreflight(
  params: Record<string, unknown>,
  designState: unknown,
  orderItemIdPlaceholder?: number,
): Record<string, unknown> {
  const preflight = designState
    ? analyzeDesignStatePreflight(designState, {
      editorDraftMode: readEditorDraftMode(params),
      orderPages: readOrderItemPagesParam(params),
    })
    : null
  if (!preflight) return params
  const reviewPath = orderItemIdPlaceholder != null
    ? buildLayoutReviewPath(orderItemIdPlaceholder)
    : 'order-pool:item:pending'
  const layoutIssues = [...preflight.issues]

  return {
    ...params,
    layoutIncomplete: preflight.hasBlockingIssues,
    layoutIssues,
    layoutPreflight: {
      photoReady: preflight?.photoReady ?? 0,
      photoTotal: preflight?.photoTotal ?? 0,
      textReady: preflight?.textReady ?? 0,
      textTotal: preflight?.textTotal ?? 0,
    },
    layoutReviewPath: reviewPath,
  }
}

export type PreparedEditorDraftItem = { index: number; tokens: string[] }

export async function prepareWebsiteItemsWithEditorDrafts<
  T extends { params: Record<string, unknown> }
>(items: T[]): Promise<{ items: T[]; editorDraftItems: PreparedEditorDraftItem[] }> {
  const editorDraftItems: PreparedEditorDraftItem[] = []
  const nextItems: T[] = []

  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const params = parseItemParams(item.params ?? {})
    const layoutGroup = readEditorLayoutGroup(params)

    if (layoutGroup) {
      const tokens: string[] = []
      const designStates: Array<Record<string, unknown>> = []
      let primaryDraft: (EditorDraftRow & { payloadParsed: Record<string, unknown> }) | null = null

      for (let slotIndex = 0; slotIndex < layoutGroup.slots.length; slotIndex++) {
        const slot = layoutGroup.slots[slotIndex]
        const token = typeof slot.editorDraftToken === 'string' ? slot.editorDraftToken.trim() : ''
        if (!token) throw new Error(`Пустой editorDraftToken в слоте ${slotIndex + 1} позиции ${index + 1}`)
        const loaded = await loadDraftForToken(token, `${index + 1} слот ${slotIndex + 1}`)
        tokens.push(token)
        if (loaded.designState) designStates.push(loaded.designState)
        if (!primaryDraft) primaryDraft = loaded.draft
      }

      const mergedDesignState = mergeDesignStates(designStates)
      const mergedParams = enrichParamsWithPreflight({
        ...params,
        editorLayoutGroup: layoutGroup,
        editorDraftTokens: tokens,
        editorDraftToken: tokens[0],
        designTemplateId: primaryDraft?.design_template_id ?? params.designTemplateId,
        designState: mergedDesignState ?? undefined,
        photoBatch: primaryDraft?.payloadParsed.photoBatch,
        selectedEditorParams: primaryDraft?.payloadParsed.selectedParams,
        editorDraftMode: primaryDraft?.mode ?? 'single',
      }, mergedDesignState)

      nextItems.push({ ...item, params: mergedParams })
      editorDraftItems.push({ index, tokens })
      continue
    }

    const token = typeof params.editorDraftToken === 'string' ? params.editorDraftToken.trim() : ''
    if (!token) {
      nextItems.push(item)
      continue
    }

    const loaded = await loadDraftForToken(token, String(index + 1))
    const payload = loaded.draft.payloadParsed
    const itemParams = enrichParamsWithPreflight({
      ...params,
      editorDraftToken: token,
      designTemplateId: loaded.draft.design_template_id ?? undefined,
      designState: readProductionDesignState(payload),
      photoBatch: payload.photoBatch,
      selectedEditorParams: payload.selectedParams,
      editorDraftMode: loaded.draft.mode,
    }, readProductionDesignState(payload))

    nextItems.push({ ...item, params: itemParams })
    editorDraftItems.push({ index, tokens: [token] })
  }

  return { items: nextItems, editorDraftItems }
}

export async function collectEditorDraftItemsFromOrder(
  orderId: number,
): Promise<PreparedEditorDraftItem[]> {
  const db = await getDb()
  const rows = await db.all<Array<{ id: number; params: string | null }>>(
    'SELECT id, params FROM items WHERE orderId = ? ORDER BY id ASC',
    [orderId],
  )
  const items: PreparedEditorDraftItem[] = []
  rows?.forEach((row, index) => {
    if (!row.params) return
    try {
      const params = JSON.parse(row.params) as Record<string, unknown>
      const tokens: string[] = []
      if (Array.isArray(params.editorDraftTokens)) {
        for (const t of params.editorDraftTokens) {
          if (typeof t === 'string' && t.trim()) tokens.push(t.trim())
        }
      } else if (typeof params.editorDraftToken === 'string' && params.editorDraftToken.trim()) {
        tokens.push(params.editorDraftToken.trim())
      }
      if (tokens.length > 0) items.push({ index, tokens })
    } catch {
      /* skip */
    }
  })
  return items
}

export async function attachEditorDraftsToOrderItems(
  orderId: number,
  itemIds: number[],
  editorDraftItems: PreparedEditorDraftItem[],
): Promise<void> {
  if (editorDraftItems.length === 0) return
  const db = await getDb()

  for (const draftItem of editorDraftItems) {
    const orderItemId = itemIds[draftItem.index]
    if (!orderItemId) throw new Error('Не найдена позиция заказа для editor draft')
    const fileNameByDraftFileId = new Map<number, string>()

    for (const token of draftItem.tokens) {
      const draft = await getEditorDraft(token)
      if (!draft) throw new Error('Draft не найден')
      if (draft.status !== 'draft') throw new Error('Draft уже финализирован')

      const draftFiles = await db.all<Array<{ id: number; filename: string; originalName: string | null; mime: string | null; size: number | null }>>(
        'SELECT id, filename, originalName, mime, size FROM editor_draft_files WHERE draft_id = ? ORDER BY id ASC',
        [draft.id],
      )
      for (const file of draftFiles ?? []) {
        fileNameByDraftFileId.set(Number(file.id), file.filename)
        await db.run(
          'INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
          [orderId, orderItemId, file.filename, file.originalName, file.mime, file.size],
        )
      }

      await db.run(
        `UPDATE editor_drafts SET status = 'finalized', order_id = ?, updated_at = datetime('now') WHERE token = ?`,
        [orderId, token],
      )
    }

    const item = await db.get<{ params: string | null }>(
      'SELECT params FROM items WHERE id = ? AND orderId = ?',
      [orderItemId, orderId],
    )
    if (item?.params) {
      try {
        const params = JSON.parse(item.params) as Record<string, unknown>
        normalizeDesignStateDraftImageUrls(params.designState, fileNameByDraftFileId)
        const enriched = enrichParamsWithPreflight(params, params.designState, orderItemId)
        await db.run(
          'UPDATE items SET params = ? WHERE id = ? AND orderId = ?',
          [JSON.stringify(enriched), orderItemId, orderId],
        )
      } catch {
        /* ignore malformed params */
      }
    }
  }
}
