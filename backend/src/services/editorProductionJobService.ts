import { getDb } from '../config/database'
import { logger } from '../utils/logger'
import {
  renderClientRenderedPagesProductionPdf,
  renderDesignStateProductionPdf,
} from './editorProductionRenderService'
import { runImpositionJobForOrderItem } from './editorImpositionService'
import { getEditorDraft } from './publicEditorDraftService'

export type EditorProductionJobType = 'production_pdf' | 'imposition_sra3'
export type EditorProductionJobStatus = 'pending' | 'processing' | 'done' | 'failed'

function parseParams(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readDraftDesignState(payload: Record<string, unknown>): Record<string, unknown> | null {
  return parseObject(payload.productionDesignState) ?? parseObject(payload.designState)
}

function summarizeDesignStateForAgentDebug(value: unknown): Record<string, unknown> {
  const state = parseObject(value) ?? {}
  const pages = Array.isArray(state.pages) ? state.pages : []
  let objects = 0
  let images = 0
  let photoFields = 0
  let filledPhotoFields = 0
  let textObjects = 0
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    const obj = node as Record<string, unknown>
    objects += 1
    const type = String(obj.type ?? '').toLowerCase()
    if (type === 'image' || typeof obj.src === 'string') images += 1
    if (obj.isPhotoField === true) {
      photoFields += 1
      if (obj.photoFieldFilled === true) filledPhotoFields += 1
    }
    if (type === 'i-text' || type === 'itext' || type === 'textbox' || type === 'text') textObjects += 1
    for (const key of ['objects', '_objects']) {
      const children = obj[key]
      if (Array.isArray(children)) children.forEach(walk)
    }
    walk(obj.clipPath)
  }
  for (const page of pages) {
    const pageObj = parseObject(page) ?? {}
    walk(pageObj.fabricJSON ?? page)
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

function collectEditorDraftTokens(params: Record<string, unknown>): string[] {
  const tokens = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) tokens.add(value.trim())
  }
  add(params.editorDraftToken)
  if (Array.isArray(params.editorDraftTokens)) {
    for (const token of params.editorDraftTokens) add(token)
  }
  const layoutGroup = parseObject(params.editorLayoutGroup)
  const slots = Array.isArray(layoutGroup?.slots) ? layoutGroup.slots : []
  for (const slotRaw of slots) {
    const slot = parseObject(slotRaw)
    add(slot?.editorDraftToken)
  }
  return [...tokens]
}

function mergeDraftDesignStates(states: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (states.length === 0) return null
  if (states.length === 1) return states[0]!
  const base = { ...states[0] }
  const pages: unknown[] = []
  for (const state of states) {
    const statePages = Array.isArray(state.pages) ? state.pages : []
    pages.push(...statePages)
  }
  base.pages = pages
  base.pageCount = pages.length
  return base
}

type ClientRenderedPagesManifest = {
  pageCount: number
  pageWidthMm: number
  pageHeightMm: number
  bleedMm: number
  dpi: number
}

function readClientRenderedPagesManifest(params: Record<string, unknown>): ClientRenderedPagesManifest | null {
  if (params.productionRenderSource !== 'client_png') return null
  const manifest = parseObject(params.clientRenderedPages)
  if (!manifest || manifest.source !== 'client_png') return null
  const pageCount = Math.floor(Number(manifest.pageCount))
  const pageWidthMm = Number(manifest.pageWidthMm)
  const pageHeightMm = Number(manifest.pageHeightMm)
  if (!Number.isFinite(pageCount) || pageCount <= 0) return null
  if (!Number.isFinite(pageWidthMm) || pageWidthMm <= 0) return null
  if (!Number.isFinite(pageHeightMm) || pageHeightMm <= 0) return null
  return {
    pageCount,
    pageWidthMm,
    pageHeightMm,
    bleedMm: Math.max(0, Number(manifest.bleedMm) || 0),
    dpi: Math.max(1, Math.floor(Number(manifest.dpi) || 300)),
  }
}

