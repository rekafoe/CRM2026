import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261125120000_add_miniapp_checkout_reliability'

describe('Mini App reliability migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        source TEXT,
        createdAt TEXT,
        created_at TEXT
      );
      INSERT INTO orders (id, source) VALUES (1, 'mini_app');
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('repairs missing Mini App prerequisites after older fresh-database migration failures', async () => {
    await up(db)
    await up(db)
    const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(orders)')
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'telegram_chat_id',
      'miniapp_checkout_state',
      'miniapp_design_help_requested',
      'miniapp_idempotency_key',
      'miniapp_request_hash',
      'miniapp_expired_at',
    ]))
    const order = await db.get<{ miniapp_checkout_state: string; miniapp_design_help_requested: number }>(
      'SELECT miniapp_checkout_state, miniapp_design_help_requested FROM orders WHERE id = 1',
    )
    expect(order).toMatchObject({ miniapp_checkout_state: 'finalized', miniapp_design_help_requested: 0 })
  })
})
