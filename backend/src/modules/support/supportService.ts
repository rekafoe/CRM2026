import crypto from 'crypto'
import { Database } from 'sqlite'
import { getDb } from '../../config/database'
import { UserInboxNotificationService } from '../../services/userInboxNotificationService'
import { WebsiteCustomer } from './supportCustomerAuth'
import { SupportError } from './supportErrors'

export const SUPPORT_TOPICS = [
  { id: 'print_quality', label: 'Качество печати' },
  { id: 'wrong_size', label: 'Неверный размер' },
  { id: 'wrong_design', label: 'Ошибка в макете' },
  { id: 'shipping_damage', label: 'Повреждение при доставке' },
  { id: 'missing_items', label: 'Не хватает позиций' },
  { id: 'shipping', label: 'Доставка' },
  { id: 'design_help', label: 'Помощь с макетом' },
  { id: 'other', label: 'Другое' },
] as const

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]['id']
export type ChatFilter = 'unassigned' | 'mine' | 'open' | 'closed'

const TOPIC_IDS = new Set<string>(SUPPORT_TOPICS.map((item) => item.id))
const FILTERS = new Set<ChatFilter>(['unassigned', 'mine', 'open', 'closed'])
const MESSAGE_MAX = 4000
const SCRIPT_MAX = 2000
const TITLE_MAX = 40

export interface StaffActor {
  id: number
  role: string
  name: string
}

export function assertOperatorRole(role: string) {
  if (role === 'viewer') throw new SupportError(403, 'Наблюдателю чаты недоступны')
}

interface ConversationRow {
  id: number
  public_id: string
  channel: string
  website_user_id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  topic: string
  subject: string | null
  order_ref: string | null
  status: string
  assigned_user_id: number | null
  assigned_name: string | null
  last_message_at: string
  last_message_preview: string | null
  operator_unread: number
  crm_order_id: number | null
  crm_order_number?: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  last_id: number | null
  last_body: string | null
  last_direction: string | null
  last_created: string | null
  last_operator_name: string | null
  staff_low_id: number | null
  staff_high_id: number | null
  staff_low_unread: number | null
  staff_high_unread: number | null
  staff_low_name: string | null
  staff_high_name: string | null
}

interface MessageRow {
  id: number
  direction: string
  body: string
  operator_name: string | null
  operator_user_id?: number | null
  created_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function topicLabel(topic: string): string {
  return SUPPORT_TOPICS.find((item) => item.id === topic)?.label || 'Обращение'
}

function preview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

function publicId(): string {
  return crypto.randomBytes(12).toString('base64url')
}

function cleanMessage(value: unknown): string {
  if (typeof value !== 'string') throw new SupportError(400, 'Напишите сообщение')
  const text = value.replace(/\u0000/g, '').trim()
  if (!text) throw new SupportError(400, 'Напишите сообщение')
  if (text.length > MESSAGE_MAX) throw new SupportError(400, 'Сообщение слишком длинное')
  return text
}

function cleanTopic(value: unknown): SupportTopic {
  if (typeof value !== 'string' || !TOPIC_IDS.has(value)) {
    throw new SupportError(400, 'Выберите тему обращения')
  }
  return value as SupportTopic
}

function cleanOrder(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new SupportError(400, 'Некорректный номер заказа')
  }
  const text = String(value).trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(text)) {
    throw new SupportError(400, 'Некорректный номер заказа')
  }
  return text
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') throw new SupportError(400, 'Укажите название скрипта')
  const text = value.replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) throw new SupportError(400, 'Укажите название скрипта')
  if (text.length > TITLE_MAX) throw new SupportError(400, 'Название скрипта слишком длинное')
  return text
}

function cleanScriptBody(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'string') throw new SupportError(400, 'Некорректный текст скрипта')
  const text = value.replace(/\u0000/g, '').trim()
  if (text.length > SCRIPT_MAX) throw new SupportError(400, 'Текст скрипта слишком длинный')
  return text
}

function emptyToNull(value: string): string | null {
  return value ? value : null
}

function customerStatus(row: ConversationRow): 'open' | 'waiting' | 'closed' {
  if (row.status === 'closed') return 'closed'
  if (row.last_direction === 'out') return 'waiting'
  return 'open'
}

