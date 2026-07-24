import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { logger } from '../utils/logger'

const router = Router()

type BePaidWebhookBody = {
  payment_id?: string
  status?: string
  order_id?: number | string
  transaction?: {
    uid?: string
    status?: string
    amount?: number
    tracking_id?: string
  }
  checkout?: {
    status?: string
    order?: { tracking_id?: string | null; amount?: number }
    gateway_response?: { payment?: { uid?: string; status?: string; amount?: number } }
  }
}

function mapBePaidStatus(raw: string): 'paid' | 'failed' | 'pending' | null {
  const s = raw.toLowerCase()
  if (s === 'successful' || s === 'paid' || s === 'success') return 'paid'
  if (s === 'failed' || s === 'error' || s === 'declined' || s === 'expired') return 'failed'
  if (s === 'pending' || s === 'incomplete' || s === 'in_progress') return 'pending'
  return null
}

// POST /api/webhooks/bepaid — статус оплаты BePaid (checkout notification)
router.post(
  '/bepaid',
  asyncHandler(async (req, res) => {
    const body = (req.body || {}) as BePaidWebhookBody
    const tx = body.transaction
    const gatewayPayment = body.checkout?.gateway_response?.payment

    const statusRaw = String(
      tx?.status ?? gatewayPayment?.status ?? body.checkout?.status ?? body.status ?? '',
    ).trim()
    const prepaymentStatus = mapBePaidStatus(statusRaw)
    const paymentId = String(tx?.uid ?? gatewayPayment?.uid ?? body.payment_id ?? '').trim()
    const trackingId = String(
      tx?.tracking_id ?? body.checkout?.order?.tracking_id ?? body.order_id ?? '',
    ).trim()
    const amountMinor = Number(tx?.amount ?? gatewayPayment?.amount ?? body.checkout?.order?.amount ?? 0)
    const amountByn =
      Number.isFinite(amountMinor) && amountMinor > 0 ? Math.round(amountMinor) / 100 : 0

    if (!paymentId && !trackingId) {
      res.status(400).json({ message: 'payment_id or tracking_id required' })
      return
    }
    if (!prepaymentStatus) {
      res.status(204).end()
      return
    }

    const db = await getDb()
    let order = paymentId
      ? await db.get<{ id: number; prepaymentAmount?: number | string | null }>(
          'SELECT id, prepaymentAmount FROM orders WHERE paymentId = ?',
          paymentId,
        )
      : undefined
    if (!order && trackingId) {
      order = await db.get<{ id: number; prepaymentAmount?: number | string | null }>(
        'SELECT id, prepaymentAmount FROM orders WHERE number = ?',
        trackingId,
      )
      if (!order && /^\d+$/.test(trackingId)) {
        order = await db.get<{ id: number; prepaymentAmount?: number | string | null }>(
          'SELECT id, prepaymentAmount FROM orders WHERE id = ?',
          Number(trackingId),
        )
      }
    }
    if (!order) {
      logger.warn('BePaid webhook: order not found', { paymentId, trackingId, statusRaw })
      res.status(204).end()
      return
    }

    let hasPrepaymentUpdatedAt = false
    try {
      hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
    } catch {
      hasPrepaymentUpdatedAt = false
    }

    const existingPrepay = Number(order.prepaymentAmount ?? 0)
    const amount =
      prepaymentStatus === 'paid'
        ? amountByn > 0
          ? amountByn
          : existingPrepay > 0
            ? existingPrepay
            : 0
        : prepaymentStatus === 'failed'
          ? 0
          : existingPrepay

    if (prepaymentStatus === 'paid' && amount <= 0) {
      logger.warn('BePaid webhook: paid without amount', { orderId: order.id, paymentId })
      res.status(204).end()
      return
    }

    if (prepaymentStatus === 'paid') {
      const sql = hasPrepaymentUpdatedAt
        ? `UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentMethod = 'online',
           paymentUrl = NULL, paymentId = COALESCE(?, paymentId), prepaymentUpdatedAt = datetime('now','localtime'),
           updated_at = datetime('now','localtime') WHERE id = ?`
        : `UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentMethod = 'online',
           paymentUrl = NULL, paymentId = COALESCE(?, paymentId), updated_at = datetime('now','localtime') WHERE id = ?`
      await db.run(sql, amount, paymentId || null, order.id)
    } else if (prepaymentStatus === 'failed') {
      const sql = hasPrepaymentUpdatedAt
        ? `UPDATE orders SET prepaymentStatus = 'failed', paymentMethod = 'online',
           paymentId = COALESCE(?, paymentId), updated_at = datetime('now','localtime') WHERE id = ?`
        : `UPDATE orders SET prepaymentStatus = 'failed', paymentMethod = 'online',
           paymentId = COALESCE(?, paymentId), updated_at = datetime('now','localtime') WHERE id = ?`
      await db.run(sql, paymentId || null, order.id)
    } else {
      const sql = `UPDATE orders SET prepaymentStatus = 'pending', paymentMethod = 'online',
         paymentId = COALESCE(?, paymentId), updated_at = datetime('now','localtime') WHERE id = ?`
      await db.run(sql, paymentId || null, order.id)
    }

    logger.info('BePaid webhook applied', {
      orderId: order.id,
      prepaymentStatus,
      paymentId: paymentId || undefined,
    })
    res.status(204).end()
  }),
)

export default router
