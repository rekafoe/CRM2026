import { getDb } from '../config/database'
import { finalizeMiniappDraft } from '../services/miniappCheckoutService'
import { OrderService } from '../modules/orders/services/orderService'
import { MINIAPP_CHECKOUT_STATE_DRAFT } from '../utils/miniappCheckoutState'

async function ensureOrdersColumn(name: string, ddl: string): Promise<void> {
  const db = await getDb()
  const columns = (await db.all(`PRAGMA table_info(orders)`)) as Array<{ name: string }>
  if ((columns || []).some((c) => c.name === name)) return
  await db.exec(ddl)
}

describe('miniapp finalize after soft-cancel', () => {
  beforeAll(async () => {
    await ensureOrdersColumn('telegram_chat_id', 'ALTER TABLE orders ADD COLUMN telegram_chat_id TEXT')
    await ensureOrdersColumn('miniapp_checkout_state', 'ALTER TABLE orders ADD COLUMN miniapp_checkout_state TEXT')
    await ensureOrdersColumn(
      'miniapp_design_help_requested',
      'ALTER TABLE orders ADD COLUMN miniapp_design_help_requested INTEGER DEFAULT 0',
    )
    await ensureOrdersColumn('is_cancelled', 'ALTER TABLE orders ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0')
  })

  it('rejects finalize and does not spend stock when draft is soft-cancelled', async () => {
    const db = await getDb()
    const stamp = Date.now()
    const chatId = `tg-softcancel-${stamp}`
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Softcancel paper ${stamp}`,
      'лист',
      100,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         telegram_chat_id, miniapp_checkout_state, miniapp_design_help_requested, is_cancelled
       ) VALUES (?, 1, datetime('now'), datetime('now'), 'softcancel test', ?, ?, 1, 0)`,
      `MAP-SOFT-${stamp}`,
      chatId,
      MINIAPP_CHECKOUT_STATE_DRAFT,
    )
    const orderId = order.lastID!
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      orderId,
      '1',
      JSON.stringify({
        _miniappComponents: [{ materialId, qtyPerItem: 10 }],
      }),
      5,
      2,
    )

    await OrderService.softCancelOrder(orderId, undefined, 'abandoned miniapp draft')

    await expect(finalizeMiniappDraft(chatId, orderId)).rejects.toMatchObject({
      code: 'MINIAPP_ORDER_CANCELLED',
    })

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(100)

    const movesRaw = await db.all(
      'SELECT delta FROM material_moves WHERE order_id = ? AND material_id = ?',
      orderId,
      materialId,
    )
    const moves = (Array.isArray(movesRaw) ? movesRaw : movesRaw ? [movesRaw] : []) as Array<{ delta: number }>
    expect(moves.length).toBe(0)

    const state = await db.get<{ miniapp_checkout_state: string; is_cancelled: number }>(
      'SELECT miniapp_checkout_state, COALESCE(is_cancelled, 0) as is_cancelled FROM orders WHERE id = ?',
      orderId,
    )
    expect(state?.miniapp_checkout_state).toBe(MINIAPP_CHECKOUT_STATE_DRAFT)
    expect(Number(state?.is_cancelled)).toBe(1)

    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  it('deductMaterialsForExistingOrder refuses soft-cancelled orders', async () => {
    const db = await getDb()
    const stamp = Date.now() + 1
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Deduct guard paper ${stamp}`,
      'лист',
      50,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName, is_cancelled
       ) VALUES (?, 1, datetime('now'), datetime('now'), 'deduct guard', 1)`,
      `ORD-SOFT-DED-${stamp}`,
    )
    const orderId = order.lastID!
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      orderId,
      '1',
      JSON.stringify({
        _miniappComponents: [{ materialId, qtyPerItem: 5 }],
      }),
      1,
      1,
    )

    const result = await OrderService.deductMaterialsForExistingOrder(orderId)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => /отмен/i.test(e))).toBe(true)

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(50)

    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })
})