function customerMessage(row: ConversationRow) {
  if (!row.last_id || !row.last_body || !row.last_created || !row.last_direction) return undefined
  return {
    id: String(row.last_id),
    conversationId: row.public_id,
    sender: row.last_direction === 'out' ? 'operator' as const : 'customer' as const,
    text: row.last_body,
    createdAt: row.last_created,
    ...(row.last_operator_name ? { operatorName: row.last_operator_name } : {}),
  }
}

function presentCustomer(row: ConversationRow) {
  const lastMessage = customerMessage(row)
  return {
    id: row.public_id,
    topic: row.topic,
    subject: row.subject || topicLabel(row.topic),
    orderId: row.order_ref,
    status: customerStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(lastMessage ? { lastMessage } : {}),
  }
}

function presentOperator(row: ConversationRow, staffId: number) {
  return {
    id: row.public_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    topic: row.topic,
    topicLabel: topicLabel(row.topic),
    channel: 'website' as const,
    orderRef: row.order_ref,
    crmOrderId: row.crm_order_id ?? null,
    crmOrderNumber: row.crm_order_number || null,
    status: row.status === 'closed' ? 'closed' as const : 'open' as const,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_name,
    mine: row.assigned_user_id === staffId,
    lastMessagePreview: row.last_message_preview || '',
    lastMessageAt: row.last_message_at,
    operatorUnread: Number(row.operator_unread || 0),
    awaitingReply: row.status !== 'closed' && row.last_direction === 'in',
  }
}

function presentStaff(row: ConversationRow, staffId: number) {
  const viewerIsLow = row.staff_low_id === staffId
  const peerName = (viewerIsLow ? row.staff_high_name : row.staff_low_name) || 'Сотрудник'
  const peerId = viewerIsLow ? row.staff_high_id : row.staff_low_id
  const unread = Number((viewerIsLow ? row.staff_low_unread : row.staff_high_unread) || 0)
  return {
    id: row.public_id,
    channel: 'staff' as const,
    customerName: peerName,
    customerEmail: null,
    customerPhone: null,
    topic: 'staff',
    topicLabel: 'Команда',
    orderRef: null,
    crmOrderId: null,
    crmOrderNumber: null,
    status: 'open' as const,
    assignedUserId: peerId,
    assignedUserName: peerName,
    mine: true,
    peerUserId: peerId,
    lastMessagePreview: row.last_message_preview || '',
    lastMessageAt: row.last_message_at,
    operatorUnread: unread,
    awaitingReply: unread > 0,
  }
}

function presentMessage(row: MessageRow, conversationId: string) {
  return {
    id: String(row.id),
    conversationId,
    sender: row.direction === 'out' ? 'operator' as const : 'customer' as const,
    text: row.body,
    createdAt: row.created_at,
    ...(row.operator_name ? { operatorName: row.operator_name } : {}),
  }
}

const CONVERSATION_SELECT = `
  SELECT
    c.id, c.public_id, c.channel, c.website_user_id, c.customer_name, c.customer_email,
    c.customer_phone, c.topic, c.subject, c.order_ref, c.status, c.assigned_user_id,
    c.last_message_at, c.last_message_preview, c.operator_unread, c.crm_order_id,
    c.staff_low_id, c.staff_high_id, c.staff_low_unread, c.staff_high_unread,
    c.created_at, c.updated_at, c.closed_at,
    u.name AS assigned_name,
    lowu.name AS staff_low_name, highu.name AS staff_high_name,
    m.id AS last_id, m.body AS last_body, m.direction AS last_direction,
    m.created_at AS last_created, m.operator_name AS last_operator_name
  FROM support_conversations c
  LEFT JOIN users u ON u.id = c.assigned_user_id
  LEFT JOIN users lowu ON lowu.id = c.staff_low_id
  LEFT JOIN users highu ON highu.id = c.staff_high_id
  LEFT JOIN support_messages m ON m.id = (
    SELECT id FROM support_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
  )
`

async function withTx<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const db = await getDb()
  await db.run('BEGIN IMMEDIATE')
  try {
    const value = await work(db)
    await db.run('COMMIT')
    return value
  } catch (error) {
    try { await db.run('ROLLBACK') } catch { /* already rolled back */ }
    throw error
  }
}

async function findRow(db: Database, publicIdValue: string, websiteUserId?: string): Promise<ConversationRow | undefined> {
  const params: Array<string> = [publicIdValue]
  let sql = `${CONVERSATION_SELECT} WHERE c.public_id = ? AND c.channel = 'website'`
  if (websiteUserId) {
    sql += ' AND c.website_user_id = ?'
    params.push(websiteUserId)
  }
  return db.get<ConversationRow>(sql, ...params)
}

