import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import {
  buildPickupBranchesText,
  createMiniappPaymentLink,
  findOwnedMiniappOrder,
  formatOwnedOrderStatus,
} from '../services/miniappClientCommandService'
import { createBePaidCheckout } from '../services/bepaidCheckoutService'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))
jest.mock('../services/bepaidCheckoutService', () => ({
  createBePaidCheckout: jest.fn(),
  resolveBePaidReturnUrls: jest.fn(() => ({
    successUrl: 'https://example.test/success',
    failUrl: 'https://example.test/fail',
    notificationUrl: 'https://example.test/notify',
  })),
  splitCustomerName: jest.fn(() => ({ firstName: 'Test', lastName: 'Customer' })),
}))

const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
const mockedCheckout = createBePaidCheckout as jest.Mock

describe('Mini App client command service', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        number TEXT,
        status INTEGER,
        source TEXT,
        createdAt TEXT,
        created_at TEXT,
        prepaymentAmount REAL,
        prepaymentStatus TEXT,
        paymentMethod TEXT,
        paymentUrl TEXT,
        paymentId TEXT,
        customerName TEXT,
        customerEmail TEXT,
        customerPhone TEXT,
        discount_percent REAL DEFAULT 0,
        telegram_chat_id TEXT,
        miniapp_checkout_state TEXT,
        prepaymentUpdatedAt TEXT,
        updated_at TEXT
      );
      CREATE TABLE order_statuses (id INTEGER PRIMARY KEY, name TEXT);
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
      CREATE TABLE departments (
        id INTEGER PRIMARY KEY,
        name TEXT,
        address TEXT,
        description TEXT,
        is_pickup_point INTEGER,
        is_active INTEGER,
        sort_order INTEGER
      );
      INSERT INTO order_statuses (id, name) VALUES (2, 'Оформлен');
      INSERT INTO orders (
        id, number, status, source, createdAt, customerName, customerEmail,
        telegram_chat_id, miniapp_checkout_state, prepaymentAmount
      ) VALUES
        (1, 'MAP-1', 2, 'mini_app', '2026-11-26', 'Test Customer', 'customer@example.test', '42', 'finalized', 20),
        (2, 'MAP-2', 2, 'mini_app', '2026-11-26', 'Other Customer', 'other@example.test', 'other', 'finalized', 10),
        (3, 'MAP-3', 2, 'mini_app', '2026-11-26', 'Draft Customer', 'draft@example.test', '42', 'draft', 10),
        (4, 'MAP-4', 2, 'mini_app', '2026-11-26', 'Paid Customer', 'paid@example.test', '42', 'finalized', 12);
      UPDATE orders SET paymentMethod = 'online', paymentUrl = 'https://pay.example/checkout', prepaymentStatus = 'pending' WHERE id = 4;
      INSERT INTO items (id, orderId, type, params, price, quantity) VALUES
        (11, 1, '22', '{"productId":22,"productName":"Визитки"}', 10, 2),
        (44, 4, '22', '{"productId":22,"productName":"Визитки"}', 10, 1);
    `)
    mockedGetDb.mockResolvedValue(db)
    mockedCheckout.mockResolvedValue({ token: 'token-1', redirectUrl: 'https://pay.example/new' })
  })

  afterEach(async () => {
    await db.close()
    jest.clearAllMocks()
  })

  it('finds orders only by owner, id or number and hides drafts', async () => {
    expect((await findOwnedMiniappOrder('42', '1'))?.id).toBe(1)
    expect((await findOwnedMiniappOrder('42', 'map-1'))?.id).toBe(1)
    expect(await findOwnedMiniappOrder('42', '2')).toBeNull()
    expect(await findOwnedMiniappOrder('42', '3')).toBeNull()
    expect(formatOwnedOrderStatus((await findOwnedMiniappOrder('42', '1'))!)).toBe('MAP-1: Оформлен')
  })

  it('reuses an existing BePaid URL without creating a new checkout', async () => {
    await expect(createMiniappPaymentLink('42', 4)).resolves.toBe('https://pay.example/checkout')
    expect(mockedCheckout).not.toHaveBeenCalled()
  })

  it('creates and stores a BePaid checkout for the owned order total', async () => {
    await expect(createMiniappPaymentLink('42', 1)).resolves.toBe('https://pay.example/new')
    expect(mockedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountByn: 20,
      orderTrackingId: 'MAP-1',
      customer: expect.objectContaining({ email: 'customer@example.test' }),
    }))
    expect(await db.get(
      'SELECT prepaymentAmount, prepaymentStatus, paymentMethod, paymentUrl, paymentId FROM orders WHERE id = 1',
    )).toMatchObject({
      prepaymentAmount: 20,
      prepaymentStatus: 'pending',
      paymentMethod: 'online',
      paymentUrl: 'https://pay.example/new',
      paymentId: 'token-1',
    })
  })

  it('returns pickup branches with a fallback to site configuration', async () => {
    await expect(buildPickupBranchesText()).resolves.toContain('Проспект Дзержинского 3Б')
    await expect(buildPickupBranchesText()).resolves.toContain('Проспект Дзержинского 104')
  })
})
