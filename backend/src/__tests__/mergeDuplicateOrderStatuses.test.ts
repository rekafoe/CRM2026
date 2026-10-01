import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261001161000_merge_duplicate_order_statuses'

describe('merge duplicate order statuses', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT,
        status INTEGER NOT NULL
      );
      CREATE TABLE order_email_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_status_id INTEGER NOT NULL UNIQUE,
        email_template_id INTEGER NOT NULL
      );
      CREATE TABLE order_sms_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_status_id INTEGER NOT NULL UNIQUE,
        sms_template_id INTEGER NOT NULL
      );
      CREATE TABLE sms_debounce (
        order_id INTEGER PRIMARY KEY,
        target_status_id INTEGER NOT NULL
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('переносит заказы с «Новый» на «Ожидает» и удаляет дубль', async () => {
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Ожидает', 1)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Новый', 8)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Оформлен', 2)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('В производстве', 9)`)
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Принят в работу', 3)`)

    const waiting = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Ожидает'`)
    const legacy = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Новый'`)
    const issued = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Оформлен'`)
    const producing = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'В производстве'`)
    const accepted = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = 'Принят в работу'`)
    if (!waiting || !legacy || !issued || !producing || !accepted) throw new Error('статусы не созданы')

    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-WAIT', ?)`, legacy.id)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-POOL', 0)`)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-ISSUED', ?)`, issued.id)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-PROD', ?)`, producing.id)
    await db.run(
      `INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, 1)`,
      waiting.id,
    )
    await db.run(
      `INSERT INTO order_email_rules (to_status_id, email_template_id) VALUES (?, 2)`,
      legacy.id,
    )
    await db.run(
      `INSERT INTO order_sms_rules (to_status_id, sms_template_id) VALUES (?, 3)`,
      legacy.id,
    )
    await db.run(`INSERT INTO sms_debounce (order_id, target_status_id) VALUES (1, ?)`, legacy.id)

    await up(db)
    await up(db)

    const statusRows = await db.all<{ name: string }[]>(
      `SELECT name FROM order_statuses ORDER BY sort_order, id`,
    )
    const names = statusRows.map((row) => row.name)
    expect(names).toEqual(['Ожидает', 'Оформлен', 'Принят в работу'])

    const moved = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-WAIT'`)
    const pool = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-POOL'`)
    const issuedOrder = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-ISSUED'`)
    const prod = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-PROD'`)
    expect(moved?.status).toBe(waiting.id)
    expect(pool?.status).toBe(0)
    expect(issuedOrder?.status).toBe(issued.id)
    expect(prod?.status).toBe(accepted.id)

    const emailRules = await db.all<{ to_status_id: number }[]>(`SELECT to_status_id FROM order_email_rules`)
    expect(emailRules).toEqual([{ to_status_id: waiting.id }])
    const smsRules = await db.all<{ to_status_id: number }[]>(`SELECT to_status_id FROM order_sms_rules`)
    expect(smsRules).toEqual([{ to_status_id: waiting.id }])
    const debounce = await db.get<{ target_status_id: number }>(`SELECT target_status_id FROM sms_debounce`)
    expect(debounce?.target_status_id).toBe(waiting.id)
  })

  it('переименовывает «Новый», если канонического «Ожидает» ещё нет', async () => {
    await db.run(`INSERT INTO order_statuses (name, sort_order) VALUES ('Новый', 1)`)
    const before = await db.get<{ id: number }>(`SELECT id FROM order_statuses`)
    await db.run(`INSERT INTO orders (number, status) VALUES ('ORD-1', ?)`, before?.id)

    await up(db)

    const rows = await db.all<{ id: number; name: string }[]>(`SELECT id, name FROM order_statuses`)
    expect(rows).toEqual([{ id: before?.id, name: 'Ожидает' }])
    const order = await db.get<{ status: number }>(`SELECT status FROM orders WHERE number = 'ORD-1'`)
    expect(order?.status).toBe(before?.id)
  })
})