async function requireRow(db: Database, publicIdValue: string, websiteUserId?: string): Promise<ConversationRow> {
  const row = await findRow(db, publicIdValue, websiteUserId)
  if (!row) throw new SupportError(404, 'Чат не найден')
  return row
}

function assertWebsiteChat(row: ConversationRow) {
  if (row.channel === 'staff') throw new SupportError(409, 'Это личная переписка')
  if (row.channel !== 'website') throw new SupportError(404, 'Чат не найден')
}

async function loadConversation(db: Database, publicIdValue: string): Promise<ConversationRow | undefined> {
  return db.get<ConversationRow>(`${CONVERSATION_SELECT} WHERE c.public_id = ?`, publicIdValue)
}

async function requireOperatorRow(db: Database, publicIdValue: string, staff: StaffActor): Promise<ConversationRow> {
  const row = await loadConversation(db, publicIdValue)
  if (!row) throw new SupportError(404, 'Чат не найден')
  if (row.channel === 'staff') {
    if (row.staff_low_id !== staff.id && row.staff_high_id !== staff.id) {
      throw new SupportError(404, 'Чат не найден')
    }
    return row
  }
  assertWebsiteChat(row)
  return row
}

function cleanStaffUserId(value: unknown): number {
  const userId = Number(value)
  if (!Number.isInteger(userId) || userId <= 0) throw new SupportError(400, 'Выберите сотрудника')
  return userId
}

function isUniquePair(error: unknown): boolean {
  return String((error as Error)?.message || error).includes('UNIQUE')
}

async function insertEvent(db: Database, conversationId: number, type: string, actorId: number | null, payload?: Record<string, unknown>) {
  await db.run(
    'INSERT INTO support_events (conversation_id, type, actor_user_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    conversationId,
    type,
    actorId,
    payload ? JSON.stringify(payload) : null,
    nowIso(),
  )
}

function missingSchema(error: unknown): boolean {
  const message = String((error as Error)?.message || error)
  return message.includes('no such table') || message.includes('no such column')
}

function phoneTail(phone: string | null | undefined): string | null {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 6 || digits.length > 15) return null
  return digits.length > 9 ? digits.slice(-9) : digits
}

async function findCrmOrder(
  db: Database,
  orderRef: string | null,
  phone: string | null,
): Promise<{ id: number; number: string } | null> {
  if (orderRef) {
    try {
      const byNumber = await db.get<{ id: number; number: string }>(
        'SELECT id, number FROM orders WHERE number = ? LIMIT 1',
        orderRef,
      )
      if (byNumber?.id) return { id: Number(byNumber.id), number: String(byNumber.number) }
    } catch (error) {
      if (missingSchema(error)) return null
      throw error
    }
  }

  const tail = phoneTail(phone)
  if (!tail) return null
  const phoneSql = `replace(replace(replace(replace(replace(COALESCE(%s, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE '%' || ? || '%'`
  try {
    const byOrderPhone = await db.get<{ id: number; number: string }>(
      `SELECT id, number FROM orders
       WHERE ${phoneSql.replace('%s', 'customerPhone')}
       ORDER BY id DESC LIMIT 1`,
      tail,
    )
    if (byOrderPhone?.id) return { id: Number(byOrderPhone.id), number: String(byOrderPhone.number) }
  } catch (error) {
    if (missingSchema(error)) return null
    throw error
  }

  try {
    const byCustomer = await db.get<{ id: number; number: string }>(
      `SELECT o.id, o.number FROM orders o
       INNER JOIN customers cu ON cu.id = o.customer_id
       WHERE ${phoneSql.replace('%s', 'cu.phone')}
       ORDER BY o.id DESC LIMIT 1`,
      tail,
    )
    if (byCustomer?.id) return { id: Number(byCustomer.id), number: String(byCustomer.number) }
  } catch (error) {
    if (missingSchema(error)) return null
    throw error
  }
  return null
}

async function rememberOrder(db: Database, row: ConversationRow): Promise<ConversationRow> {
  try {
    if (row.crm_order_id) {
      const saved = await db.get<{ number: string }>(
        'SELECT number FROM orders WHERE id = ?',
        row.crm_order_id,
      )
      return { ...row, crm_order_number: saved?.number ?? null }
    }
    const found = await findCrmOrder(db, row.order_ref, row.customer_phone)
    if (!found) return row
    await db.run(
      'UPDATE support_conversations SET crm_order_id = ? WHERE id = ? AND crm_order_id IS NULL',
      found.id,
      row.id,
    )
    return { ...row, crm_order_id: found.id, crm_order_number: found.number }
  } catch (error) {
    if (missingSchema(error)) return row
    throw error
  }
}

