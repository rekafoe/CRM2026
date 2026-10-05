import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { loadPrinterExpectedClicksForDay } from '../services/loadDailyOrdersForCashReport'

describe('loadPrinterExpectedClicksForDay', () => {
  beforeAll(async () => {
    await initDB()
  })

  it('не считает клики заказов в статусе 0', async () => {
    const db = await getDb()
    const day = '2099-04-17'
    const stamp = Date.now()
    const printerCode = `exp-${stamp}`

    await db.run(
      `INSERT INTO printers (code, name, is_active) VALUES (?, 'Ожидаемые клики', 1)`,
      printerCode,
    )
    const printer = await db.get<{ id: number }>('SELECT id FROM printers WHERE code = ?', printerCode)
    if (!printer?.id) throw new Error('принтер не создан')

    const placed = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name = 'Оформлен' OR code = 'placed' ORDER BY id LIMIT 1`,
    )
    const placedStatus = placed?.id ?? 6

    async function insertOrder(number: string, status: number, clicks: number) {
      await db.run(
        `INSERT INTO orders (number, status, createdAt, created_at, customerName)
         VALUES (?, ?, ?, ?, 'expected clicks')`,
        number,
        status,
        `${day} 10:00:00`,
        `${day} 10:00:00`,
      )
      const order = await db.get<{ id: number }>('SELECT id FROM orders WHERE number = ?', number)
      if (!order?.id) throw new Error('заказ не создан')
      await db.run(
        `INSERT INTO items (orderId, type, params, price, quantity, printerId, clicks)
         VALUES (?, 'print', '{}', 10, 1, ?, ?)`,
        order.id,
        printer.id,
        clicks,
      )
    }

    const waitingRow = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE code = 'waiting' OR name = 'Ожидает' ORDER BY id LIMIT 1`,
    )
    if (waitingRow?.id == null) throw new Error('статус «Ожидает» не найден')
    if (Number(waitingRow.id) === Number(placedStatus)) {
      throw new Error('статус «Ожидает» совпал с «Оформлен»')
    }

    try {
      await insertOrder(`EXP-WAIT-${stamp}`, 0, 40)
      await insertOrder(`EXP-NAMED-${stamp}`, waitingRow.id, 25)
      await insertOrder(`EXP-OK-${stamp}`, placedStatus, 15)

      const clicks = await loadPrinterExpectedClicksForDay(day)
      expect(clicks[printer.id]).toBe(15)
    } finally {
      await db.run('DELETE FROM items WHERE printerId = ?', printer.id)
      await db.run(
        `DELETE FROM orders WHERE number IN (?, ?, ?)`,
        `EXP-WAIT-${stamp}`,
        `EXP-NAMED-${stamp}`,
        `EXP-OK-${stamp}`,
      )
      await db.run('DELETE FROM printers WHERE id = ?', printer.id)
    }
  })
})
