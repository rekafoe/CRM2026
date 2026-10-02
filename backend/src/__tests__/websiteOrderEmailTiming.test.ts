import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { invalidateTableSchemaCache } from '../utils/tableSchemaCache'
import { up as bindCompletedTemplate } from '../migrations/20261002190000_website_order_completed_email'
import {
  isCompletedOrderStatus,
  isPickedUpNotifyStatus,
  shouldSkipImmediateWebsiteReadyEmail,
  websiteReadyReminderSendAtMs,
  WEBSITE_READY_REMINDER_LEAD_MS,
} from '../services/websiteOrderEmailTiming'
import { tryEnqueueOrderStatusEmail } from '../services/orderStatusEmailService'
import {
  processWebsiteReadyReminders,
  syncWebsitePickedUpReadyEmail,
  tryEnqueueWebsiteOrderCompletedEmail,
} from '../services/websiteOrderEmailService'

let testDb: Database

jest.mock('../config/database', () => ({
  getDb: async () => testDb,
}))

const HOUR = 60 * 60 * 1000

async function createMailDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database })
  await db.exec(`
    CREATE TABLE order_statuses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      email TEXT
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      number TEXT,
      status INTEGER,
      source TEXT,
      customerName TEXT,
      customerEmail TEXT,
      customerPhone TEXT,
      customer_id INTEGER,
      created_at TEXT,
      createdAt TEXT,
      discount_percent REAL DEFAULT 0,
      is_cancelled INTEGER DEFAULT 0,
      delivery_json TEXT
    );
    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      orderId INTEGER,
      type TEXT,
      params TEXT,
      price REAL,
      quantity INTEGER,
      printerId INTEGER,
      printer_id INTEGER,
      sides INTEGER,
      sheets INTEGER,
      waste INTEGER,
      clicks INTEGER,
      executor_user_id INTEGER
    );
    CREATE TABLE email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject_template TEXT NOT NULL,
      body_html_template TEXT NOT NULL,
      body_text_template TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE order_email_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_status_id INTEGER NOT NULL UNIQUE,
      email_template_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE mail_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL DEFAULT 'transactional',
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT,
      body_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      idempotency_key TEXT UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TEXT,
      last_error TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      context_order_id INTEGER,
      open_token TEXT
    );
    CREATE TABLE organizations (
      id INTEGER PRIMARY KEY,
      name TEXT,
      phone TEXT,
      email TEXT,
      is_default INTEGER
    );
  `)
  await db.exec(`
    INSERT INTO order_statuses (id, name, code) VALUES
      (8, 'Принят в работу', 'in_work'),
      (9, 'Выполнен', 'done'),
      (10, 'Передан в ПВЗ', 'at_pickup'),
      (11, 'Получен в ПВЗ', 'picked_up'),
      (2, 'Завершён', 'completed');
    INSERT INTO email_templates (slug, name, subject_template, body_html_template, body_text_template)
    VALUES
      ('order_accepted_in_work', 'Принят', 'Заказ {{orderNumber}} принят', '<p>принят</p>', 'принят'),
      ('order_ready_for_pickup', 'Готов', 'Заказ {{orderNumber}} готов к выдаче', '<p>готов</p>', 'готов'),
      ('order_completed', 'Завершён', 'Заказ {{orderNumber}} завершён', '<p>завершён</p>', 'завершён');
  `)
  const accepted = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_accepted_in_work'`)
  const ready = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_ready_for_pickup'`)
  const completed = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_completed'`)
  await db.run(`INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, ?)`, 8, accepted?.id)
  await db.run(`INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, ?)`, 9, ready?.id)
  await db.run(`INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, ?)`, 11, ready?.id)
  await db.run(`INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, ?)`, 2, completed?.id)
  return db
}

