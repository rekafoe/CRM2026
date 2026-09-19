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
      1,
      'Collision test',
      'crm',
    )

    const targetStatus = 2
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
