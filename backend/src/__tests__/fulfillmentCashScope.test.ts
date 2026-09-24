import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { OrderService } from '../modules/orders/services/orderService'
import { getCashRegisterDay } from '../services/cashRegisterDayService'
import { hasColumn } from '../utils/tableSchemaCache'

/**
 * После скоупа кассы по точке (COALESCE(fulfillment, owner.department))
 * website/miniapp заказы без fulfillment «ездили» за userId:
 * reassign → касса другой точки; softCancel → касса исчезала.
 */
describe('fulfillment cash scope', () => {
  beforeAll(async () => {
    await initDB()
  })

  async function ensureDeptAndUsers(): Promise<{
    deptA: number
    deptB: number
    userA: number
    userB: number
    hasPrepayUpdatedAt: boolean
    hasIsCancelled: boolean
  } | null> {
    const db = await getDb()
    const hasFulfillment = await hasColumn('orders', 'fulfillment_department_id').catch(() => false)
    const hasUserDept = await hasColumn('users', 'department_id').catch(() => false)
    if (!hasFulfillment || !hasUserDept) return null

    const hasPrepayUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt').catch(() => false)
    const hasIsCancelled = await hasColumn('orders', 'is_cancelled').catch(() => false)

    const stamp = Date.now()
    await db.run(
      `INSERT INTO departments (name, description, sort_order, code, is_active, created_at)
       VALUES (?, 'cash-scope-a', 0, ?, 1, datetime('now'))`,
      [`Cash Scope A ${stamp}`, `cash-scope-a-${stamp}`],
    )
    const deptA = Number((await db.get<{ id: number }>('SELECT last_insert_rowid() as id'))?.id)
    await db.run(
      `INSERT INTO departments (name, description, sort_order, code, is_active, created_at)
       VALUES (?, 'cash-scope-b', 0, ?, 1, datetime('now'))`,
      [`Cash Scope B ${stamp}`, `cash-scope-b-${stamp}`],
    )
    const deptB = Number((await db.get<{ id: number }>('SELECT last_insert_rowid() as id'))?.id)

    const tokenA = `tok-a-${stamp}`
    const tokenB = `tok-b-${stamp}`
    await db.run(
      `INSERT INTO users (name, email, role, api_token, department_id, is_active)
       VALUES (?, ?, 'user', ?, ?, 1)`,
      [`Op A ${stamp}`, `op-a-${stamp}@test.local`, tokenA, deptA],
    )
    const userA = Number((await db.get<{ id: number }>('SELECT last_insert_rowid() as id'))?.id)
    await db.run(
      `INSERT INTO users (name, email, role, api_token, department_id, is_active)
       VALUES (?, ?, 'user', ?, ?, 1)`,
      [`Op B ${stamp}`, `op-b-${stamp}@test.local`, tokenB, deptB],
    )
    const userB = Number((await db.get<{ id: number }>('SELECT last_insert_rowid() as id'))?.id)

    if (![deptA, deptB, userA, userB].every((n) => Number.isFinite(n) && n > 0)) return null
    return { deptA, deptB, userA, userB, hasPrepayUpdatedAt, hasIsCancelled }
  }

  it('ensureFulfillmentDepartmentFromUser stamps only when fulfillment is null', async () => {
    const ctx = await ensureDeptAndUsers()
    if (!ctx) return
    const db = await getDb()
    const number = `FUL-ENS-${Date.now()}`
    await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, userId, source, fulfillment_department_id)
       VALUES (?, 1, datetime('now'), datetime('now'), 'ensure', ?, 'website', NULL)`,
      number,
      ctx.userA,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()

    const stamped = await OrderService.ensureFulfillmentDepartmentFromUser(order!.id, ctx.userA)
    expect(stamped).toBe(ctx.deptA)
    const again = await OrderService.ensureFulfillmentDepartmentFromUser(order!.id, ctx.userB)
    expect(again).toBe(ctx.deptA)
    const row = await db.get<{ fulfillment_department_id: number }>(
      'SELECT fulfillment_department_id FROM orders WHERE id = ?',
      order!.id,
    )
    expect(Number(row?.fulfillment_department_id)).toBe(ctx.deptA)
  })

  it('reassign does not move prepaid cash between departments when fulfillment was null', async () => {
    const ctx = await ensureDeptAndUsers()
    if (!ctx || !ctx.hasPrepayUpdatedAt) return

    const db = await getDb()
    const payDay = '2026-09-10'
    const number = `FUL-RE-${Date.now()}`
    await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt,
         userId, source, fulfillment_department_id
       ) VALUES (?, 1, ?, ?, 'fulfillment reassign', 200, 'paid', 'offline', ?, ?, 'website', NULL)`,
      number,
      `${payDay} 10:00:00`,
      `${payDay} 10:00:00`,
      `${payDay} 10:00:00`,
      ctx.userA,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()

    const beforeA = await getCashRegisterDay(payDay, ctx.deptA)
    expect(beforeA.cash_in_today).toBeGreaterThanOrEqual(200)

    await OrderService.reassignOrderByNumber(number, ctx.userB, ctx.userB)

    const row = await db.get<{ fulfillment_department_id: number | null; userId: number | null }>(
      'SELECT fulfillment_department_id, userId FROM orders WHERE id = ?',
      order!.id,
    )
    expect(Number(row?.fulfillment_department_id)).toBe(ctx.deptA)
    expect(Number(row?.userId)).toBe(ctx.userB)

    const afterA = await getCashRegisterDay(payDay, ctx.deptA)
    const afterB = await getCashRegisterDay(payDay, ctx.deptB)
    expect(afterA.cash_in_today).toBeGreaterThanOrEqual(200)
    // Заказ остался на точке A — в кассе B его нет как прироста от этого заказа.
    expect(afterB.orders_included_count).toBeLessThanOrEqual(afterA.orders_included_count)
  })

  it('softCancel keeps prepaid cash on claiming department after clearing userId', async () => {
    const ctx = await ensureDeptAndUsers()
    if (!ctx || !ctx.hasPrepayUpdatedAt || !ctx.hasIsCancelled) return

    const db = await getDb()
    const payDay = '2026-09-11'
    const number = `FUL-SC-${Date.now()}`
    await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         prepaymentAmount, prepaymentStatus, paymentMethod, prepaymentUpdatedAt,
         userId, source, fulfillment_department_id, is_cancelled
       ) VALUES (?, 1, ?, ?, 'fulfillment softcancel', 150, 'paid', 'offline', ?, ?, 'mini_app', NULL, 0)`,
      number,
      `${payDay} 10:00:00`,
      `${payDay} 10:00:00`,
      `${payDay} 10:00:00`,
      ctx.userA,
    )
    const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
    expect(order?.id).toBeTruthy()

    const before = await getCashRegisterDay(payDay, ctx.deptA)
    expect(before.cash_in_today).toBeGreaterThanOrEqual(150)

    await OrderService.softCancelOrder(order!.id, ctx.userA, 'тест кассы после отмены')

    const row = await db.get<{
      fulfillment_department_id: number | null
      userId: number | null
      is_cancelled: number
    }>('SELECT fulfillment_department_id, userId, is_cancelled FROM orders WHERE id = ?', order!.id)
    expect(Number(row?.is_cancelled)).toBe(1)
    expect(row?.userId == null || Number(row.userId) === 0).toBe(true)
    expect(Number(row?.fulfillment_department_id)).toBe(ctx.deptA)

    const after = await getCashRegisterDay(payDay, ctx.deptA)
    expect(after.cash_in_today).toBeGreaterThanOrEqual(150)
  })
})
