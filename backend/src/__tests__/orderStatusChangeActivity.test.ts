import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { OrderService } from '../modules/orders/services/orderService'

let testDb: Database

jest.mock('../config/database', () => ({
  getDb: async () => testDb,
}))

jest.mock('../services/orderStatusEmailService', () => ({
  tryEnqueueOrderStatusEmail: jest.fn(async () => undefined),
}))

jest.mock('../services/websiteOrderEmailService', () => ({
  syncWebsitePickedUpReadyEmail: jest.fn(async () => 'skipped'),
}))

jest.mock('../services/orderStatusSmsService', () => ({
  tryScheduleOrderStatusSms: jest.fn(async () => undefined),
}))

jest.mock('../services/miniappOrderStatusTelegramService', () => ({
  tryNotifyTelegramOrderStatusForMiniappOrder: jest.fn(async () => undefined),
}))

jest.mock('../services/websiteOrderStatusSyncService', () => ({
  trySyncWebsiteOrderStatusFromCrm: jest.fn(async () => undefined),
}))

jest.mock('../services/earningsService', () => ({
  EarningsService: {
    recalculateEarningsForOrderDays: jest.fn(async () => undefined),
    recalculateForDate: jest.fn(async () => undefined),
  },
}))

jest.mock('../modules/warehouse/services/unifiedWarehouseService', () => ({
  UnifiedWarehouseService: {
    getReservationsByOrder: jest.fn(async () => []),
    confirmReservations: jest.fn(async () => undefined),
  },
}))

async function createDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database })
  await db.exec(`
    CREATE TABLE order_statuses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      number TEXT,
      status INTEGER,
      source TEXT,
      userId INTEGER,
      notes TEXT,
      created_at TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT
    );
    CREATE TABLE order_activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT,
      old_value TEXT,
      new_value TEXT,
      comment TEXT,
      user_id INTEGER,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO order_statuses (id, name, code, sort_order) VALUES
      (1, 'Ожидает', 'waiting', 1),
      (2, 'Оформлен', 'placed', 2),
      (3, 'Принят в работу', 'in_work', 3),
      (4, 'Выполнен', 'done', 4),
      (5, 'Передан в ПВЗ', 'at_pickup', 5),
      (6, 'Получен в ПВЗ', 'picked_up', 6),
      (7, 'Завершён', 'completed', 7),
      (8, 'Отменён', 'cancelled', 99);
    INSERT INTO users (id, name, email) VALUES (42, 'Оператор', 'op@example.com');
    INSERT INTO orders (id, number, status, source, created_at) VALUES
      (1, 'ORD-1', 3, 'crm', '2026-11-20T10:00:00.000Z'),
      (2, 'ORD-2', 3, 'crm', '2026-11-20T11:00:00.000Z');
  `)
  return db
}

describe('аудит смены статуса заказа', () => {
  beforeEach(async () => {
    testDb = await createDb()
  })

  afterEach(async () => {
    await testDb.close()
  })

  it('updateOrderStatus пишет событие status_change с именами статусов и автором', async () => {
    await OrderService.updateOrderStatus(1, 4, 42)
    const row = await testDb.get<{
      event_type: string
      message: string
      user_id: number | null
      meta_json: string | null
    }>(`SELECT event_type, message, user_id, meta_json FROM order_activity_events WHERE order_id = 1`)
    expect(row?.event_type).toBe('status_change')
    expect(row?.message).toBe('Статус: «Принят в работу» → «Выполнен»')
    expect(row?.user_id).toBe(42)
    const meta = row?.meta_json ? JSON.parse(row.meta_json) : null
    expect(meta).toMatchObject({ old_status_id: 3, new_status_id: 4 })
  })

  it('событие видно в ленте getOrderActivity', async () => {
    await OrderService.updateOrderStatus(1, 4, 42)
    const activity = await OrderService.getOrderActivity(1)
    const event = activity.events.find((e) => e.event_type === 'status_change')
    expect(event?.message).toBe('Статус: «Принят в работу» → «Выполнен»')
    expect(event?.user_name).toBe('Оператор')
  })

  it('bulkUpdateOrderStatus пишет событие на каждый изменённый заказ', async () => {
    await OrderService.bulkUpdateOrderStatus([1, 2], 7, 42)
    const rows = await testDb.all<Array<{ order_id: number; message: string; meta_json: string | null }>>(
      `SELECT order_id, message, meta_json FROM order_activity_events
       WHERE event_type = 'status_change' ORDER BY order_id`,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.message).toBe('Статус: «Принят в работу» → «Завершён»')
    expect(rows[1]?.message).toBe('Статус: «Принят в работу» → «Завершён»')
    const meta = rows[0]?.meta_json ? JSON.parse(rows[0].meta_json) : null
    expect(meta).toMatchObject({ old_status_id: 3, new_status_id: 7, bulk: true })
  })

  it('не пишет событие, если статус не изменился', async () => {
    await OrderService.bulkUpdateOrderStatus([1], 3, 42)
    const row = await testDb.get(`SELECT id FROM order_activity_events WHERE order_id = 1`)
    expect(row).toBeUndefined()
  })
})
