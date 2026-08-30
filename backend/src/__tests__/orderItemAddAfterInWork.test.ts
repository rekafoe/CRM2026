import { Request, Response } from 'express';
import { OrderItemController } from '../modules/orders/controllers/orderItemController';
import { getDb } from '../config/database';

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/earningsService', () => ({
  EarningsService: { recalculateForDate: jest.fn(async () => undefined) },
}));

jest.mock('../modules/orders/services/orderPricingService', () => ({
  OrderPricingService: { recalculateOrderPrices: jest.fn(async () => undefined) },
}));

jest.mock('../services/userInboxNotificationService', () => ({
  UserInboxNotificationService: {},
}));

function responseMock() {
  const res: any = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('addItem after «Принят в работу» spends materials', () => {
  let materialId: number;
  let orderId: number;
  let inWorkStatusId: number;
  let waitingStatusId: number;

  beforeAll(async () => {
    const db = await getDb();

    let inWork = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1`,
      ['Принят в работу']
    );
    if (!inWork?.id) {
      const ins = await db.run(
        `INSERT INTO order_statuses (name, sort_order) VALUES (?, ?)`,
        ['Принят в работу', 50]
      );
      inWorkStatusId = Number(ins.lastID);
    } else {
      inWorkStatusId = Number(inWork.id);
    }

    let waiting = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1`,
      ['Ожидает']
    );
    if (!waiting?.id) {
      const ins = await db.run(
        `INSERT INTO order_statuses (name, sort_order) VALUES (?, ?)`,
        ['Ожидает', 1]
      );
      waitingStatusId = Number(ins.lastID);
    } else {
      waitingStatusId = Number(waiting.id);
    }

    const mat = await db.run(
      `INSERT INTO materials (name, unit, quantity, min_quantity, is_active) VALUES (?, ?, ?, ?, 1)`,
      [`AddAfterInWork Paper ${Date.now()}`, 'лист', 500, 0]
    );
    materialId = Number(mat.lastID);

    const ord = await db.run(
      `INSERT INTO orders (number, status, created_at, source) VALUES (?, ?, datetime('now'), 'crm')`,
      [`ADD-INWORK-${Date.now()}`, inWorkStatusId]
    );
    orderId = Number(ord.lastID);
  });

  afterAll(async () => {
    const db = await getDb();
    await db.run(`DELETE FROM material_moves WHERE material_id = ?`, materialId).catch(() => undefined);
    await db.run(`DELETE FROM material_reservations WHERE order_id = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM items WHERE orderId = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM orders WHERE id = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM materials WHERE id = ?`, materialId).catch(() => undefined);
  });

  it('списывает склад сразу, если заказ уже в работе', async () => {
    const db = await getDb();
    const before = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    expect(Number(before?.quantity)).toBe(500);

    const req = {
      params: { id: String(orderId) },
      body: {
        type: 'print',
        params: { description: 'test add after in-work' },
        price: 10,
        quantity: 5,
        components: [{ materialId, qtyPerItem: 2 }],
      },
      user: { id: 1 },
    } as unknown as Request;
    const res = responseMock();

    await OrderItemController.addItem(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    const after = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    // 5 × 2 = 10 листов
    expect(Number(after?.quantity)).toBe(490);

    const holds = await db.all<Array<{ status: string; quantity_reserved: number }>>(
      `SELECT status, quantity_reserved FROM material_reservations WHERE order_id = ?`,
      orderId
    );
    expect(holds.length).toBeGreaterThan(0);
    expect(holds.every((h) => String(h.status) === 'fulfilled')).toBe(true);
    expect(holds.reduce((s, h) => s + Number(h.quantity_reserved), 0)).toBe(10);
  });

  it('только резервирует, если заказ ещё «Ожидает»', async () => {
    const db = await getDb();
    const ord = await db.run(
      `INSERT INTO orders (number, status, created_at, source) VALUES (?, ?, datetime('now'), 'crm')`,
      [`ADD-WAIT-${Date.now()}`, waitingStatusId]
    );
    const waitingOrderId = Number(ord.lastID);

    const mat = await db.run(
      `INSERT INTO materials (name, unit, quantity, min_quantity, is_active) VALUES (?, ?, ?, ?, 1)`,
      [`AddWait Paper ${Date.now()}`, 'лист', 200, 0]
    );
    const waitMaterialId = Number(mat.lastID);

    try {
      const req = {
        params: { id: String(waitingOrderId) },
        body: {
          type: 'print',
          params: { description: 'test add waiting' },
          price: 10,
          quantity: 3,
          components: [{ materialId: waitMaterialId, qtyPerItem: 4 }],
        },
        user: { id: 1 },
      } as unknown as Request;
      const res = responseMock();

      await OrderItemController.addItem(req, res as Response);
      expect(res.status).toHaveBeenCalledWith(201);

      const after = await db.get<{ quantity: number }>(
        `SELECT quantity FROM materials WHERE id = ?`,
        waitMaterialId
      );
      expect(Number(after?.quantity)).toBe(200);

      const holds = await db.all<Array<{ status: string }>>(
        `SELECT status FROM material_reservations WHERE order_id = ?`,
        waitingOrderId
      );
      expect(holds.some((h) => String(h.status) === 'active')).toBe(true);
    } finally {
      await db.run(`DELETE FROM material_reservations WHERE order_id = ?`, waitingOrderId).catch(() => undefined);
      await db.run(`DELETE FROM items WHERE orderId = ?`, waitingOrderId).catch(() => undefined);
      await db.run(`DELETE FROM orders WHERE id = ?`, waitingOrderId).catch(() => undefined);
      await db.run(`DELETE FROM materials WHERE id = ?`, waitMaterialId).catch(() => undefined);
    }
  });
});
