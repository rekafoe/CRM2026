import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import { up } from '../migrations/20261125120000_add_miniapp_checkout_reliability'
import { expireOldMiniappDrafts } from '../services/miniappDraftCleanupService'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))
const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

describe('Mini App draft expiration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        source TEXT,
        telegram_chat_id TEXT,
        miniapp_checkout_state TEXT,
        createdAt TEXT,
        created_at TEXT
      );
      INSERT INTO orders (id, source, telegram_chat_id, miniapp_checkout_state, createdAt, created_at) VALUES
        (1, 'mini_app', '42', 'draft', datetime('now', '-73 hours'), datetime('now', '-73 hours')),
        (2, 'mini_app', '42', 'draft', datetime('now', '-2 hours'), datetime('now', '-2 hours')),
        (3, 'mini_app', '42', 'finalized', datetime('now', '-100 hours'), datetime('now', '-100 hours')),
        (4, 'website', NULL, 'draft', datetime('now', '-100 hours'), datetime('now', '-100 hours'));
    `)
    await up(db)
    mockedGetDb.mockResolvedValue(db)
  })

  afterEach(async () => {
    await db.close()
    jest.clearAllMocks()
  })

  it('expires only old Mini App drafts and is idempotent', async () => {
    await expect(expireOldMiniappDrafts({ retentionHours: 72 })).resolves.toEqual({ expired: 1 })
    const rows = await db.all<Array<{ id: number; miniapp_expired_at: string | null }>>(
      'SELECT id, miniapp_expired_at FROM orders ORDER BY id',
    )
    expect(rows[0]?.miniapp_expired_at).not.toBeNull()
    expect(rows.slice(1).every((row) => row.miniapp_expired_at == null)).toBe(true)
    await expect(expireOldMiniappDrafts({ retentionHours: 72 })).resolves.toEqual({ expired: 0 })
  })
})
