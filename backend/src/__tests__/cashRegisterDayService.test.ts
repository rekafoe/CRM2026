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

  it('scopes issued_today to fulfillment department (not company-wide)', async () => {
    const db = await getDb()
    let hasFulfillment = false
    let hasIssuedBy = false
    try {
      hasFulfillment = !!(await db.get(
        "SELECT 1 FROM pragma_table_info('orders') WHERE name = 'fulfillment_department_id'",
      ))
      hasIssuedBy = !!(await db.get(
        "SELECT 1 FROM pragma_table_info('debt_closed_events') WHERE name = 'issued_by_user_id'",
      ))
    } catch {
      return
    }
    if (!hasFulfillment) return

    const day = '2026-09-05'
    const stamp = `${day} 12:00:00`
    const suffix = Date.now()

    await db.run(
      `INSERT INTO departments (name, description, sort_order) VALUES (?, '', 0)`,
      `CashDeptA-${suffix}`,
    )
    const deptA = await db.get<{ id: number }>(
      'SELECT id FROM departments WHERE name = ?',
      `CashDeptA-${suffix}`,
    )
    await db.run(
      `INSERT INTO departments (name, description, sort_order) VALUES (?, '', 0)`,
      `CashDeptB-${suffix}`,
    )
    const deptB = await db.get<{ id: number }>(
      'SELECT id FROM departments WHERE name = ?',
      `CashDeptB-${suffix}`,
    )
    expect(deptA?.id).toBeTruthy()
    expect(deptB?.id).toBeTruthy()

    const numA = `ISSUE-A-${suffix}`
    const numB = `ISSUE-B-${suffix}`
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, fulfillment_department_id)
       VALUES (?, 7, ?, ?, 'dept A issue', 0, 'paid', 'offline', ?)`,
      numA,
      stamp,
      stamp,
      deptA!.id,
    )
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, fulfillment_department_id)
       VALUES (?, 7, ?, ?, 'dept B issue', 0, 'paid', 'offline', ?)`,
      numB,
      stamp,
      stamp,
      deptB!.id,
    )
    const orderA = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', numA)
    const orderB = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', numB)
    expect(orderA?.id).toBeTruthy()
    expect(orderB?.id).toBeTruthy()

    if (hasIssuedBy) {
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount, issued_by_user_id) VALUES (?, ?, ?, NULL)',
        orderA!.id,
        day,
        40,
      )
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount, issued_by_user_id) VALUES (?, ?, ?, NULL)',
        orderB!.id,
        day,
        90,
      )
    } else {
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
        orderA!.id,
        day,
        40,
      )
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
        orderB!.id,
        day,
        90,
      )
    }

    const scopedA = await getCashRegisterDay(day, deptA!.id)
    const scopedB = await getCashRegisterDay(day, deptB!.id)
    const all = await getCashRegisterDay(day)

    expect(scopedA.issued_today).toBe(40)
    expect(scopedB.issued_today).toBe(90)
    expect(all.issued_today).toBeGreaterThanOrEqual(130)
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
})
