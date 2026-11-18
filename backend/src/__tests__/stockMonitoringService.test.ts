import fs from 'fs'
import path from 'path'
import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../db'
import { up } from '../migrations/20261118160000_stock_alert_live_columns'
import { alertLevelFor, configuredMinimum } from '../services/stockAlertMath'
import { StockMonitoringService } from '../services/stockMonitoringService'
import { TelegramService } from '../services/telegramService'
import { TelegramUserService } from '../services/telegramUserService'
import { withMiniappOrder } from '../utils/miniappWebAppUrl'

jest.mock('../db', () => ({
  getDb: jest.fn(),
}))

jest.mock('../services/telegramService', () => ({
  TelegramService: {
    isNetworkAvailable: jest.fn(() => false),
    sendLowStockDigest: jest.fn(async () => ({ sent: 1, failed: 0 })),
  },
}))

describe('live stock alerts', () => {
  let db: Database
  const previousFlag = process.env.STOCK_TELEGRAM_ALERTS

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE materials (
        id INTEGER PRIMARY KEY,
        name TEXT,
        unit TEXT,
        quantity REAL,
        min_quantity REAL,
        min_stock_level REAL,
        is_active INTEGER DEFAULT 1,
        supplier_id INTEGER,
        category_id INTEGER
      );
      CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT, contact_person TEXT);
      CREATE TABLE material_categories (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE warehouses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE material_stock (material_id INTEGER, warehouse_id INTEGER, quantity REAL);
      CREATE TABLE material_reservations (
        id INTEGER PRIMARY KEY,
        material_id INTEGER,
        quantity_reserved REAL,
        status TEXT,
        expires_at TEXT
      );
      CREATE TABLE stock_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER NOT NULL,
        alert_type TEXT NOT NULL,
        threshold_value REAL,
        current_value REAL,
        message TEXT,
        is_resolved INTEGER DEFAULT 0,
        created_at TEXT,
        resolved_at TEXT
      );
      CREATE TABLE telegram_users (
        id INTEGER PRIMARY KEY,
        chat_id TEXT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        is_active INTEGER,
        role TEXT,
        notifications_enabled INTEGER,
        notification_preferences TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      INSERT INTO warehouses (id, name) VALUES (1, 'Гикало'), (2, 'Цех');
      INSERT INTO suppliers (id, name, contact_person) VALUES (1, 'Бумснаб', 'Ольга');
      INSERT INTO material_categories (id, name) VALUES (1, 'Бумага');
      INSERT INTO materials (id, name, unit, quantity, min_quantity, min_stock_level, is_active, supplier_id, category_id) VALUES
        (1, 'Мелованная', 'м²', 100, 10, 0, 1, 1, 1),
        (2, 'Без минимума', 'шт', 1, NULL, 0, 1, NULL, NULL),
        (3, 'Нулевой минимум', 'шт', 2, 0, 0, 1, NULL, NULL),
        (4, 'Архив', 'шт', 0, 5, 0, 0, NULL, NULL),
        (5, 'Только карточка', 'лист', 4, 6, 0, 1, NULL, NULL);
      INSERT INTO material_stock (material_id, warehouse_id, quantity) VALUES
        (1, 1, 12),
        (1, 2, 8);
      INSERT INTO material_reservations (id, material_id, quantity_reserved, status, expires_at) VALUES
        (1, 1, 15, 'reserved', '2099-01-01 00:00:00'),
        (2, 1, 100, 'cancelled', '2099-01-01 00:00:00'),
        (3, 1, 50, 'reserved', '2000-01-01 00:00:00');
      INSERT INTO telegram_users (
        id, chat_id, first_name, is_active, role, notifications_enabled, notification_preferences, created_at, updated_at
      ) VALUES
        (1, 'mgr', 'Мария', 1, 'manager', 1, '{"low_stock":true}', '2026-01-01', '2026-01-01'),
        (2, 'adm', 'Админ', 1, 'admin', 1, '{"low_stock":true}', '2026-01-01', '2026-01-01'),
        (3, 'cli', 'Клиент', 1, 'client', 1, '{"low_stock":true}', '2026-01-01', '2026-01-01'),
        (4, 'off', 'Тихий', 1, 'manager', 1, '{"low_stock":false}', '2026-01-01', '2026-01-01'),
        (5, 'mute', 'Выкл', 1, 'admin', 0, '{"low_stock":true}', '2026-01-01', '2026-01-01');
    `)
    await up(db)
    ;(getDb as jest.Mock).mockResolvedValue(db)
    ;(TelegramService.isNetworkAvailable as jest.Mock).mockReturnValue(false)
    ;(TelegramService.sendLowStockDigest as jest.Mock).mockClear()
    process.env.STOCK_TELEGRAM_ALERTS = 'false'
  })

  afterEach(async () => {
    process.env.STOCK_TELEGRAM_ALERTS = previousFlag
    await db.close()
  })

  it('uses warehouse stock minus reserve and does not invent a minimum of 10', () => {
    expect(configuredMinimum(null, 0)).toBeNull()
    expect(configuredMinimum(0, null)).toBeNull()
    expect(alertLevelFor(12, 10)).toBeNull()
    expect(alertLevelFor(10, 10)).toBe('critical')
    expect(alertLevelFor(0, 10)).toBe('out_of_stock')
  })

  it('keeps one row, closes it above the minimum, and names the unit and warehouse', async () => {
    const first = await StockMonitoringService.checkStockLevels()
    expect(first.map((alert) => alert.materialId).sort()).toEqual([1, 5])
    const paper = first.find((alert) => alert.materialId === 1)
    expect(paper).toMatchObject({
      currentQuantity: 5,
      minQuantity: 10,
      unit: 'м²',
      alertLevel: 'critical',
    })
    expect(paper?.warehouseLabel).toBe('Гикало, Цех')
    const card = first.find((alert) => alert.materialId === 5)
    expect(card).toMatchObject({ currentQuantity: 4, minQuantity: 6, warehouseLabel: 'без склада' })

    const rows = await db.all<Array<{ id: number; material_id: number; is_resolved: number }>>(
      `SELECT id, material_id, is_resolved FROM stock_alerts ORDER BY material_id`,
    )
    expect(rows).toHaveLength(2)

    await db.run(`UPDATE material_stock SET quantity = 40 WHERE material_id = 1 AND warehouse_id = 1`)
    const second = await StockMonitoringService.checkStockLevels()
    expect(second.map((alert) => alert.materialId)).toEqual([5])
    const paperRow = await db.get<{ is_resolved: number; current_quantity: number }>(
      `SELECT is_resolved, current_quantity FROM stock_alerts WHERE material_id = 1`,
    )
    expect(Number(paperRow?.is_resolved)).toBe(1)
    const stillOne = await db.get<{ c: number }>(`SELECT COUNT(1) as c FROM stock_alerts WHERE material_id = 1`)
    expect(Number(stillOne?.c)).toBe(1)

    await db.run(`UPDATE material_stock SET quantity = 1 WHERE material_id = 1 AND warehouse_id = 1`)
    await StockMonitoringService.checkStockLevels()
    const reopened = await db.all<Array<{ id: number; is_resolved: number }>>(
      `SELECT id, is_resolved FROM stock_alerts WHERE material_id = 1`,
    )
    expect(reopened).toHaveLength(1)
    expect(Number(reopened[0].is_resolved)).toBe(0)
    expect(reopened[0].id).toBe(rows.find((row) => row.material_id === 1)?.id)
  })

  it('sends the digest only through the low-stock recipient list', async () => {
    process.env.STOCK_TELEGRAM_ALERTS = 'true'
    ;(TelegramService.isNetworkAvailable as jest.Mock).mockReturnValue(true)
    await StockMonitoringService.checkStockLevels()
    expect(TelegramService.sendLowStockDigest).toHaveBeenCalledTimes(1)
    const text = (TelegramService.sendLowStockDigest as jest.Mock).mock.calls[0][0] as string
    expect(text).toContain('Мелованная')
    expect(text).toContain('м²')
    expect(text).toContain('Гикало')
    expect(text).not.toContain('Без минимума')
    expect(text).not.toContain('Архив')

    const recipients = await TelegramUserService.listLowStockRecipients()
    expect(recipients.map((user) => user.chat_id).sort()).toEqual(['adm', 'mgr'])
  })

  it('opens a miniapp order url and does not wire the old stock bot', () => {
    expect(withMiniappOrder('https://crm.example/miniapp', 42)).toBe('https://crm.example/miniapp?order=42')
    expect(withMiniappOrder('https://crm.example/miniapp?lang=ru', 7)).toBe('https://crm.example/miniapp?lang=ru&order=7')
    const index = fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8')
    const commands = fs.readFileSync(path.join(__dirname, '../services/telegramBotCommands.ts'), 'utf8')
    expect(index).not.toContain('modules/warehouse/services/stockMonitoringService')
    expect(index).not.toContain('modules/telegram')
    expect(commands).not.toContain("'/stock'")
    expect(commands).not.toContain('/stock_pdf')
    expect(commands).not.toContain('/stock_report')
  })
})
