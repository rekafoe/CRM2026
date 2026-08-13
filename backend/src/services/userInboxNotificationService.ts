import { getDb } from '../config/database'
import { logger } from '../utils/logger'

export type UserInboxNotification = {
  id: number
  userId: number
  type: string
  title: string
  message: string
  payload: Record<string, unknown> | null
  actorUserId: number | null
  isRead: boolean
  createdAt: string
  readAt: string | null
}

function mapRow(row: any): UserInboxNotification {
  let payload: Record<string, unknown> | null = null
  if (row.payload) {
    try {
      payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    } catch {
      payload = null
    }
  }
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    type: String(row.type || ''),
    title: String(row.title || ''),
    message: String(row.message || ''),
    payload,
    actorUserId: row.actor_user_id != null ? Number(row.actor_user_id) : null,
    isRead: Number(row.is_read) === 1,
    createdAt: String(row.created_at || ''),
    readAt: row.read_at != null ? String(row.read_at) : null,
  }
}

export class UserInboxNotificationService {
  static async create(params: {
    userId: number
    type: string
    title: string
    message: string
    payload?: Record<string, unknown> | null
    actorUserId?: number | null
  }): Promise<UserInboxNotification | null> {
    const userId = Number(params.userId)
    if (!Number.isFinite(userId) || userId <= 0) return null

    try {
      const db = await getDb()
      const result = await db.run(
        `INSERT INTO user_inbox_notifications
          (user_id, type, title, message, payload, actor_user_id, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now','localtime'))`,
        userId,
        params.type,
        params.title,
        params.message,
        params.payload ? JSON.stringify(params.payload) : null,
        params.actorUserId ?? null
      )
      const id = Number((result as any).lastID)
      const row = await db.get<any>('SELECT * FROM user_inbox_notifications WHERE id = ?', id)
      return row ? mapRow(row) : null
    } catch (e: any) {
      logger.warn('[UserInbox] create failed', { message: e?.message || String(e) })
      return null
    }
  }

  static async createMany(params: {
    userIds: Array<number | null | undefined>
    type: string
    title: string
    message: string
    payload?: Record<string, unknown> | null
    actorUserId?: number | null
  }): Promise<void> {
    const actorId = params.actorUserId != null ? Number(params.actorUserId) : null
    const recipients = [...new Set(
      params.userIds
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0 && id !== actorId),
    )]
    await Promise.all(recipients.map((userId) => this.create({
      userId,
      type: params.type,
      title: params.title,
      message: params.message,
      payload: params.payload,
      actorUserId: actorId,
    })))
  }

  static async listForUser(userId: number, opts?: { unreadOnly?: boolean; limit?: number }) {
    try {
      const db = await getDb()
      const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 30))
      const unreadOnly = Boolean(opts?.unreadOnly)
      const rows = await db.all<any>(
        `SELECT * FROM user_inbox_notifications
          WHERE user_id = ?
            ${unreadOnly ? 'AND is_read = 0' : ''}
          ORDER BY id DESC
          LIMIT ?`,
        userId,
        limit
      )
      return (rows || []).map(mapRow)
    } catch (e: any) {
      logger.warn('[UserInbox] listForUser failed (table may be missing)', { message: e?.message || String(e) })
      return []
    }
  }

  static async unreadCount(userId: number): Promise<number> {
    try {
      const db = await getDb()
      const row = await db.get<{ c: number }>(
        'SELECT COUNT(*) as c FROM user_inbox_notifications WHERE user_id = ? AND is_read = 0',
        userId
      )
      return Number(row?.c || 0)
    } catch {
      return 0
    }
  }

  static async markRead(userId: number, notificationIds?: number[]): Promise<number> {
    try {
      const db = await getDb()
      if (notificationIds && notificationIds.length > 0) {
        const ids = notificationIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        if (ids.length === 0) return 0
        const placeholders = ids.map(() => '?').join(',')
        const result = await db.run(
          `UPDATE user_inbox_notifications
              SET is_read = 1, read_at = datetime('now','localtime')
            WHERE user_id = ? AND is_read = 0 AND id IN (${placeholders})`,
          userId,
          ...ids
        )
        return Number((result as any).changes || 0)
      }
      const result = await db.run(
        `UPDATE user_inbox_notifications
            SET is_read = 1, read_at = datetime('now','localtime')
          WHERE user_id = ? AND is_read = 0`,
        userId
      )
      return Number((result as any).changes || 0)
    } catch (e: any) {
      logger.warn('[UserInbox] markRead failed', { message: e?.message || String(e) })
      return 0
    }
  }

  /**
   * Уведомление исполнителю: вас назначили по позиции заказа.
   */
  static async notifyExecutorAssigned(params: {
    executorUserId: number | null | undefined
    previousExecutorUserId?: number | null
    actorUserId?: number | null
    orderId: number
    orderNumber?: string | null
    itemId: number
    itemType?: string | null
  }): Promise<void> {
    const executorId = Number(params.executorUserId)
    if (!Number.isFinite(executorId) || executorId <= 0) return

    const prev = params.previousExecutorUserId != null ? Number(params.previousExecutorUserId) : null
    if (prev != null && prev === executorId) return

    const actorId = params.actorUserId != null ? Number(params.actorUserId) : null
    if (actorId != null && actorId === executorId) return

    const orderLabel = params.orderNumber || `ORD-${params.orderId}`
    const itemLabel = params.itemType ? String(params.itemType) : `позиция #${params.itemId}`

    await this.create({
      userId: executorId,
      type: 'executor_assigned',
      title: 'Вас назначили исполнителем',
      message: `Заказ ${orderLabel}: ${itemLabel}. Заказ появился в вашем списке с пометкой «Исполнитель по позиции».`,
      actorUserId: actorId,
      payload: {
        orderId: params.orderId,
        orderNumber: orderLabel,
        itemId: params.itemId,
        itemType: params.itemType || null,
      },
    })
  }
}