async function insertOrder(options: {
  id: number
  status: number
  source?: string
  createdAt?: string
  readyDate?: string
  priceType?: string
  cancelled?: boolean
}): Promise<void> {
  const created = options.createdAt ?? new Date().toISOString()
  await testDb.run(
    `INSERT INTO orders (id, number, status, source, customerName, customerEmail, created_at, is_cancelled)
     VALUES (?, ?, ?, ?, 'Анна', 'client@example.com', ?, ?)`,
    options.id,
    `N-${options.id}`,
    options.status,
    options.source ?? 'website',
    created,
    options.cancelled ? 1 : 0,
  )
  const params: Record<string, string> = {}
  if (options.priceType) params.priceType = options.priceType
  if (options.readyDate) params.readyDate = options.readyDate
  if (Object.keys(params).length > 0) {
    await testDb.run(
      `INSERT INTO items (id, orderId, type, params, price, quantity) VALUES (?, ?, 'Визитки', ?, 10, 1)`,
      options.id,
      options.id,
      JSON.stringify(params),
    )
  }
}

describe('website order email timing', () => {
  const prevHost = process.env.SMTP_HOST
  const prevFrom = process.env.SMTP_FROM

  beforeEach(async () => {
    process.env.SMTP_HOST = 'smtp.test'
    process.env.SMTP_FROM = 'shop@example.com'
    testDb = await createMailDb()
    invalidateTableSchemaCache()
  })

  afterEach(async () => {
    await testDb.close()
  })

  afterAll(() => {
    if (prevHost === undefined) delete process.env.SMTP_HOST
    else process.env.SMTP_HOST = prevHost
    if (prevFrom === undefined) delete process.env.SMTP_FROM
    else process.env.SMTP_FROM = prevFrom
  })

  it('ставит готовность в очередь только из «получен в ПВЗ»', () => {
    expect(isPickedUpNotifyStatus('picked_up', 'Получен в ПВЗ')).toBe(true)
    expect(isPickedUpNotifyStatus('at_pickup', 'Передан в ПВЗ')).toBe(false)
    expect(isPickedUpNotifyStatus('done', 'Выполнен')).toBe(false)
    expect(isPickedUpNotifyStatus('in_work', 'Принят в работу')).toBe(false)
    expect(isCompletedOrderStatus('completed', 'Завершён')).toBe(true)
    expect(shouldSkipImmediateWebsiteReadyEmail('website', 'picked_up', 'Получен в ПВЗ')).toBe(true)
    expect(shouldSkipImmediateWebsiteReadyEmail('website', 'done', 'Выполнен')).toBe(true)
    expect(shouldSkipImmediateWebsiteReadyEmail('crm', 'done', 'Выполнен')).toBe(false)
  })

  it('откладывает отправку до суток перед датой готовности', () => {
    const readyAt = Date.parse('2026-10-05T12:00:00.000Z')
    const now = readyAt - WEBSITE_READY_REMINDER_LEAD_MS - 1000
    expect(websiteReadyReminderSendAtMs(readyAt, now)).toBe(readyAt - WEBSITE_READY_REMINDER_LEAD_MS)
    expect(websiteReadyReminderSendAtMs(readyAt, readyAt)).toBe(readyAt)
  })

  it('ставит готовность в очередь при получении в ПВЗ и не отдаёт её в отправку, пока до даты больше суток', async () => {
    const now = Date.now()
    await insertOrder({
      id: 1,
      status: 11,
      priceType: 'online',
      readyDate: new Date(now + 5 * 24 * HOUR).toISOString(),
    })
    await tryEnqueueOrderStatusEmail({ orderId: 1, oldStatusId: 8, newStatusId: 11, source: 'website' })
    expect(await processWebsiteReadyReminders(20, now)).toBe(1)
    const job = await testDb.get<{ status: string; next_attempt_at: string; idempotency_key: string }>(
      `SELECT status, next_attempt_at, idempotency_key FROM mail_jobs`,
    )
    expect(job?.idempotency_key).toBe('website-ready-reminder:1')
    expect(job?.status).toBe('pending')
    expect(String(job?.next_attempt_at) > new Date(now).toISOString()).toBe(true)
  })

  it('когда до даты сутки или меньше, очередь уже можно забирать в отправку', async () => {
    const now = Date.now()
    await insertOrder({
      id: 2,
      status: 11,
      priceType: 'online',
      readyDate: new Date(now + 12 * HOUR).toISOString(),
    })
    expect(await syncWebsitePickedUpReadyEmail({
      orderId: 2,
      oldStatusId: 8,
      newStatusId: 11,
      nowMs: now,
    })).toBe('queued')
    expect(await processWebsiteReadyReminders(20, now)).toBe(0)
    const job = await testDb.get<{ subject: string; idempotency_key: string; next_attempt_at: string }>(
      `SELECT subject, idempotency_key, next_attempt_at FROM mail_jobs`,
    )
    expect(job?.idempotency_key).toBe('website-ready-reminder:2')
    expect(job?.subject).toContain('готов к выдаче')
    expect(String(job?.next_attempt_at) <= new Date(now).toISOString()).toBe(true)
  })

  it('для срочного сайта, уже полученного в ПВЗ, очередь сразу доступна к отправке', async () => {
    const now = Date.now()
    await insertOrder({
      id: 3,
      status: 11,
      createdAt: new Date(now).toISOString(),
      priceType: 'standard',
    })
    expect(await processWebsiteReadyReminders(20, now)).toBe(1)
    const job = await testDb.get<{ next_attempt_at: string }>(`SELECT next_attempt_at FROM mail_jobs`)
    expect(String(job?.next_attempt_at) <= new Date(now).toISOString()).toBe(true)
  })

  it('снимает неотправленное письмо, если статус убрали с «получен в ПВЗ»', async () => {
    const now = Date.now()
    await insertOrder({
      id: 12,
      status: 11,
      priceType: 'online',
      readyDate: new Date(now + 4 * 24 * HOUR).toISOString(),
    })
    expect(await syncWebsitePickedUpReadyEmail({
      orderId: 12,
      oldStatusId: 10,
      newStatusId: 11,
      nowMs: now,
    })).toBe('queued')
    await testDb.run(`UPDATE orders SET status = 9 WHERE id = 12`)
    expect(await syncWebsitePickedUpReadyEmail({
      orderId: 12,
      oldStatusId: 11,
      newStatusId: 9,
      nowMs: now,
    })).toBe('removed')
    expect(await testDb.get(`SELECT id FROM mail_jobs`)).toBeUndefined()
  })

  it('уже отправленное письмо при смене статуса остаётся', async () => {
    await insertOrder({
      id: 13,
      status: 9,
      priceType: 'online',
      readyDate: new Date().toISOString(),
    })
    await testDb.run(
      `INSERT INTO mail_jobs (job_type, to_email, subject, status, idempotency_key)
       VALUES ('transactional', 'client@example.com', 'готов', 'sent', 'website-ready-reminder:13')`,
    )
    expect(await syncWebsitePickedUpReadyEmail({
      orderId: 13,
      oldStatusId: 11,
      newStatusId: 9,
    })).toBe('skipped')
    const job = await testDb.get<{ status: string }>(`SELECT status FROM mail_jobs`)
    expect(job?.status).toBe('sent')
  })

  it('«выполнен» и «передан в ПВЗ» письмо о готовности не ставят', async () => {
    const now = Date.now()
    await insertOrder({
      id: 14,
      status: 9,
      priceType: 'online',
      readyDate: new Date(now + HOUR).toISOString(),
    })
    await insertOrder({
      id: 15,
      status: 10,
      priceType: 'online',
      readyDate: new Date(now + HOUR).toISOString(),
    })
    await tryEnqueueOrderStatusEmail({ orderId: 14, oldStatusId: 8, newStatusId: 9, source: 'website' })
    await tryEnqueueOrderStatusEmail({ orderId: 15, oldStatusId: 8, newStatusId: 10, source: 'website' })
    await syncWebsitePickedUpReadyEmail({ orderId: 14, oldStatusId: 8, newStatusId: 9, nowMs: now })
    await syncWebsitePickedUpReadyEmail({ orderId: 15, oldStatusId: 8, newStatusId: 10, nowMs: now })
    expect(await processWebsiteReadyReminders(20, now)).toBe(0)
    expect(await testDb.get(`SELECT id FROM mail_jobs`)).toBeUndefined()
  })

  it('«принят в работу» уходит сразу, без отложенной готовности', async () => {
    const now = Date.now()
    await insertOrder({
      id: 4,
      status: 8,
      priceType: 'online',
      readyDate: new Date(now + 3 * HOUR).toISOString(),
    })
    await tryEnqueueOrderStatusEmail({ orderId: 4, oldStatusId: 1, newStatusId: 8, source: 'website' })
    expect(await processWebsiteReadyReminders(20, now)).toBe(0)
    const job = await testDb.get<{ idempotency_key: string; subject: string }>(
      `SELECT idempotency_key, subject FROM mail_jobs`,
    )
    expect(job?.idempotency_key).toBe('order-notify:4:1:8')
    expect(job?.subject).toContain('принят')
  })

  it('смена статуса на «завершён» молчит, письмо уходит после закрытия долга', async () => {
    const now = Date.now()
    await insertOrder({
      id: 5,
      status: 2,
      priceType: 'online',
      readyDate: new Date(now - HOUR).toISOString(),
    })
    await tryEnqueueOrderStatusEmail({ orderId: 5, oldStatusId: 11, newStatusId: 2, source: 'website' })
    expect(await processWebsiteReadyReminders(20, now)).toBe(0)
    expect(await testDb.get(`SELECT id FROM mail_jobs`)).toBeUndefined()
    await tryEnqueueWebsiteOrderCompletedEmail(5)
    await tryEnqueueWebsiteOrderCompletedEmail(5)
    const jobs = await testDb.all<{ idempotency_key: string; subject: string }[]>(
      `SELECT idempotency_key, subject FROM mail_jobs`,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.idempotency_key).toBe('order-notify-completed:5')
    expect(jobs[0]?.subject).toContain('завершён')
  })

  it('не пишет о готовности отменённому и не пишет CRM о закрытии долга сайта', async () => {
    const now = Date.now()
    await insertOrder({
      id: 6,
      status: 11,
      cancelled: true,
      readyDate: new Date(now + HOUR).toISOString(),
      priceType: 'online',
    })
    await insertOrder({
      id: 7,
      status: 2,
      source: 'crm',
      readyDate: new Date(now - HOUR).toISOString(),
      priceType: 'standard',
    })
    expect(await processWebsiteReadyReminders(20, now)).toBe(0)
    await tryEnqueueWebsiteOrderCompletedEmail(7)
    await tryEnqueueOrderStatusEmail({ orderId: 7, oldStatusId: 9, newStatusId: 2, source: 'crm' })
    expect(await testDb.get(`SELECT id FROM mail_jobs`)).toBeUndefined()
  })

  it('CRM по-прежнему получает «выполнен» сразу', async () => {
    await insertOrder({ id: 8, status: 9, source: 'crm', priceType: 'standard' })
    await tryEnqueueOrderStatusEmail({ orderId: 8, oldStatusId: 8, newStatusId: 9, source: 'crm' })
    const job = await testDb.get<{ idempotency_key: string }>(`SELECT idempotency_key FROM mail_jobs`)
    expect(job?.idempotency_key).toBe('order-notify:8:8:9')
    expect(await processWebsiteReadyReminders(20, Date.now())).toBe(0)
  })
})

describe('completed email template migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        code TEXT
      );
      CREATE TABLE email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        subject_template TEXT NOT NULL,
        body_html_template TEXT NOT NULL,
        body_text_template TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE order_email_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_status_id INTEGER NOT NULL UNIQUE,
        email_template_id INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );
    `)
    await db.run(`INSERT INTO order_statuses (name, code) VALUES ('Завершён', 'completed')`)
  })

  afterEach(async () => {
    await db.close()
  })

  it('вешает шаблон завершения на статус «Завершён» и не затирает чужое правило', async () => {
    await bindCompletedTemplate(db)
    await bindCompletedTemplate(db)
    const status = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE code = 'completed'`)
    const rule = await db.get<{ to_status_id: number; is_active: number }>(
      `SELECT r.to_status_id, r.is_active
       FROM order_email_rules r
       INNER JOIN email_templates t ON t.id = r.email_template_id
       WHERE t.slug = 'order_completed'`,
    )
    expect(rule).toEqual({ to_status_id: status?.id, is_active: 1 })
    const count = await db.get<{ c: number }>(`SELECT COUNT(1) as c FROM email_templates WHERE slug = 'order_completed'`)
    expect(count?.c).toBe(1)
  })
})
