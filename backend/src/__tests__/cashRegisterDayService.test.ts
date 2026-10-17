import 'dotenv/config'
import { getCashRegisterDay, recalculateCashRegisterDay } from '../services/cashRegisterDayService'
import { initDB, getDb } from '../config/database'

async function statusIdByCode(code: string, name: string, fallback: number): Promise<number> {
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    `SELECT id FROM order_statuses
      WHERE code = ? OR name = ?
      ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, id
      LIMIT 1`,
    code,
    name,
    code,
  )
  return row?.id ?? fallback
}

describe('cashRegisterDayService', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('counts prepayment on payment day in cash_in_today', async () => {
    const db = await getDb()
    const payDay = '2026-06-10'
    const workDay = '2026-06-08'
    const orderNumber = `REG-${Date.now()}`

    let hasPrepayCol = false
    try {
      const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      hasPrepayCol = !!col
    } catch {
      hasPrepayCol = false
    }
    if (!hasPrepayCol) return

    const placedId = await statusIdByCode('placed', 'Оформлен', 6)
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, ?, ?, ?, 'cash reg test', 120, 'paid', 'offline', ?)`,
      orderNumber,
      placedId,
      `${workDay} 12:00:00`,
      `${workDay} 12:00:00`,
      `${payDay} 12:00:00`,
    )

    const payload = await getCashRegisterDay(payDay)
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    expect(inserted?.id).toBeTruthy()

    expect(payload.cash_in_today).toBeGreaterThanOrEqual(120)
    expect(payload.orders_included_count).toBeGreaterThanOrEqual(1)
  })

  it('backfill sets prepaymentUpdatedAt for work-day orders without date', async () => {
    const db = await getDb()
    let hasPrepayCol = false
    try {
      const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      hasPrepayCol = !!col
    } catch {
      hasPrepayCol = false
    }
    if (!hasPrepayCol) return

    const workDay = '2026-06-11'
    const orderNumber = `BF-${Date.now()}`
    const placedId = await statusIdByCode('placed', 'Оформлен', 6)
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, ?, ?, ?, 'backfill test', 55, NULL, NULL)`,
      orderNumber,
      placedId,
      `${workDay} 12:00:00`,
      `${workDay} 12:00:00`,
    )

    const payload = await recalculateCashRegisterDay(workDay)
    expect(payload.cash_in_today).toBeGreaterThanOrEqual(55)
    expect(payload.backfill_updated).toBeGreaterThanOrEqual(1)

    const row = await db.get<{ prepaymentUpdatedAt: string; prepaymentStatus: string }>(
      'SELECT prepaymentUpdatedAt, prepaymentStatus FROM orders WHERE number = ?',
      orderNumber,
    )
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.prepaymentUpdatedAt ?? '').slice(0, 10)).toBe(workDay)
  })

  it('GET cash register does not backfill payment metadata', async () => {
    const db = await getDb()
    let hasPrepayCol = false
    try {
      const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      hasPrepayCol = !!col
    } catch {
      hasPrepayCol = false
    }
    if (!hasPrepayCol) return

    const workDay = '2026-06-12'
    const orderNumber = `GETBF-${Date.now()}`
    const placedId = await statusIdByCode('placed', 'Оформлен', 6)
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, ?, ?, ?, 'get no backfill', 40, NULL, NULL)`,
      orderNumber,
      placedId,
      `${workDay} 12:00:00`,
      `${workDay} 12:00:00`,
    )

    await getCashRegisterDay(workDay)
    const row = await db.get<{ prepaymentUpdatedAt: string | null; prepaymentStatus: string | null }>(
      'SELECT prepaymentUpdatedAt, prepaymentStatus FROM orders WHERE number = ?',
      orderNumber,
    )
    expect(row?.prepaymentUpdatedAt == null || String(row.prepaymentUpdatedAt).trim() === '').toBe(true)
    expect(row?.prepaymentStatus == null || String(row.prepaymentStatus).trim() === '').toBe(true)
  })

  it('не считает в кассу статус 0 и справочник «Ожидает», оформленный заказ считает', async () => {
    const db = await getDb()
    let hasPrepayCol = false
    try {
      const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      hasPrepayCol = !!col
    } catch {
      hasPrepayCol = false
    }
    if (!hasPrepayCol) return

    const day = '2099-04-17'
    const stamp = `${day} 12:00:00`
    const waitingId = await statusIdByCode('waiting', 'Ожидает', 1)
    const placedId = await statusIdByCode('placed', 'Оформлен', 6)
    const numbers = [`WAIT0-${Date.now()}`, `WAITN-${Date.now()}`, `PLACED-${Date.now()}`]

    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, 0, ?, ?, 'pool wait', 40, 'paid', 'offline', ?)`,
      numbers[0],
      stamp,
      stamp,
      stamp,
    )
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, ?, ?, ?, 'catalog wait', 70, 'paid', 'offline', ?)`,
      numbers[1],
      waitingId,
      stamp,
      stamp,
      stamp,
    )
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, ?, ?, ?, 'placed cash', 25, 'paid', 'offline', ?)`,
      numbers[2],
      placedId,
      stamp,
      stamp,
      stamp,
    )

    const placedOrder = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', numbers[2])
    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      placedOrder?.id,
      day,
      10,
    )

    try {
      const payload = await getCashRegisterDay(day)
      // Предоплата status 0 / «Ожидает» не в кассе; оформленный заказ — да.
      expect(payload.cash_in_today).toBe(25)
      expect(payload.order_volume_work_day).toBe(0)
      expect(payload.issued_today).toBe(10)
      expect(payload.orders_included_count).toBe(1)
    } finally {
      const ids = (await db.all(
        `SELECT id FROM orders WHERE number IN (?, ?, ?)`,
        ...numbers,
      )) as Array<{ id: number }>
      for (const row of ids) {
        await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', row.id)
        await db.run('DELETE FROM orders WHERE id = ?', row.id)
      }
    }
  })

  it('выданный заказ, возвращённый в «Ожидает», остаётся в issued_today и cash_in', async () => {
    const db = await getDb()
    let hasPrepayCol = false
    try {
      const col = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      hasPrepayCol = !!col
    } catch {
      hasPrepayCol = false
    }
    if (!hasPrepayCol) return

    const day = '2099-04-18'
    const stamp = `${day} 14:00:00`
    const waitingId = await statusIdByCode('waiting', 'Ожидает', 1)
    const completedId = await statusIdByCode('completed', 'Завершён', 7)
    const number = `ISSUE-WAIT-${Date.now()}`

    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, ?, ?, ?, 'issued then waiting', 50, 'paid', 'offline', ?)`,
      number,
      completedId,
      stamp,
      stamp,
      stamp,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()
    await db.run(
      'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
      order!.id,
      day,
      30,
    )

    try {
      const before = await getCashRegisterDay(day)
      expect(before.issued_today).toBeGreaterThanOrEqual(30)
      expect(before.cash_in_today).toBeGreaterThanOrEqual(30)

      await db.run('UPDATE orders SET status = ? WHERE id = ?', waitingId, order!.id)

      const after = await getCashRegisterDay(day)
      expect(after.issued_today).toBe(before.issued_today)
      expect(after.cash_in_today).toBe(before.cash_in_today)
      expect(after.orders_included_count).toBe(before.orders_included_count)
    } finally {
      await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', order!.id)
      await db.run('DELETE FROM orders WHERE id = ?', order!.id)
    }
  })
})
