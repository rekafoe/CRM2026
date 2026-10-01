import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261001173000_rebind_client_notify_statuses'
import { buildStatusPhrase } from '../services/orderStatusEmailVars'

describe('client notifications follow the current status set', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        code TEXT
      );
      CREATE TABLE email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );
      CREATE TABLE order_email_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_status_id INTEGER NOT NULL UNIQUE,
        email_template_id INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE sms_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );
      CREATE TABLE order_sms_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_status_id INTEGER NOT NULL UNIQUE,
        sms_template_id INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      );
    `)
    await db.run(`INSERT INTO order_statuses (name, code, sort_order) VALUES ('Ожидает', 'waiting', 1)`)
    await db.run(`INSERT INTO order_statuses (name, code, sort_order) VALUES ('Принят в работу', 'in_work', 3)`)
    await db.run(`INSERT INTO order_statuses (name, code, sort_order) VALUES ('Выполнен', 'done', 4)`)
    await db.run(`INSERT INTO order_statuses (name, code, sort_order) VALUES ('Передан в ПВЗ', 'at_pickup', 5)`)
  })

  afterEach(async () => {
    await db.close()
  })

  it('переносит «принят в работу» с «Ожидает» на in_work и оставляет «готов» на ПВЗ', async () => {
    const waiting = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE code = 'waiting'`)
    const inWork = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE code = 'in_work'`)
    const pickup = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE code = 'at_pickup'`)
    const done = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE code = 'done'`)

    await db.run(
      `INSERT INTO email_templates (slug, name) VALUES ('order_accepted_in_work', 'Принят'), ('order_ready_for_pickup', 'Готов')`,
    )
    const accepted = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_accepted_in_work'`)
    const ready = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = 'order_ready_for_pickup'`)
    await db.run(
      `INSERT INTO order_email_rules (to_status_id, email_template_id, is_active) VALUES (?, ?, 1)`,
      waiting?.id,
      accepted?.id,
    )
    await db.run(
      `INSERT INTO order_email_rules (to_status_id, email_template_id, is_active) VALUES (?, ?, 1)`,
      pickup?.id,
      ready?.id,
    )
    await db.run(`INSERT INTO sms_templates (slug, name) VALUES ('order_status_default_sms', 'SMS')`)
    const sms = await db.get<{ id: number }>(`SELECT id FROM sms_templates WHERE slug = 'order_status_default_sms'`)
    await db.run(
      `INSERT INTO order_sms_rules (to_status_id, sms_template_id, is_active) VALUES (?, ?, 1)`,
      waiting?.id,
      sms?.id,
    )

    await up(db)
    await up(db)

    const acceptedRule = await db.get<{ to_status_id: number; is_active: number }>(
      `SELECT to_status_id, is_active FROM order_email_rules WHERE email_template_id = ?`,
      accepted?.id,
    )
    expect(acceptedRule).toEqual({ to_status_id: inWork?.id, is_active: 1 })

    const readyRule = await db.get<{ to_status_id: number; is_active: number }>(
      `SELECT to_status_id, is_active FROM order_email_rules WHERE email_template_id = ?`,
      ready?.id,
    )
    expect(readyRule).toEqual({ to_status_id: pickup?.id, is_active: 1 })

    const smsRule = await db.get<{ to_status_id: number; is_active: number }>(
      `SELECT to_status_id, is_active FROM order_sms_rules WHERE sms_template_id = ?`,
      sms?.id,
    )
    expect(smsRule).toEqual({ to_status_id: done?.id, is_active: 1 })
  })

  it('фраза письма совпадает с новым именем статуса', () => {
    expect(buildStatusPhrase('Ожидает')).toBe('ожидает обработки')
    expect(buildStatusPhrase('Принят в работу')).toBe('принят в работу')
    expect(buildStatusPhrase('Выполнен')).toBe('готов к выдаче')
    expect(buildStatusPhrase('Передан в ПВЗ')).toBe('передан в пункт выдачи')
    expect(buildStatusPhrase('Завершён')).toBe('завершён')
  })
})
