import { getDb } from '../config/database'
import { finalizeMiniappDraft } from '../services/miniappCheckoutService'
import {
  MINIAPP_CHECKOUT_STATE_DRAFT,
  MINIAPP_CHECKOUT_STATE_FINALIZED,
  claimMiniappDraftFinalizeInTx,
  isClaimableMiniappCheckoutState,
} from '../utils/miniappCheckoutState'

async function ensureOrdersColumn(name: string, ddl: string): Promise<void> {
  const db = await getDb()
  const columns = (await db.all(`PRAGMA table_info(orders)`)) as Array<{ name: string }>
  if ((columns || []).some((c) => c.name === name)) return
  await db.exec(ddl)
}

describe('miniapp draft finalize claim', () => {
  beforeAll(async () => {
    await ensureOrdersColumn('telegram_chat_id', 'ALTER TABLE orders ADD COLUMN telegram_chat_id TEXT')
    await ensureOrdersColumn('miniapp_checkout_state', 'ALTER TABLE orders ADD COLUMN miniapp_checkout_state TEXT')
    await ensureOrdersColumn(
      'miniapp_design_help_requested',
      'ALTER TABLE orders ADD COLUMN miniapp_design_help_requested INTEGER DEFAULT 0',
    )
  })

  it('treats null/empty/draft as claimable and finalized as not', () => {
    expect(isClaimableMiniappCheckoutState(null)).toBe(true)
    expect(isClaimableMiniappCheckoutState('')).toBe(true)
    expect(isClaimableMiniappCheckoutState('  ')).toBe(true)
    expect(isClaimableMiniappCheckoutState(MINIAPP_CHECKOUT_STATE_DRAFT)).toBe(true)
    expect(isClaimableMiniappCheckoutState(MINIAPP_CHECKOUT_STATE_FINALIZED)).toBe(false)
    expect(isClaimableMiniappCheckoutState('paid')).toBe(false)
  })

  it('allows only one atomic claim for the same draft order', async () => {
    const db = await getDb()
    const chatId = `tg-claim-${Date.now()}`
    const orderNumber = `MAP-CLAIM-${Date.now()}`
    const inserted = await db.run(
      `INSERT INTO orders (number, status, createdAt, created_at, customerName, telegram_chat_id, miniapp_checkout_state)
       VALUES (?, 1, datetime('now'), datetime('now'), 'claim test', ?, ?)`,
      orderNumber,
      chatId,
      MINIAPP_CHECKOUT_STATE_DRAFT,
    )
    const orderId = inserted.lastID!
    expect(orderId).toBeTruthy()

    const first = await claimMiniappDraftFinalizeInTx(db, orderId, chatId)
    const second = await claimMiniappDraftFinalizeInTx(db, orderId, chatId)
    expect(first).toBe(true)
    expect(second).toBe(false)

    const row = await db.get<{ miniapp_checkout_state: string }>(
      'SELECT miniapp_checkout_state FROM orders WHERE id = ?',
      orderId,
    )
    expect(row?.miniapp_checkout_state).toBe(MINIAPP_CHECKOUT_STATE_FINALIZED)

    await db.run('DELETE FROM orders WHERE id = ?', orderId)
  })

  it('second finalize does not deduct stock again', async () => {
    const db = await getDb()
    const stamp = Date.now()
    const chatId = `tg-race-${stamp}`
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Miniapp race paper ${stamp}`,
      'лист',
      100,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         telegram_chat_id, miniapp_checkout_state, miniapp_design_help_requested
       ) VALUES (?, 1, datetime('now'), datetime('now'), 'race test', ?, ?, 1)`,
      `MAP-RACE-${stamp}`,
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

    await finalizeMiniappDraft(chatId, orderId)
    await expect(finalizeMiniappDraft(chatId, orderId)).rejects.toMatchObject({
      code: 'MINIAPP_ORDER_NOT_DRAFT',
    })

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(80) // 100 - (10 * 2) once

    const movesRaw = await db.all(
      'SELECT delta FROM material_moves WHERE order_id = ? AND material_id = ?',
      orderId,
      materialId,
    )
    const moves = (Array.isArray(movesRaw) ? movesRaw : movesRaw ? [movesRaw] : []) as Array<{ delta: number }>
    const totalDelta = moves.reduce((sum: number, row) => sum + Number(row.delta || 0), 0)
    expect(totalDelta).toBe(-20)

    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })

  it('parallel finalizeMiniappDraft deducts stock only once', async () => {
    const db = await getDb()
    const stamp = Date.now() + 1
    const chatId = `tg-par-${stamp}`
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      `Miniapp parallel paper ${stamp}`,
      'лист',
      100,
      0,
    )
    const materialId = material.lastID!
    const order = await db.run(
      `INSERT INTO orders (
         number, status, createdAt, created_at, customerName,
         telegram_chat_id, miniapp_checkout_state, miniapp_design_help_requested
       ) VALUES (?, 1, datetime('now'), datetime('now'), 'parallel test', ?, ?, 1)`,
      `MAP-PAR-${stamp}`,
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

    const results = await Promise.allSettled([
      finalizeMiniappDraft(chatId, orderId),
      finalizeMiniappDraft(chatId, orderId),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason as { code?: string }
    expect(String(rejectedReason?.code || '')).toBe('MINIAPP_ORDER_NOT_DRAFT')

    const stock = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', materialId)
    expect(Number(stock?.quantity)).toBe(80)

    await db.run('DELETE FROM material_moves WHERE order_id = ?', orderId)
    await db.run('DELETE FROM items WHERE orderId = ?', orderId)
    await db.run('DELETE FROM orders WHERE id = ?', orderId)
    await db.run('DELETE FROM materials WHERE id = ?', materialId)
  })
})
