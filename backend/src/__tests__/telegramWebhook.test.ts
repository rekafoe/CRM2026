import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import type { Request, Response } from 'express'
import { getDb as getCoreDb } from '../db'
import { getDb as getConfigDb } from '../config/database'
import { TelegramWebhookController } from '../controllers/telegramWebhookController'
import { TelegramService } from '../services/telegramService'
import { TelegramUserService } from '../services/telegramUserService'

jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  getDb: jest.fn(),
}))
jest.mock('../config/database', () => ({ getDb: jest.fn() }))

const mockedCoreGetDb = getCoreDb as jest.MockedFunction<typeof getCoreDb>
const mockedConfigGetDb = getConfigDb as jest.MockedFunction<typeof getConfigDb>

describe('Telegram webhook', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE telegram_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        is_active INTEGER DEFAULT 1,
        role TEXT,
        notifications_enabled INTEGER DEFAULT 1,
        notification_preferences TEXT,
        crm_customer_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE telegram_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        number TEXT,
        status INTEGER,
        createdAt TEXT,
        created_at TEXT,
        source TEXT,
        telegram_chat_id TEXT,
        customer_id INTEGER,
        is_cancelled INTEGER DEFAULT 0,
        miniapp_checkout_state TEXT,
        prepaymentAmount REAL,
        prepaymentStatus TEXT,
        paymentMethod TEXT
      );
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY,
        code TEXT,
        name TEXT
      );
      INSERT INTO order_statuses (id, code, name) VALUES (2, 'confirmed', 'Оформлен');
      INSERT INTO telegram_settings (setting_key, setting_value)
      VALUES ('welcome_message_enabled', 'true'), ('auto_add_users', 'true'), ('default_role', 'client');
    `)
    mockedCoreGetDb.mockResolvedValue(db)
    mockedConfigGetDb.mockResolvedValue(db)
    jest.spyOn(TelegramService, 'sendMessageWithKeyboard').mockResolvedValue(true)
    jest.spyOn(TelegramService, 'sendMessageToUser').mockResolvedValue(true)
  })

  afterEach(async () => {
    await db.close()
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('handles /start without depending on Express this binding', async () => {
    const req = {
      body: {
        update_id: 1001,
        message: {
          message_id: 10,
          from: { id: 42, is_bot: false, first_name: 'Test', username: 'test_user' },
          chat: { id: 42, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '/start',
        },
      },
    } as Request
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response

    await TelegramWebhookController.handleWebhook(req, res)

    expect(res.status).not.toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Webhook processed successfully' })
    expect(await TelegramUserService.getUserByChatId('42')).toMatchObject({
      chat_id: '42',
      username: 'test_user',
      role: 'client',
    })
    expect(TelegramService.sendMessageWithKeyboard).toHaveBeenCalled()
  }, 30_000)
})