async function notifyCustomerWrote(row: ConversationRow, text: string, opened: boolean) {
  try {
    const db = await getDb()
    const table = await db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_inbox_notifications'`,
    )
    if (!table) return
    let userIds: number[] = []
    if (row.assigned_user_id) {
      userIds = [row.assigned_user_id]
    } else {
      const staff = await db.all<Array<{ id: number }>>(
        `SELECT id FROM users
         WHERE COALESCE(is_active, 1) = 1 AND COALESCE(role, 'user') != 'viewer'`,
      )
      userIds = staff.map((item) => Number(item.id))
    }
    await UserInboxNotificationService.createMany({
      userIds,
      type: opened ? 'support_opened' : 'support_customer_reply',
      title: opened ? 'Новое обращение' : 'Клиент ответил в диалоге',
      message: `${row.customer_name}: ${preview(text)}`,
      payload: { path: `/adminpanel/chats?chat=${encodeURIComponent(row.public_id)}` },
    })
  } catch (error) {
    if (!missingSchema(error)) throw error
  }
}

async function notifyStaffMessage(peerId: number | null, staff: StaffActor, text: string, publicIdValue: string) {
  if (!peerId) return
  try {
    const db = await getDb()
    const table = await db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_inbox_notifications'`,
    )
    if (!table) return
    await UserInboxNotificationService.create({
      userId: peerId,
      type: 'support_staff',
      title: `Сообщение от ${staff.name}`,
      message: preview(text),
      payload: { path: `/adminpanel/chats?chat=${encodeURIComponent(publicIdValue)}&mode=team` },
      actorUserId: staff.id,
    })
  } catch (error) {
    if (!missingSchema(error)) throw error
  }
}

export class SupportService {
  static async listForCustomer(customer: WebsiteCustomer) {
    const db = await getDb()
    const rows = await db.all<ConversationRow[]>(
      `${CONVERSATION_SELECT}
       WHERE c.website_user_id = ? AND c.channel = 'website'
       ORDER BY c.last_message_at DESC
       LIMIT 100`,
      customer.id,
    )
    return { conversations: rows.map(presentCustomer) }
  }

  static async createForCustomer(customer: WebsiteCustomer, input: { topic: unknown; text: unknown; orderId?: unknown }) {
    const topic = cleanTopic(input.topic)
    const text = cleanMessage(input.text)
    const orderRef = cleanOrder(input.orderId)
    const createdAt = nowIso()
    const idValue = publicId()

    const row = await withTx(async (db) => {
      const inserted = await db.run(
        `INSERT INTO support_conversations (
          public_id, channel, website_user_id, customer_name, customer_email, customer_phone,
          topic, subject, order_ref, status, last_message_at, last_message_preview,
          customer_unread, operator_unread, created_at, updated_at
        ) VALUES (?, 'website', ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 0, 1, ?, ?)`,
        idValue,
        customer.id,
        customer.name,
        emptyToNull(customer.email),
        emptyToNull(customer.phone),
        topic,
        topicLabel(topic),
        orderRef,
        createdAt,
        preview(text),
        createdAt,
        createdAt,
      )
      const conversationId = Number(inserted.lastID)
      await db.run(
        `INSERT INTO support_messages (conversation_id, direction, body, created_at) VALUES (?, 'in', ?, ?)`,
        conversationId,
        text,
        createdAt,
      )
      await insertEvent(db, conversationId, 'opened', null, { topic })
      return requireRow(db, idValue, customer.id)
    })
    const linked = await rememberOrder(await getDb(), row)
    await notifyCustomerWrote(linked, text, true)
    return { conversation: presentCustomer(linked) }
  }

  static async listMessagesForCustomer(customer: WebsiteCustomer, publicIdValue: string) {
    const db = await getDb()
    const row = await requireRow(db, publicIdValue, customer.id)
    await db.run('UPDATE support_conversations SET customer_unread = 0 WHERE id = ?', row.id)
    const messages = await db.all<MessageRow[]>(
      `SELECT id, direction, body, operator_name, created_at
       FROM support_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 500`,
      row.id,
    )
    return { messages: messages.map((message) => presentMessage(message, row.public_id)) }
  }

