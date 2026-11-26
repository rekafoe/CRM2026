import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import { up } from '../migrations/20261125120000_add_miniapp_checkout_reliability'
import { OrderService } from '../modules/orders/services/orderService'
import { CustomerService } from '../modules/customers/services/customerService'
import { TelegramUserService } from '../services/telegramUserService'
import {
  createMiniappDraft,
  finalizeMiniappDraft,
  mapMiniappCheckoutErrorToHttp,
  type MiniappCheckoutBody,
} from '../services/miniappCheckoutService'
import { miniappRequestHash } from '../utils/miniappCheckoutIdempotency'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))
jest.mock('../modules/orders/services/orderService', () => ({
  OrderService: {
    createOrderWithItems: jest.fn(),
    updateOrderNotes: jest.fn(),
    deductMaterialsForExistingOrder: jest.fn(),
  },
}))
jest.mock('../modules/customers/services/customerService', () => ({
  CustomerService: {
    getCustomerById: jest.fn(),
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
  },
}))
jest.mock('../services/telegramUserService', () => ({
  TelegramUserService: {
    getCrmCustomerIdByChatId: jest.fn(),
    setCrmCustomerIdByChatId: jest.fn(),
    getUserByChatId: jest.fn(),
  },
}))
jest.mock('../services/editorDraftWebsitePrepare', () => ({
  prepareWebsiteItemsWithEditorDrafts: jest.fn((items) => ({ items })),
  collectEditorDraftItemsFromOrder: jest.fn().mockResolvedValue([]),
  attachEditorDraftsToOrderItems: jest.fn(),
}))
jest.mock('../services/editorOrderIntakeService', () => ({
  completeEditorOrderIntake: jest.fn(),
}))
jest.mock('../utils/poolSync', () => ({ setLastWebsiteOrderAt: jest.fn() }))

const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
const createOrderWithItems = OrderService.createOrderWithItems as jest.Mock
const updateOrderNotes = OrderService.updateOrderNotes as jest.Mock
const deductMaterials = OrderService.deductMaterialsForExistingOrder as jest.Mock

function checkoutBody(quantity = 2, designHelp = true): MiniappCheckoutBody {
  return {
    customer: { type: 'individual', first_name: 'Test', phone: '+375290000000' },
    order: {
      items: [{
        type: '1',
        params: { productId: 1, productName: 'Визитки' },
        price: 10,
        quantity,
      }],
      design_help_requested: designHelp,
    },
  }
}

describe('Mini App checkout reliability', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT,
        source TEXT,
        telegram_chat_id TEXT,
        miniapp_checkout_state TEXT,
        miniapp_design_help_requested INTEGER DEFAULT 0,
        notes TEXT,
        customer_id INTEGER,
        createdAt TEXT,
        created_at TEXT
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId INTEGER,
        type TEXT,
        params TEXT,
        price REAL,
        quantity REAL
      );
      CREATE TABLE order_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId INTEGER,
        orderItemId INTEGER
      );
      CREATE TABLE products (id INTEGER PRIMARY KEY);
      INSERT INTO products (id) VALUES (1);
    `)
    await up(db)
    mockedGetDb.mockResolvedValue(db)

    ;(TelegramUserService.getCrmCustomerIdByChatId as jest.Mock).mockResolvedValue(null)
    ;(TelegramUserService.getUserByChatId as jest.Mock).mockResolvedValue({ first_name: 'Test' })
    ;(TelegramUserService.setCrmCustomerIdByChatId as jest.Mock).mockResolvedValue(undefined)
    ;(CustomerService.createCustomer as jest.Mock).mockResolvedValue({
      id: 55,
      type: 'individual',
      first_name: 'Test',
      phone: '+375290000000',
    })
    ;(CustomerService.getCustomerById as jest.Mock).mockResolvedValue(null)

    createOrderWithItems.mockImplementation(async (input: any) => {
      const orderResult = await db.run(
        `INSERT INTO orders
          (number, source, telegram_chat_id, miniapp_checkout_state,
           miniapp_design_help_requested, customer_id, createdAt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          `MAP-${Date.now()}`,
          input.source,
          input.telegramChatId,
          input.miniappCheckoutState,
          input.miniappDesignHelpRequested ? 1 : 0,
          input.customer_id,
        ],
      )
      const orderId = Number(orderResult.lastID)
      const itemIds: number[] = []
      for (const item of input.items) {
        const itemResult = await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.type, JSON.stringify(item.params || {}), item.price, item.quantity],
        )
        itemIds.push(Number(itemResult.lastID))
      }
      return {
        order: { id: orderId, number: `MAP-${orderId}` },
        itemIds,
      }
    })
    updateOrderNotes.mockImplementation(async (orderId: number, notes: string | null) => {
      await db.run('UPDATE orders SET notes = ? WHERE id = ?', [notes, orderId])
    })
    deductMaterials.mockResolvedValue({ success: true, errors: [] })
  })

  afterEach(async () => {
    await db.close()
    jest.clearAllMocks()
  })

  it('replays the original draft and item ids for the same idempotency key', async () => {
    const first = await createMiniappDraft('42', checkoutBody(), { idempotencyKey: 'checkout-key-0001' })
    const replay = await createMiniappDraft('42', checkoutBody(), { idempotencyKey: 'checkout-key-0001' })

    expect(replay.replayed).toBe(true)
    expect(replay.order.id).toBe(first.order.id)
    expect(replay.itemIds).toEqual(first.itemIds)
    expect(createOrderWithItems).toHaveBeenCalledTimes(1)
    const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM orders')
    expect(count?.count).toBe(1)
  })

  it('rejects reuse of a key for a different order payload', async () => {
    await createMiniappDraft('42', checkoutBody(2), { idempotencyKey: 'checkout-key-0002' })
    let error: unknown
    try {
      await createMiniappDraft('42', checkoutBody(3), { idempotencyKey: 'checkout-key-0002' })
    } catch (reason) {
      error = reason
    }
    expect(error).toMatchObject({ code: 'MINIAPP_IDEMPOTENCY_CONFLICT' })
    expect(mapMiniappCheckoutErrorToHttp(error)?.status).toBe(409)
    expect(createOrderWithItems).toHaveBeenCalledTimes(1)
  })

  it('finalizes repeatedly without deducting materials twice', async () => {
    const draft = await createMiniappDraft('42', checkoutBody(), { idempotencyKey: 'checkout-key-0003' })
    const first = await finalizeMiniappDraft('42', Number(draft.order.id))
    const replay = await finalizeMiniappDraft('42', Number(draft.order.id))

    expect(first.alreadyFinalized).not.toBe(true)
    expect(replay).toMatchObject({
      order: { id: draft.order.id },
      alreadyFinalized: true,
      deductionResult: null,
    })
    expect(deductMaterials).toHaveBeenCalledTimes(1)
  })

  it('creates a stable request hash regardless of object key order', () => {
    expect(miniappRequestHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      miniappRequestHash({ b: { d: 3, c: 2 }, a: 1 }),
    )
  })
})
