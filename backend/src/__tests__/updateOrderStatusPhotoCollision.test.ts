import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'

/**
 * photo_orders и orders имеют независимый AUTOINCREMENT.
 * Раньше updateOrderStatus сначала искал id в photo_orders и при коллизии
 * писал числовой CRM-статус туда, не трогая orders (резервы не подтверждались).
 */
describe('OrderService.updateOrderStatus vs photo_orders id collision', () => {
  it('updates CRM orders row even when photo_orders has the same numeric id', async () => {
    await initDB()
    const db = await getDb()
    const collisionId = 9_100_001 + Math.floor(Math.random() * 1000)

    let statusFrom = await db.get<{ id: number }>('SELECT id FROM order_statuses ORDER BY id LIMIT 1')
    if (!statusFrom) {
      await db.run(
        `INSERT INTO order_statuses (name, color, sort_order) VALUES ('Оформлен', '#90caf9', 1)`,
      )
      statusFrom = await db.get<{ id: number }>('SELECT id FROM order_statuses ORDER BY id LIMIT 1')
    }
    let statusTo = await db.get<{ id: number }>(
      'SELECT id FROM order_statuses WHERE id != ? ORDER BY id LIMIT 1',
      [statusFrom!.id],
    )
    if (!statusTo) {
      await db.run(
        `INSERT INTO order_statuses (name, color, sort_order) VALUES ('Принят в работу', '#ffe082', 2)`,
      )
      statusTo = await db.get<{ id: number }>(
        'SELECT id FROM order_statuses WHERE id != ? ORDER BY id LIMIT 1',
        [statusFrom!.id],
      )
    }
    expect(statusFrom?.id).toBeTruthy()
    expect(statusTo?.id).toBeTruthy()

    await db.run('DELETE FROM items WHERE orderId = ?', [collisionId])
    await db.run('DELETE FROM orders WHERE id = ?', [collisionId])
    await db.run('DELETE FROM photo_orders WHERE id = ?', [collisionId])

    await db.run(
      `INSERT INTO photo_orders (
         id, chat_id, status, selected_size, processing_options, quantity, total_price
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      collisionId,
      `collision-chat-${collisionId}`,
      'pending',
      '10x15',
      '{}',
      1,
      100,
    )

    const orderNumber = `ORD-COLLIDE-${collisionId}`
    await db.run(
      `INSERT INTO orders (id, number, status, createdAt, created_at, customerName, source)
       VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
      collisionId,
      orderNumber,
      statusFrom!.id,
      'Collision test',
      'crm',
    )

    const targetStatus = statusTo!.id
    const updated = await OrderService.updateOrderStatus(collisionId, targetStatus)

    expect(Number(updated.status)).toBe(targetStatus)

    const crm = await db.get<{ status: number; number: string }>(
      'SELECT status, number FROM orders WHERE id = ?',
      [collisionId],
    )
    expect(crm?.number).toBe(orderNumber)
    expect(Number(crm?.status)).toBe(targetStatus)

    const photo = await db.get<{ status: string }>(
      'SELECT status FROM photo_orders WHERE id = ?',
      [collisionId],
    )
    expect(photo?.status).toBe('pending')

    await db.run('DELETE FROM orders WHERE id = ?', [collisionId])
    await db.run('DELETE FROM photo_orders WHERE id = ?', [collisionId])
  })
})
