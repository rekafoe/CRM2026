import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import type { Request, Response } from 'express'
import { getDb as getConfigDb } from '../config/database'
import { getDb as getCoreDb } from '../db'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import { EarningsService } from '../services/earningsService'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))
jest.mock('../db', () => ({
  ...jest.requireActual('../db'),
  getDb: jest.fn(),
}))

const mockedConfigGetDb = getConfigDb as jest.MockedFunction<typeof getConfigDb>
const mockedCoreGetDb = getCoreDb as jest.MockedFunction<typeof getCoreDb>

describe('website order item deletion', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        number TEXT,
        source TEXT,
        status INTEGER,
        prepaymentAmount REAL DEFAULT 0,
        prepaymentStatus TEXT,
        paymentMethod TEXT,
        discount_percent REAL DEFAULT 0,
        createdAt TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE order_statuses (
        id INTEGER PRIMARY KEY,
        code TEXT,
        name TEXT
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        orderId INTEGER,
        type TEXT,
        params TEXT,
        price REAL,
        quantity REAL,
        printerId INTEGER,
        sides REAL,
        sheets REAL,
        waste REAL,
        clicks REAL,
        executor_user_id INTEGER
      );
      CREATE TABLE product_materials (
        materialId INTEGER,
        qtyPerItem REAL,
        presetCategory TEXT,
        presetDescription TEXT
      );
      CREATE TABLE materials (
        id INTEGER PRIMARY KEY,
        name TEXT,
        quantity REAL,
        unit TEXT,
        min_quantity REAL,
        sheet_price_single REAL,
        purchase_price REAL
      );
      CREATE TABLE material_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_id INTEGER,
        type TEXT,
        quantity REAL,
        delta REAL,
        reason TEXT,
        order_id INTEGER,
        user_id INTEGER,
        supplier_id INTEGER,
        delivery_number TEXT,
        invoice_number TEXT,
        delivery_date TEXT,
        delivery_notes TEXT,
        price REAL
      );
      INSERT INTO orders (id, number, source, status, createdAt)
      VALUES (1, 'site-ord-test', 'website', 2, '2026-11-24 10:00:00');
      INSERT INTO order_statuses (id, code, name) VALUES (2, 'confirmed', 'Оформлен');
      INSERT INTO items (id, orderId, type, params, price, quantity)
      VALUES (1, 1, 'Листовки', '{"description":"Бумага","components":[{"materialId":1,"qtyPerItem":2}]}', 10, 3);
      INSERT INTO product_materials (materialId, qtyPerItem, presetCategory, presetDescription)
      VALUES (1, 2, 'Листовки', 'Бумага');
      INSERT INTO materials (id, name, quantity, unit) VALUES (1, 'Бумага А4', 10, 'шт.');
    `)
    mockedConfigGetDb.mockResolvedValue(db)
    mockedCoreGetDb.mockResolvedValue(db)
    jest.spyOn(EarningsService, 'recalculateForDate').mockResolvedValue(undefined as any)
  })

  afterEach(async () => {
    await db.close()
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('deletes a legacy website item and returns materials in the same transaction', async () => {
    const req = {
      params: { orderId: '1', itemId: '1' },
      user: { id: 7, role: 'admin' },
    } as unknown as Request
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    } as unknown as Response

    await OrderItemController.deleteItem(req, res)

    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.end).toHaveBeenCalled()
    expect(await db.get('SELECT id FROM items WHERE id = 1')).toBeUndefined()
    expect(await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = 1'))
      .toMatchObject({ quantity: 16 })
    expect(await db.get(
      `SELECT quantity, reason, order_id FROM material_moves
       WHERE material_id = 1 AND type = 'add' ORDER BY id DESC LIMIT 1`,
    )).toMatchObject({ quantity: 6, reason: 'order delete item', order_id: 1 })
  })
})
