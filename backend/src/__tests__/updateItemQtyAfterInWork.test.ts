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

describe('updateItem qty change after «Принят в работу»', () => {
  let materialId: number;
  let orderId: number;
  let itemId: number;
  let inWorkStatusId: number;
  let reservationId: number;

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

    const mat = await db.run(
      `INSERT INTO materials (name, unit, quantity, min_quantity, is_active) VALUES (?, ?, ?, ?, 1)`,
      [`UpdQtyInWork Paper ${Date.now()}`, 'лист', 1000, 0]
    );
    materialId = Number(mat.lastID);

    const ord = await db.run(
      `INSERT INTO orders (number, status, created_at, source) VALUES (?, ?, datetime('now'), 'crm')`,
      [`UPD-INWORK-${Date.now()}`, inWorkStatusId]
    );
    orderId = Number(ord.lastID);

    // Уже списано 10×2=20 при принятии; холд fulfilled
    await db.run(`UPDATE materials SET quantity = quantity - 20 WHERE id = ?`, materialId);
    const hold = await db.run(
      `INSERT INTO material_reservations
       (material_id, order_id, quantity_reserved, status, notes, expires_at)
       VALUES (?, ?, ?, 'fulfilled', ?, datetime('now', '+1 day'))`,
      materialId,
      orderId,
      20,
      'initial accept'
    );
    reservationId = Number(hold.lastID);

    const item = await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity, sides, sheets, waste, clicks)
       VALUES (?, ?, ?, ?, ?, 1, 10, 0, 10)`,
      orderId,
      'print',
      JSON.stringify({
        description: 'update qty after in-work',
        components: [{ materialId, qtyPerItem: 2, reservationId }],
      }),
      10,
      10
    );
    itemId = Number(item.lastID);
  });

  afterAll(async () => {
    const db = await getDb();
    await db.run(`DELETE FROM material_moves WHERE material_id = ?`, materialId).catch(() => undefined);
    await db.run(`DELETE FROM material_reservations WHERE order_id = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM items WHERE orderId = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM orders WHERE id = ?`, orderId).catch(() => undefined);
    await db.run(`DELETE FROM materials WHERE id = ?`, materialId).catch(() => undefined);
  });

  it('при увеличении тиража списывает дельту со склада', async () => {
    const db = await getDb();
    const before = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    expect(Number(before?.quantity)).toBe(980);

    const req = {
      params: { orderId: String(orderId), itemId: String(itemId) },
      body: { quantity: 15 },
      user: { id: 1 },
    } as unknown as Request;
    const res = responseMock();

    await OrderItemController.updateItem(req, res as Response);

    expect(res.json).toHaveBeenCalled();
    const after = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    // +5 шт × 2 = 10 листов
    expect(Number(after?.quantity)).toBe(970);

    const item = await db.get<{ quantity: number }>(
      `SELECT quantity FROM items WHERE id = ?`,
      itemId
    );
    expect(Number(item?.quantity)).toBe(15);
  });

  it('при уменьшении тиража возвращает дельту на склад', async () => {
    const db = await getDb();
    const before = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    expect(Number(before?.quantity)).toBe(970);

    const req = {
      params: { orderId: String(orderId), itemId: String(itemId) },
      body: { quantity: 12 },
      user: { id: 1 },
    } as unknown as Request;
    const res = responseMock();

    await OrderItemController.updateItem(req, res as Response);

    expect(res.json).toHaveBeenCalled();
    const after = await db.get<{ quantity: number }>(
      `SELECT quantity FROM materials WHERE id = ?`,
      materialId
    );
    // −3 шт × 2 = 6 листов назад
    expect(Number(after?.quantity)).toBe(976);
  });
});
