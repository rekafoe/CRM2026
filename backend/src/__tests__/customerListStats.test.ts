import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'

describe('CustomerService list and last order', () => {
  const stamp = `ZZLIST${Date.now()}`
  const createdIds: number[] = []
  const orderIds: number[] = []

  beforeAll(async () => {
    await initDB()
  })

  afterAll(async () => {
    const db = await getDb()
    if (orderIds.length > 0) {
      const ph = orderIds.map(() => '?').join(',')
      await db.run(`DELETE FROM items WHERE orderId IN (${ph})`, orderIds)
      await db.run(`DELETE FROM orders WHERE id IN (${ph})`, orderIds)
    }
    for (const id of createdIds) {
      await CustomerService.deleteCustomer(id)
    }
    const fresh = await CustomerService.getAllCustomers({ search: stamp, includeStats: false })
    expect(fresh.total).toBe(0)
  })

  it('берёт сумму только последнего заказа и режет страницу до расчёта', async () => {
    const older = await CustomerService.createCustomer({
      type: 'individual',
      first_name: 'Старый',
      last_name: stamp,
    })
    const newer = await CustomerService.createCustomer({
      type: 'individual',
      first_name: 'Новый',
      last_name: stamp,
    })
    const extra = await CustomerService.createCustomer({
      type: 'individual',
      first_name: 'Третий',
      last_name: stamp,
    })
    createdIds.push(older.id, newer.id, extra.id)

    const db = await getDb()
    const status = await db.get('SELECT id FROM order_statuses ORDER BY id LIMIT 1') as { id: number } | undefined
    const statusId = status?.id ?? 1

    const oldOrder = await db.run(
      `INSERT INTO orders (number, status, customer_id, created_at, createdAt, discount_percent)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [`${stamp}-OLD`, statusId, newer.id, '2026-01-01 10:00:00', '2026-01-01 10:00:00']
    )
    const newOrder = await db.run(
      `INSERT INTO orders (number, status, customer_id, created_at, createdAt, discount_percent)
       VALUES (?, ?, ?, ?, ?, 10)`,
      [`${stamp}-NEW`, statusId, newer.id, '2026-06-01 10:00:00', '2026-06-01 10:00:00']
    )
    const oldOrderId = Number((oldOrder as { lastID: number }).lastID)
    const newOrderId = Number((newOrder as { lastID: number }).lastID)
    orderIds.push(oldOrderId, newOrderId)

    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, 'print', '{}', 100, 2)`,
      [oldOrderId]
    )
    await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, 'print', ?, 1, 1)`,
      [newOrderId, JSON.stringify({ storedTotalCost: 200 })]
    )

    const listed = await CustomerService.getAllCustomers({
      search: stamp,
      type: 'individual',
    })
    const row = listed.customers.find((customer) => customer.id === newer.id)
    expect(row?.last_order_at).toContain('2026-06-01')
    expect(row?.last_order_amount).toBe(180)
    expect(listed.customers.find((customer) => customer.id === older.id)?.last_order_amount).toBeNull()

    const page = await CustomerService.getAllCustomers({
      search: stamp,
      includeStats: false,
      limit: 2,
      offset: 0,
    })
    expect(page.total).toBe(3)
    expect(page.customers).toHaveLength(2)
    expect(page.customers[0].last_order_at).toBeUndefined()

    const tail = await CustomerService.getAllCustomers({
      search: stamp,
      includeStats: false,
      limit: 2,
      offset: 2,
    })
    expect(tail.customers).toHaveLength(1)
    expect(tail.total).toBe(3)
  })
})
