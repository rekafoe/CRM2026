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

  it('department-scoped recalculate does not backfill other points', async () => {
    const db = await getDb()
    let hasPrepayCol = false
    let hasFulfillment = false
    try {
      const prepay = await db.get("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'prepaymentUpdatedAt'")
      const fulfillment = await db.get(
        "SELECT 1 FROM pragma_table_info('orders') WHERE name = 'fulfillment_department_id'",
      )
      hasPrepayCol = !!prepay
      hasFulfillment = !!fulfillment
    } catch {
      hasPrepayCol = false
      hasFulfillment = false
    }
    if (!hasPrepayCol || !hasFulfillment) return

    const workDay = '2026-06-13'
    const suffix = Date.now()
    await db.run(
      `INSERT INTO departments (name, code) VALUES (?, ?)`,
      `CashBF-A-${suffix}`,
      `cbfa${suffix}`,
    )
    await db.run(
      `INSERT INTO departments (name, code) VALUES (?, ?)`,
      `CashBF-B-${suffix}`,
      `cbfb${suffix}`,
    )
    const deptA = await db.get<{ id: number }>('SELECT id FROM departments WHERE code = ?', `cbfa${suffix}`)
    const deptB = await db.get<{ id: number }>('SELECT id FROM departments WHERE code = ?', `cbfb${suffix}`)
    const deptAId = Number(deptA?.id)
    const deptBId = Number(deptB?.id)
    if (!Number.isFinite(deptAId) || !Number.isFinite(deptBId)) return

    const orderA = `BFA-${suffix}`
    const orderB = `BFB-${suffix}`
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, fulfillment_department_id)
       VALUES (?, 1, ?, ?, 'point A', 70, NULL, NULL, ?)`,
      orderA,
      `${workDay} 12:00:00`,
      `${workDay} 12:00:00`,
      deptAId,
    )
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, prepaymentAmount, prepaymentStatus, paymentMethod, fulfillment_department_id)
       VALUES (?, 1, ?, ?, 'point B', 90, NULL, NULL, ?)`,
      orderB,
      `${workDay} 12:00:00`,
      `${workDay} 12:00:00`,
      deptBId,
    )

    const payload = await recalculateCashRegisterDay(workDay, deptAId)
    expect(payload.backfill_updated).toBeGreaterThanOrEqual(1)

    const rowA = await db.get<{ prepaymentUpdatedAt: string | null; prepaymentStatus: string | null }>(
      'SELECT prepaymentUpdatedAt, prepaymentStatus FROM orders WHERE number = ?',
      orderA,
    )
    const rowB = await db.get<{ prepaymentUpdatedAt: string | null; prepaymentStatus: string | null }>(
      'SELECT prepaymentUpdatedAt, prepaymentStatus FROM orders WHERE number = ?',
      orderB,
    )
    expect(String(rowA?.prepaymentStatus)).toBe('paid')
    expect(String(rowA?.prepaymentUpdatedAt ?? '').slice(0, 10)).toBe(workDay)
    expect(rowB?.prepaymentUpdatedAt == null || String(rowB.prepaymentUpdatedAt).trim() === '').toBe(true)
    expect(rowB?.prepaymentStatus == null || String(rowB.prepaymentStatus).trim() === '').toBe(true)
  })
})
