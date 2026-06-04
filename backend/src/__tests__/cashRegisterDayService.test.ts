import 'dotenv/config'
import { getCashRegisterDay, backfillPaymentMetadataForCashDay } from '../services/cashRegisterDayService'
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

    const payload = await getCashRegisterDay(workDay)
    expect(payload.cash_in_today).toBeGreaterThanOrEqual(55)

    const row = await db.get<{ prepaymentUpdatedAt: string; prepaymentStatus: string }>(
      'SELECT prepaymentUpdatedAt, prepaymentStatus FROM orders WHERE number = ?',
      orderNumber,
    )
    expect(String(row?.prepaymentStatus)).toBe('paid')
    expect(String(row?.prepaymentUpdatedAt ?? '').slice(0, 10)).toBe(workDay)
  })
})