  static async addCustomerMessage(customer: WebsiteCustomer, publicIdValue: string, textValue: unknown) {
    const text = cleanMessage(textValue)
    const createdAt = nowIso()
    const saved = await withTx(async (db) => {
      const row = await requireRow(db, publicIdValue, customer.id)
      const reopened = row.status === 'closed'
      await db.run(
        `UPDATE support_conversations
         SET customer_name = ?, customer_email = ?, customer_phone = ?,
             status = 'open', closed_at = NULL, last_message_at = ?, last_message_preview = ?,
             operator_unread = operator_unread + 1, updated_at = ?
         WHERE id = ?`,
        customer.name,
        emptyToNull(customer.email),
        emptyToNull(customer.phone),
        createdAt,
        preview(text),
        createdAt,
        row.id,
      )
      const inserted = await db.run(
        `INSERT INTO support_messages (conversation_id, direction, body, created_at) VALUES (?, 'in', ?, ?)`,
        row.id,
        text,
        createdAt,
      )
      if (reopened) await insertEvent(db, row.id, 'reopened', null)
      return {
        publicId: row.public_id,
        message: presentMessage({
          id: Number(inserted.lastID),
          direction: 'in',
          body: text,
          operator_name: null,
          created_at: createdAt,
        }, row.public_id),
      }
    })
    const fresh = await requireRow(await getDb(), saved.publicId, customer.id)
    const linked = await rememberOrder(await getDb(), fresh)
    await notifyCustomerWrote(linked, text, false)
    return { message: saved.message }
  }

  static async listStaff(staff: StaffActor) {
    const db = await getDb()
    const rows = await db.all<ConversationRow[]>(
      `${CONVERSATION_SELECT}
       WHERE c.channel = 'staff' AND (c.staff_low_id = ? OR c.staff_high_id = ?)
       ORDER BY c.last_message_at DESC
       LIMIT 100`,
      staff.id,
      staff.id,
    )
    return { conversations: rows.map((row) => presentStaff(row, staff.id)) }
  }

  static async openStaffThread(staff: StaffActor, userIdValue: unknown) {
    const userId = cleanStaffUserId(userIdValue)
    if (userId === staff.id) throw new SupportError(400, 'Нельзя написать самому себе')
    const db = await getDb()
    const target = await db.get<{ id: number; name: string }>(
      `SELECT id, name FROM users
       WHERE id = ? AND COALESCE(is_active, 1) = 1 AND COALESCE(role, 'user') != 'viewer'`,
      userId,
    )
    if (!target) throw new SupportError(400, 'Сотрудник не найден')
    const low = Math.min(staff.id, target.id)
    const high = Math.max(staff.id, target.id)
    const existing = await db.get<{ public_id: string }>(
      `SELECT public_id FROM support_conversations
       WHERE channel = 'staff' AND staff_low_id = ? AND staff_high_id = ?`,
      low,
      high,
    )
    if (existing) {
      const row = await loadConversation(db, existing.public_id)
      if (!row) throw new SupportError(404, 'Чат не найден')
      return { conversation: presentStaff(row, staff.id) }
    }
    const createdAt = nowIso()
    const idValue = publicId()
    const lowName = low === staff.id ? staff.name : target.name
    const highName = high === staff.id ? staff.name : target.name
    try {
      await withTx(async (tx) => {
        await tx.run(
          `INSERT INTO support_conversations (
            public_id, channel, website_user_id, customer_name, topic, subject, status,
            staff_low_id, staff_high_id, staff_low_unread, staff_high_unread,
            last_message_at, last_message_preview, customer_unread, operator_unread,
            created_at, updated_at
          ) VALUES (?, 'staff', ?, ?, 'staff', 'Личная переписка', 'open', ?, ?, 0, 0, ?, '', 0, 0, ?, ?)`,
          idValue,
          `staff:${low}:${high}`,
          `${lowName} · ${highName}`,
          low,
          high,
          createdAt,
          createdAt,
          createdAt,
        )
      })
    } catch (error) {
      if (!isUniquePair(error)) throw error
    }
    const row = await db.get<{ public_id: string }>(
      `SELECT public_id FROM support_conversations
       WHERE channel = 'staff' AND staff_low_id = ? AND staff_high_id = ?`,
      low,
      high,
    )
    if (!row) throw new SupportError(404, 'Чат не найден')
    const loaded = await loadConversation(db, row.public_id)
    if (!loaded) throw new SupportError(404, 'Чат не найден')
    return { conversation: presentStaff(loaded, staff.id) }
  }

