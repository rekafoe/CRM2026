import { Database } from 'sqlite'
import { hasColumn } from '../../../utils/tableSchemaCache'
import { isWaitingStatusId } from '../../../utils/orderStatusCatalog'
import { websiteWaitingDeleteReason } from './websiteWaitingItemDeletePolicy'

async function tableExists(db: Pick<Database, 'get'>, name: string): Promise<boolean> {
  const row = await db.get<{ ok: number }>(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name,
  )
  return Boolean(row)
}

async function orderIsIssued(
  db: Pick<Database, 'get'>,
  orderId: number,
  statusId: number,
): Promise<boolean> {
  if (Number(statusId) === 7) return true
  try {
    const status = await db.get<{ code?: string | null; name?: string | null }>(
      `SELECT code, name FROM order_statuses WHERE id = ?`,
      statusId,
    )
    if (status?.code === 'completed' || status?.name === 'Завершён') return true
  } catch {
    /* справочника нет */
  }

  if (await tableExists(db, 'debt_closed_events')) {
    const closed = await db.get<{ ok: number }>(
      `SELECT 1 AS ok FROM debt_closed_events WHERE order_id = ? LIMIT 1`,
      orderId,
    )
    if (closed) return true
  }

  if (await tableExists(db, 'issued_documents')) {
    const issued = await db.get<{ ok: number }>(
      `SELECT 1 AS ok FROM issued_documents WHERE (',' || order_key || ',') LIKE ? LIMIT 1`,
      `%,${orderId},%`,
    )
    if (issued) return true
  }

  if (
    (await tableExists(db, 'customer_legal_documents')) &&
    (await hasColumn('customer_legal_documents', 'order_id'))
  ) {
    const legal = await db.get<{ ok: number }>(
      `SELECT 1 AS ok FROM customer_legal_documents WHERE order_id = ? LIMIT 1`,
      orderId,
    )
    if (legal) return true
  }

  return false
}

/** null — удаление не блокируем этим правилом. */
export async function websiteWaitingItemDeleteBlock(
  db: Pick<Database, 'get'>,
  orderId: number,
): Promise<string | null> {
  const order = await db.get<{
    source?: string | null
    status?: number | null
    prepaymentAmount?: number | null
    prepaymentStatus?: string | null
    paymentMethod?: string | null
  }>(
    `SELECT source, status, prepaymentAmount, prepaymentStatus, paymentMethod
       FROM orders WHERE id = ?`,
    orderId,
  )
  if (!order || order.source !== 'website') return null
  const statusId = Number(order.status)
  const waiting = await isWaitingStatusId(db, statusId)
  if (!waiting) return null
  const issued = await orderIsIssued(db, orderId, statusId)
  return websiteWaitingDeleteReason({
    source: order.source,
    waiting,
    prepaymentAmount: order.prepaymentAmount,
    prepaymentStatus: order.prepaymentStatus,
    paymentMethod: order.paymentMethod,
    issued,
  })
}
