import { getDb } from '../config/database'
import { logger } from '../utils/logger'
import { renderDesignStateProductionPdf } from './editorProductionRenderService'
import { runImpositionJobForOrderItem } from './editorImpositionService'

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
    if (!params.designState) continue
    await db.run(
      `INSERT INTO editor_production_jobs (order_id, order_item_id, job_type, status, updated_at)
       SELECT ?, ?, 'production_pdf', 'pending', datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM editor_production_jobs
         WHERE order_id = ? AND order_item_id = ? AND job_type = 'production_pdf' AND status IN ('pending', 'processing')
       )`,
      [orderId, item.id, orderId, item.id],
    )
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

async function processProductionPdfJob(jobId: number, orderId: number, orderItemId: number): Promise<void> {
  const db = await getDb()
  const item = await db.get<{ params: string | null }>(
    'SELECT params FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  if (!item) throw new Error('Позиция не найдена')
  const params = parseParams(item.params)
  if (!params.designState) throw new Error('Нет designState')

  await renderDesignStateProductionPdf(orderId, orderItemId, params.designState)
  await markJob(jobId, 'done')

  if (params.editorLayoutGroup) {
    await db.run(
      `INSERT INTO editor_production_jobs (order_id, order_item_id, job_type, status, updated_at)
       VALUES (?, ?, 'imposition_sra3', 'pending', datetime('now'))`,
      [orderId, orderItemId],
    )
  }
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
