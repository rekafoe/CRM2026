import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'

type OrderRow = {
  id: number
  number: string | null
  source: string | null
  status: number | string | null
  userId: number | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  customer_id: number | null
  created_date: string | null
  is_cancelled?: number | null
  responsible_user_id?: number | null
}

type Args = {
  target: string
  apply: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const target = args.find((arg) => !arg.startsWith('--')) ?? '4767'
  return { target: target.trim(), apply }
}

function resolveDatabasePath(): string {
  const raw = (process.env.DB_FILE || '').trim()
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('DB_FILE is required in production to avoid touching the wrong SQLite file')
  }
  return path.resolve(process.cwd(), 'data.db')
}

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    [table]
  )
  return Boolean(row)
}

async function tableColumns(db: Database, table: string): Promise<Set<string>> {
  const rows = await db.all<{ name: string }[]>(`PRAGMA table_info(${table})`)
  return new Set((rows || []).map((row) => row.name))
}

function candidateNumbers(target: string): string[] {
  const values = new Set<string>([target])
  const numeric = target.match(/\d+/)?.[0]
  if (numeric) {
    values.add(`ORD-${numeric}`)
    values.add(`site-ord-${numeric}`)
  }
  return [...values]
}

function coalesceExpr(columns: Set<string>, names: string[], fallback: string): string {
  const existing = names.filter((name) => columns.has(name))
  return existing.length > 0 ? `COALESCE(${existing.map((name) => `o.${name}`).join(', ')})` : fallback
}

async function findOrder(db: Database, target: string): Promise<OrderRow | null> {
  const columns = await tableColumns(db, 'orders')
  const numeric = /^\d+$/.test(target) ? Number(target) : null
  const createdExpr = coalesceExpr(columns, ['createdAt', 'created_at'], 'NULL')
  const isCancelledSelect = columns.has('is_cancelled') ? 'o.is_cancelled' : 'NULL as is_cancelled'
  const responsibleSelect = columns.has('responsible_user_id') ? 'o.responsible_user_id' : 'NULL as responsible_user_id'
  const customerIdSelect = columns.has('customer_id') ? 'o.customer_id' : 'NULL as customer_id'

  const select = `
    SELECT
      o.id,
      o.number,
      o.source,
      o.status,
      o.userId,
      o.customerName,
      o.customerPhone,
      o.customerEmail,
      ${customerIdSelect},
      ${createdExpr} as created_date,
      ${isCancelledSelect},
      ${responsibleSelect}
    FROM orders o
  `

  if (numeric != null) {
    const byId = await db.get<OrderRow>(`${select} WHERE o.id = ?`, [numeric])
    if (byId) return byId
  }

  const numbers = candidateNumbers(target)
  const placeholders = numbers.map(() => '?').join(', ')
  return await db.get<OrderRow>(
    `${select} WHERE o.number IN (${placeholders}) ORDER BY o.id DESC LIMIT 1`,
    numbers
  ) ?? null
}

async function printDeletionEvents(db: Database, target: string): Promise<void> {
  if (!(await tableExists(db, 'order_cancellation_events'))) return
  const numeric = target.match(/\d+/)?.[0]
  const numbers = candidateNumbers(target)
  const placeholders = numbers.map(() => '?').join(', ')
  const params: Array<string | number> = [...numbers]
  let where = `order_number IN (${placeholders})`
  if (numeric) {
    where = `(order_id = ? OR ${where})`
    params.unshift(Number(numeric))
  }

  const events = await db.all(
    `SELECT * FROM order_cancellation_events WHERE ${where} ORDER BY created_at DESC LIMIT 10`,
    params
  )
  console.log('Журнал отмен/удалений:', JSON.stringify(events, null, 2))
}

async function countRows(db: Database, table: string, where: string, params: unknown[]): Promise<number | null> {
  if (!(await tableExists(db, table))) return null
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table} WHERE ${where}`, params)
  return Number(row?.count ?? 0)
}

async function restoreOrder(db: Database, order: OrderRow): Promise<void> {
  const columns = await tableColumns(db, 'orders')
  const updates = ['status = 1', 'userId = NULL']
  if (columns.has('is_cancelled')) updates.push('is_cancelled = 0')
  if (columns.has('responsible_user_id')) updates.push('responsible_user_id = NULL')
  if (columns.has('updatedAt')) updates.push('updatedAt = datetime("now")')
  if (columns.has('updated_at')) updates.push('updated_at = datetime("now")')

  await db.exec('BEGIN')
  try {
    await db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, [order.id])

    if (await tableExists(db, 'user_order_page_orders')) {
      await db.run(
        `DELETE FROM user_order_page_orders
         WHERE order_id = ?
           AND order_type IN ('website', 'manual', 'crm')
           AND COALESCE(status, '') != 'completed'`,
        [order.id]
      )
    }

    if (await tableExists(db, 'material_reservations')) {
      await db.run('DELETE FROM material_reservations WHERE order_id = ?', [order.id])
    }

    if (await tableExists(db, 'order_activity_events')) {
      await db.run(
        `INSERT INTO order_activity_events (order_id, event_type, message, created_at)
         VALUES (?, 'restore_to_pool', 'Заказ восстановлен и возвращён в пул скриптом', datetime('now'))`,
        [order.id]
      ).catch(() => undefined)
    }

    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

async function main() {
  const { target, apply } = parseArgs()
  const dbFile = resolveDatabasePath()
  if (!fs.existsSync(dbFile)) {
    throw new Error(`SQLite file not found: ${dbFile}`)
  }

  const db = await open({ filename: dbFile, driver: sqlite3.Database })
  await db.exec('PRAGMA busy_timeout = 30000')

  try {
    const order = await findOrder(db, target)
    if (!order) {
      console.log(`Заказ ${target} не найден в orders. Возможно, он удалён физически.`)
      await printDeletionEvents(db, target)
      console.log('Автоматически восстановить клиента/позиции без backup нельзя: delete-журнал не хранит полный снимок заказа.')
      process.exitCode = 2
      return
    }

    const itemsCount = await countRows(db, 'items', 'orderId = ?', [order.id])
    const filesCount = await countRows(db, 'order_files', 'orderId = ?', [order.id])
    const activeAssignments = await countRows(
      db,
      'user_order_page_orders',
      "order_id = ? AND order_type IN ('website', 'manual', 'crm') AND COALESCE(status, '') != 'completed'",
      [order.id]
    )

    console.log('Найден заказ:', JSON.stringify({
      ...order,
      itemsCount,
      filesCount,
      activeAssignments,
    }, null, 2))

    await printDeletionEvents(db, target)

    if (!apply) {
      console.log('Dry-run: изменений нет. Для восстановления запустите с --apply')
      return
    }

    await restoreOrder(db, order)
    const restored = await findOrder(db, String(order.id))
    console.log('Готово. Заказ восстановлен в пул:', JSON.stringify(restored, null, 2))
  } finally {
    await db.close()
  }
}

void main().catch((error) => {
  console.error('Ошибка восстановления заказа:', error)
  process.exit(1)
})