  static async listForOperator(staff: StaffActor, filterValue: unknown) {
    const filter = typeof filterValue === 'string' && FILTERS.has(filterValue as ChatFilter)
      ? filterValue as ChatFilter
      : null
    if (!filter) throw new SupportError(400, 'Неизвестный фильтр')
    const db = await getDb()
    const where = filter === 'unassigned'
      ? `c.channel = 'website' AND c.status != 'closed' AND c.assigned_user_id IS NULL`
      : filter === 'mine'
        ? `c.channel = 'website' AND c.status != 'closed' AND c.assigned_user_id = ?`
        : filter === 'closed'
          ? `c.channel = 'website' AND c.status = 'closed'`
          : `c.channel = 'website' AND c.status != 'closed'`
    const params = filter === 'mine' ? [staff.id] : []
    const rows = await db.all<ConversationRow[]>(
      `${CONVERSATION_SELECT} WHERE ${where} ORDER BY c.last_message_at DESC LIMIT 100`,
      ...params,
    )
    const count = await db.get<{ c: number }>(
      `SELECT COUNT(1) as c FROM support_conversations
       WHERE channel = 'website' AND status != 'closed' AND assigned_user_id IS NULL`,
    )
    return {
      conversations: rows.map((row) => presentOperator(row, staff.id)),
      unassignedCount: Number(count?.c || 0),
    }
  }

  static async getForOperator(staff: StaffActor, publicIdValue: string) {
    const db = await getDb()
    const loaded = await requireOperatorRow(db, publicIdValue, staff)
    if (loaded.channel === 'staff') {
      await db.run(
        `UPDATE support_conversations
         SET staff_low_unread = CASE WHEN staff_low_id = ? THEN 0 ELSE staff_low_unread END,
             staff_high_unread = CASE WHEN staff_high_id = ? THEN 0 ELSE staff_high_unread END
         WHERE id = ?`,
        staff.id,
        staff.id,
        loaded.id,
      )
      const cleared = {
        ...loaded,
        staff_low_unread: loaded.staff_low_id === staff.id ? 0 : loaded.staff_low_unread,
        staff_high_unread: loaded.staff_high_id === staff.id ? 0 : loaded.staff_high_unread,
      }
      const messages = await db.all<MessageRow[]>(
        `SELECT id, direction, body, operator_name, operator_user_id, created_at
         FROM support_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 500`,
        loaded.id,
      )
      return {
        conversation: presentStaff(cleared, staff.id),
        messages: messages.map((message) => ({
          id: String(message.id),
          direction: message.operator_user_id === staff.id ? 'out' as const : 'in' as const,
          text: message.body,
          operatorName: message.operator_name,
          createdAt: message.created_at,
        })),
      }
    }
    const row = await rememberOrder(db, loaded)
    await db.run('UPDATE support_conversations SET operator_unread = 0 WHERE id = ?', row.id)
    const messages = await db.all<MessageRow[]>(
      `SELECT id, direction, body, operator_name, operator_user_id, created_at
       FROM support_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 500`,
      row.id,
    )
    return {
      conversation: presentOperator({ ...row, operator_unread: 0 }, staff.id),
      messages: messages.map((message) => ({
        id: String(message.id),
        direction: message.direction === 'out' ? 'out' as const : 'in' as const,
        text: message.body,
        operatorName: message.operator_name,
        createdAt: message.created_at,
      })),
    }
  }

  static async claim(staff: StaffActor, publicIdValue: string) {
    const row = await withTx(async (db) => {
      const current = await requireOperatorRow(db, publicIdValue, staff)
      assertWebsiteChat(current)
      if (current.status === 'closed') throw new SupportError(409, 'Чат закрыт')
      if (current.assigned_user_id === staff.id) return current
      if (current.assigned_user_id != null) throw new SupportError(409, 'Чат уже ведёт другой сотрудник')
      const updated = await db.run(
        `UPDATE support_conversations
         SET assigned_user_id = ?, updated_at = ?
         WHERE id = ? AND assigned_user_id IS NULL AND status != 'closed'`,
        staff.id,
        nowIso(),
        current.id,
      )
      if (!updated.changes) throw new SupportError(409, 'Чат уже взяли')
      await insertEvent(db, current.id, 'claimed', staff.id)
      return requireRow(db, publicIdValue)
    })
    return { conversation: presentOperator(row, staff.id) }
  }

