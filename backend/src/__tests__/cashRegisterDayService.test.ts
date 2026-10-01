import 'dotenv/config'
import { getCashRegisterDay, recalculateCashRegisterDay } from '../services/cashRegisterDayService'
import { initDB, getDb } from '../config/database'

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

    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt)
       VALUES (?, 1, ?, ?, 'cash reg test', 120, 'paid', 'offline', ?)`,
      orderNumber,
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
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, 1, ?, ?, 'backfill test', 55, NULL, NULL)`,
      orderNumber,
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
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod)
       VALUES (?, 1, ?, ?, 'get no backfill', 40, NULL, NULL)`,
      orderNumber,
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

  it('excludes soft-cancelled prepaid orders from cash_in_today and issued_today', async () => {
    const db = await getDb()
    const payDay = '2026-06-15'
    const orderNumber = `SOFTCASH-${Date.now()}`

    let hasIsCancelled = false
    let hasPrepayCol = false
    try {
      hasIsCancelled = !!(await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'is_cancelled'"))
      hasPrepayCol = !!(await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'"))
    } catch {
      hasIsCancelled = false
      hasPrepayCol = false
    }
    if (!hasIsCancelled || !hasPrepayCol) return

    const before = await getCashRegisterDay(payDay)

    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt, is_cancelled)
       VALUES (?, 3, ?, ?, 'soft-cancel cash', 90, 'paid', 'offline', ?, 1)`,
      orderNumber,
      `${payDay} 10:00:00`,
      `${payDay} 10:00:00`,
      `${payDay} 12:00:00`,
    )
    const inserted = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', orderNumber)
    expect(inserted?.id).toBeTruthy()

    let hasDebtClosed = false
    try {
      hasDebtClosed = !!(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='debt_closed_events'"))
    } catch {
      hasDebtClosed = false
    }
    if (hasDebtClosed) {
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
        inserted!.id,
        payDay,
        40,
      )
    }

    const after = await getCashRegisterDay(payDay)
    expect(after.cash_in_today).toBe(before.cash_in_today)
    expect(after.issued_today).toBe(before.issued_today)
    expect(after.orders_included_count).toBe(before.orders_included_count)
  })
})
