import fs from 'fs'
import path from 'path'
import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import { attachFileToMiniappOrder } from '../services/miniappOrderService'
import { orderFilesDir } from '../config/upload'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))
const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>

describe('Mini App order file upload policy', () => {
  let db: Database
  const filesToDelete: string[] = []

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        telegram_chat_id TEXT,
        miniapp_checkout_state TEXT,
        miniapp_expired_at TEXT
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        orderId INTEGER
      );
      CREATE TABLE order_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId INTEGER,
        orderItemId INTEGER,
        filename TEXT,
        originalName TEXT,
        mime TEXT,
        size INTEGER,
        uploadedAt TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO orders (id, telegram_chat_id, miniapp_checkout_state) VALUES
        (1, '42', 'draft'),
        (2, '42', 'finalized'),
        (3, 'other', 'draft');
      INSERT INTO items (id, orderId) VALUES (11, 1), (22, 2), (33, 3);
    `)
    mockedGetDb.mockResolvedValue(db)
  })

  afterEach(async () => {
    await db.close()
    for (const filename of filesToDelete) {
      const filePath = path.join(orderFilesDir, filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    filesToDelete.length = 0
    jest.clearAllMocks()
  })

  it('allows the owner to upload a file while the order is still a draft', async () => {
    const result = await attachFileToMiniappOrder('42', 1, {
      buffer: Buffer.from('draft file'),
      originalName: 'draft.pdf',
      mimetype: 'application/pdf',
    }, 11)
    expect(result.ok).toBe(true)
    if (result.ok) filesToDelete.push(result.row.filename)
    expect(await db.get('SELECT orderId, orderItemId, originalName FROM order_files WHERE orderId = 1'))
      .toMatchObject({ orderId: 1, orderItemId: 11, originalName: 'draft.pdf' })
  })

  it('rejects file upload after finalization without creating a file record', async () => {
    const result = await attachFileToMiniappOrder('42', 2, {
      buffer: Buffer.from('late file'),
      originalName: 'late.pdf',
      mimetype: 'application/pdf',
    }, 22)
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      message: 'Заказ уже оформлен. Добавлять файлы после оформления нельзя.',
    })
    expect(await db.get('SELECT COUNT(*) AS count FROM order_files')).toMatchObject({ count: 0 })
  })

  it('still rejects uploads to orders owned by another Telegram user', async () => {
    const result = await attachFileToMiniappOrder('42', 3, {
      buffer: Buffer.from('other user file'),
      originalName: 'other.pdf',
    }, 33)
    expect(result).toMatchObject({ ok: false, status: 403 })
  })
})