  static async transfer(staff: StaffActor, publicIdValue: string, userIdValue: unknown) {
    const userId = Number(userIdValue)
    if (!Number.isInteger(userId) || userId <= 0) throw new SupportError(400, 'Выберите сотрудника')
    const row = await withTx(async (db) => {
      const target = await db.get<{ id: number; name: string }>(
        `SELECT id, name FROM users
         WHERE id = ? AND COALESCE(is_active, 1) = 1 AND COALESCE(role, 'user') != 'viewer'`,
        userId,
      )
      if (!target) throw new SupportError(400, 'Сотрудник не найден')
      const current = await requireOperatorRow(db, publicIdValue, staff)
      assertWebsiteChat(current)
      if (current.status === 'closed') throw new SupportError(409, 'Чат закрыт')
      if (current.assigned_user_id === target.id) return current
      await db.run(
        'UPDATE support_conversations SET assigned_user_id = ?, updated_at = ? WHERE id = ?',
        target.id,
        nowIso(),
        current.id,
      )
      await insertEvent(db, current.id, 'transferred', staff.id, { toUserId: target.id, toName: target.name })
      return requireRow(db, publicIdValue)
    })
    return { conversation: presentOperator(row, staff.id) }
  }

  static async release(staff: StaffActor, publicIdValue: string) {
    const row = await withTx(async (db) => {
      const current = await requireOperatorRow(db, publicIdValue, staff)
      assertWebsiteChat(current)
      if (current.assigned_user_id == null) return current
      if (current.assigned_user_id !== staff.id && staff.role !== 'admin') {
        throw new SupportError(403, 'Снять чат может тот, кто его ведёт')
      }
      await db.run(
        'UPDATE support_conversations SET assigned_user_id = NULL, updated_at = ? WHERE id = ?',
        nowIso(),
        current.id,
      )
      await insertEvent(db, current.id, 'released', staff.id)
      return requireRow(db, publicIdValue)
    })
    return { conversation: presentOperator(row, staff.id) }
  }

  static async close(staff: StaffActor, publicIdValue: string) {
    const closedAt = nowIso()
    const row = await withTx(async (db) => {
      const current = await requireOperatorRow(db, publicIdValue, staff)
      assertWebsiteChat(current)
      if (current.status !== 'closed') {
        await db.run(
          `UPDATE support_conversations SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`,
          closedAt,
          closedAt,
          current.id,
        )
        await insertEvent(db, current.id, 'closed', staff.id)
      }
      return requireRow(db, publicIdValue)
    })
    return { conversation: presentOperator(row, staff.id) }
  }

  static async addOperatorMessage(staff: StaffActor, publicIdValue: string, textValue: unknown) {
    const text = cleanMessage(textValue)
    const createdAt = nowIso()
    const result = await withTx(async (db) => {
      const current = await requireOperatorRow(db, publicIdValue, staff)
      if (current.channel === 'staff') {
        const inserted = await db.run(
          `INSERT INTO support_messages (conversation_id, direction, body, operator_user_id, operator_name, created_at)
           VALUES (?, 'out', ?, ?, ?, ?)`,
          current.id,
          text,
          staff.id,
          staff.name,
          createdAt,
        )
        await db.run(
          `UPDATE support_conversations
           SET last_message_at = ?, last_message_preview = ?, updated_at = ?,
               staff_low_unread = CASE WHEN staff_low_id = ? THEN 0 ELSE staff_low_unread + 1 END,
               staff_high_unread = CASE WHEN staff_high_id = ? THEN 0 ELSE staff_high_unread + 1 END
           WHERE id = ?`,
          createdAt,
          preview(text),
          createdAt,
          staff.id,
          staff.id,
          current.id,
        )
        const row = await requireOperatorRow(db, publicIdValue, staff)
        return {
          staffMessage: true,
          peerId: row.staff_low_id === staff.id ? row.staff_high_id : row.staff_low_id,
          publicId: row.public_id,
          conversation: presentStaff(row, staff.id),
          message: {
            id: String(inserted.lastID),
            direction: 'out' as const,
            text,
            operatorName: staff.name,
            createdAt,
          },
        }
      }
      assertWebsiteChat(current)
      if (current.status === 'closed') throw new SupportError(409, 'Чат закрыт')
      if (current.assigned_user_id != null && current.assigned_user_id !== staff.id) {
        throw new SupportError(409, 'Чат ведёт другой сотрудник')
      }
      if (current.assigned_user_id == null) {
        const claimed = await db.run(
          `UPDATE support_conversations
           SET assigned_user_id = ?, updated_at = ?
           WHERE id = ? AND assigned_user_id IS NULL`,
          staff.id,
          createdAt,
          current.id,
        )
        if (!claimed.changes) throw new SupportError(409, 'Чат уже взяли')
        await insertEvent(db, current.id, 'claimed', staff.id)
      }
      const inserted = await db.run(
        `INSERT INTO support_messages (conversation_id, direction, body, operator_user_id, operator_name, created_at)
         VALUES (?, 'out', ?, ?, ?, ?)`,
        current.id,
        text,
        staff.id,
        staff.name,
        createdAt,
      )
      await db.run(
        `UPDATE support_conversations
         SET last_message_at = ?, last_message_preview = ?, customer_unread = customer_unread + 1,
             operator_unread = 0, updated_at = ?
         WHERE id = ?`,
        createdAt,
        preview(text),
        createdAt,
        current.id,
      )
      const row = await requireRow(db, publicIdValue)
      return {
        staffMessage: false,
        peerId: null as number | null,
        publicId: row.public_id,
        conversation: presentOperator(row, staff.id),
        message: {
          id: String(inserted.lastID),
          direction: 'out' as const,
          text,
          operatorName: staff.name,
          createdAt,
        },
      }
    })
    if (result.staffMessage) await notifyStaffMessage(result.peerId, staff, text, result.publicId)
    return { conversation: result.conversation, message: result.message }
  }