async function countClientRenderedPages(orderId: number, orderItemId: number): Promise<number> {
  const db = await getDb()
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(DISTINCT COALESCE(partNumber, id)) AS count
     FROM order_files
     WHERE orderId = ? AND orderItemId = ? AND artifactType = 'client_rendered_page'`,
    [orderId, orderItemId],
  )
  return Number(row?.count ?? 0)
}

async function hasClientRenderedPageSet(
  orderId: number,
  orderItemId: number,
  manifest: ClientRenderedPagesManifest,
): Promise<boolean> {
  const count = await countClientRenderedPages(orderId, orderItemId)
  return count >= manifest.pageCount
}

async function enqueueProductionPdfJobIfMissing(
  orderId: number,
  orderItemId: number,
  includeDone = false,
): Promise<number | null> {
  const db = await getDb()
  const statuses = includeDone
    ? "'pending','processing','done'"
    : "'pending','processing'"
  const result = await db.run(
    `INSERT INTO editor_production_jobs (order_id, order_item_id, job_type, status, updated_at)
     SELECT ?, ?, 'production_pdf', 'pending', datetime('now')
     WHERE NOT EXISTS (
       SELECT 1 FROM editor_production_jobs
       WHERE order_id = ? AND order_item_id = ? AND job_type = 'production_pdf' AND status IN (${statuses})
     )`,
    [orderId, orderItemId, orderId, orderItemId],
  )
  return result.lastID != null ? Number(result.lastID) : null
}

export async function enqueueClientRenderedProductionIfReady(
  orderId: number,
  orderItemId: number,
): Promise<{ ready: boolean; jobId: number | null }> {
  const db = await getDb()
  const item = await db.get<{ params: string | null }>(
    'SELECT params FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  if (!item) return { ready: false, jobId: null }
  const params = parseParams(item.params)
  const manifest = readClientRenderedPagesManifest(params)
  if (!manifest) return { ready: false, jobId: null }
  const ready = await hasClientRenderedPageSet(orderId, orderItemId, manifest)
  if (!ready) {
    const uploadedPages = await countClientRenderedPages(orderId, orderItemId)
    logger.info('Editor production waits for client rendered PNG pages', {
      orderId,
      orderItemId,
      expectedPages: manifest.pageCount,
      uploadedPages,
      productionRenderSource: 'client_png',
    })
    return { ready: false, jobId: null }
  }
  const jobId = await enqueueProductionPdfJobIfMissing(orderId, orderItemId, true)
  logger.info('Editor production client PNG set ready, production PDF job enqueued', {
    orderId,
    orderItemId,
    expectedPages: manifest.pageCount,
    uploadedPages: manifest.pageCount,
    jobId,
    productionRenderSource: 'client_png',
  })
  return { ready: true, jobId }
}

async function resolveLatestDesignStateForProduction(
  params: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const draftTokens = collectEditorDraftTokens(params)
  if (draftTokens.length === 0) return parseObject(params.designState)

  const draftStates: Array<Record<string, unknown>> = []
  for (const token of draftTokens) {
    const draft = await getEditorDraft(token)
    if (!draft) continue
    const draftState = readDraftDesignState(draft.payloadParsed)
    if (draftState) draftStates.push(draftState)
  }
  const fallbackState = parseObject(params.designState)
  const resolvedState = mergeDraftDesignStates(draftStates) ?? fallbackState
  // #region agent log
  logger.info('[agent:pdf-mismatch] CRM production job resolved designState source summary', {
    runId: 'pdf-mismatch-prod',
    hypothesisId: 'H3',
    draftTokenCount: draftTokens.length,
    draftTokens: draftTokens.map(fingerprintAgentDebugToken),
    draftStatesCount: draftStates.length,
    hasFallbackDesignState: Boolean(fallbackState),
    usedFallback: draftStates.length === 0 && Boolean(fallbackState),
    resolved: summarizeDesignStateForAgentDebug(resolvedState),
  })
  // #endregion
  return resolvedState
}

export async function enqueueEditorProductionJobsForOrder(orderId: number): Promise<void> {
  const db = await getDb()
  const order = await db.get<{ source: string | null; status: number }>(
    'SELECT source, status FROM orders WHERE id = ?',
    [orderId],
  )
  if (!order) return
  const source = String(order.source ?? '')
  if (source !== 'website' && source !== 'mini_app') return

  const items = await db.all<Array<{ id: number; params: string | null }>>(
    'SELECT id, params FROM items WHERE orderId = ? ORDER BY id ASC',
    [orderId],
  )

  for (const item of items ?? []) {
    const params = parseParams(item.params)
    const clientRenderedPages = readClientRenderedPagesManifest(params)
    if (clientRenderedPages) {
      const uploadedPages = await countClientRenderedPages(orderId, item.id)
      if (uploadedPages < clientRenderedPages.pageCount) {
        logger.info('Editor production waits for client rendered PNG pages', {
          orderId,
          orderItemId: item.id,
          expectedPages: clientRenderedPages.pageCount,
          uploadedPages,
        })
        continue
      }
    } else if (!params.designState) {
      continue
    }
    await enqueueProductionPdfJobIfMissing(orderId, item.id)
  }
}

async function markJob(
  jobId: number,
  status: EditorProductionJobStatus,
  lastError?: string | null,
): Promise<void> {
  const db = await getDb()
  await db.run(
    `UPDATE editor_production_jobs
     SET status = ?, last_error = ?, attempts = attempts + 1, updated_at = datetime('now')
     WHERE id = ?`,
    [status, lastError ?? null, jobId],
  )
}

function expectsClientPngProduction(params: Record<string, unknown>): boolean {
  return params.productionRenderSource === 'client_png'
}

async function processProductionPdfJob(jobId: number, orderId: number, orderItemId: number): Promise<void> {
  const db = await getDb()
  const item = await db.get<{ params: string | null }>(
    'SELECT params FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  if (!item) throw new Error('Позиция не найдена')
  const params = parseParams(item.params)
  const expectsClientPng = expectsClientPngProduction(params)
  const clientRenderedPages = readClientRenderedPagesManifest(params)

  if (expectsClientPng) {
    if (!clientRenderedPages) {
      throw new Error(
        'Заказ ожидает client PNG (productionRenderSource=client_png), но manifest clientRenderedPages некорректен',
      )
    }
    const uploadedPages = await countClientRenderedPages(orderId, orderItemId)
    if (uploadedPages < clientRenderedPages.pageCount) {
      throw new Error(
        `Не загружены client PNG для production PDF: ${uploadedPages}/${clientRenderedPages.pageCount}`,
      )
    }
    await renderClientRenderedPagesProductionPdf(orderId, orderItemId, clientRenderedPages)
    await markJob(jobId, 'done')
    return
  }

  if (clientRenderedPages) {
    const uploadedPages = await countClientRenderedPages(orderId, orderItemId)
    if (uploadedPages < clientRenderedPages.pageCount) {
      throw new Error(
        `Не загружены client PNG для production PDF: ${uploadedPages}/${clientRenderedPages.pageCount}`,
      )
    }
    await renderClientRenderedPagesProductionPdf(orderId, orderItemId, clientRenderedPages)
    await markJob(jobId, 'done')
    return
  }

  const designState = await resolveLatestDesignStateForProduction(params)
  if (!designState) throw new Error('Нет designState')

  await renderDesignStateProductionPdf(orderId, orderItemId, designState)
  await markJob(jobId, 'done')
}

export async function processEditorProductionJobBatch(limit = 5): Promise<number> {
  const db = await getDb()
  const jobs = await db.all<Array<{
    id: number
    order_id: number
    order_item_id: number
    job_type: string
    attempts: number
  }>>(
    `SELECT id, order_id, order_item_id, job_type, attempts
     FROM editor_production_jobs
     WHERE status = 'pending' AND attempts < 5
     ORDER BY id ASC
     LIMIT ?`,
    [limit],
  )

  let processed = 0
  for (const job of jobs ?? []) {
    await markJob(job.id, 'processing')
    try {
      if (job.job_type === 'production_pdf') {
        await processProductionPdfJob(job.id, job.order_id, job.order_item_id)
      } else if (job.job_type === 'imposition_sra3') {
        await runImpositionJobForOrderItem(job.order_id, job.order_item_id)
        await markJob(job.id, 'done')
      } else {
        await markJob(job.id, 'failed', `Unknown job type: ${job.job_type}`)
      }
      processed += 1
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn('Editor production job failed', { jobId: job.id, message })
      await markJob(job.id, 'failed', message)
    }
  }
  return processed
}

export async function requestManualProductionRegeneration(
  orderId: number,
  orderItemId: number,
): Promise<{ jobId: number }> {
  const db = await getDb()
  const result = await db.run(
    `INSERT INTO editor_production_jobs (order_id, order_item_id, job_type, status, updated_at)
     VALUES (?, ?, 'production_pdf', 'pending', datetime('now'))`,
    [orderId, orderItemId],
  )
  return { jobId: Number(result.lastID) }
}

export async function getProductionStatus(
  orderId: number,
  orderItemId: number,
): Promise<{
  jobs: Array<{ id: number; jobType: string; status: string; lastError: string | null; attempts: number }>
  productionFiles: Array<{ id: number; filename: string; originalName: string | null; metadata: string | null }>
}> {
  const db = await getDb()
  const jobs = await db.all<Array<{
    id: number
    job_type: string
    status: string
    last_error: string | null
    attempts: number
  }>>(
    `SELECT id, job_type, status, last_error, attempts
     FROM editor_production_jobs
     WHERE order_id = ? AND order_item_id = ?
     ORDER BY id DESC`,
    [orderId, orderItemId],
  )
  const productionFiles = await db.all<Array<{
    id: number
    filename: string
    originalName: string | null
    metadata: string | null
  }>>(
    `SELECT id, filename, originalName, metadata
     FROM order_files
     WHERE orderId = ? AND orderItemId = ? AND artifactType = 'production_pdf'
     ORDER BY id ASC`,
    [orderId, orderItemId],
  )
  return {
    jobs: (jobs ?? []).map((j) => ({
      id: j.id,
      jobType: j.job_type,
      status: j.status,
      lastError: j.last_error,
      attempts: j.attempts,
    })),
    productionFiles: productionFiles ?? [],
  }
}