  static async countAttention(staff: StaffActor) {
    const db = await getDb()
    const row = await db.get<{ c: number }>(
      `SELECT (
         SELECT COUNT(1)
         FROM support_conversations c
         WHERE c.channel = 'website'
           AND c.status != 'closed'
           AND (c.assigned_user_id IS NULL OR c.assigned_user_id = ?)
           AND (
             SELECT direction FROM support_messages
             WHERE conversation_id = c.id
             ORDER BY id DESC
             LIMIT 1
           ) = 'in'
       ) + (
         SELECT COUNT(1)
         FROM support_conversations
         WHERE channel = 'staff'
           AND (
             (staff_low_id = ? AND staff_low_unread > 0)
             OR (staff_high_id = ? AND staff_high_unread > 0)
           )
       ) AS c`,
      staff.id,
      staff.id,
      staff.id,
    )
    return { count: Number(row?.c || 0) }
  }

  static async listOperators() {
    const db = await getDb()
    const rows = await db.all<Array<{ id: number; name: string }>>(
      `SELECT id, name FROM users
       WHERE COALESCE(is_active, 1) = 1 AND COALESCE(role, 'user') != 'viewer'
       ORDER BY name COLLATE NOCASE LIMIT 200`,
    )
    return { operators: rows }
  }

  static async listScripts() {
    const db = await getDb()
    const scripts = await db.all<Array<{ id: number; title: string; body: string; sort_order: number }>>(
      `SELECT id, title, body, sort_order FROM support_reply_scripts
       WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`,
    )
    return { scripts }
  }

  static async createScript(input: { title: unknown; body: unknown }) {
    const title = cleanTitle(input.title)
    const body = cleanScriptBody(input.body)
    const db = await getDb()
    const inserted = await db.run(
      'INSERT INTO support_reply_scripts (title, body, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM support_reply_scripts))',
      title,
      body,
    )
    return { script: { id: Number(inserted.lastID), title, body } }
  }

  static async updateScript(idValue: unknown, input: { title: unknown; body: unknown }) {
    const id = Number(idValue)
    if (!Number.isInteger(id) || id <= 0) throw new SupportError(404, 'Скрипт не найден')
    const title = cleanTitle(input.title)
    const body = cleanScriptBody(input.body)
    const db = await getDb()
    const updated = await db.run(
      `UPDATE support_reply_scripts SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? AND is_active = 1`,
      title,
      body,
      id,
    )
    if (!updated.changes) throw new SupportError(404, 'Скрипт не найден')
    return { script: { id, title, body } }
  }

  static async hideScript(idValue: unknown) {
    const id = Number(idValue)
    if (!Number.isInteger(id) || id <= 0) throw new SupportError(404, 'Скрипт не найден')
    const db = await getDb()
    const updated = await db.run(
      `UPDATE support_reply_scripts SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND is_active = 1`,
      id,
    )
    if (!updated.changes) throw new SupportError(404, 'Скрипт не найден')
    return { ok: true }
  }
}
