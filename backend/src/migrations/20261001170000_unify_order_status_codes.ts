import { Database } from 'sqlite'
import { ORDER_STATES } from '../utils/orderStatusCatalog'

/**
 * Одна строка справочника = одно состояние заказа (code).
 * Id существующих строк не меняем и заказы с уже валидным status не переносим:
 * выдача и касса завязаны на текущие номера.
 * Заказ со status = 7 без строки справочника вешаем на «Завершён».
 * Пустой id 0, если «Ожидает» ещё нет, становится этой строкой — номер заказа тот же.
 */
async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<{ name: string }[]>(`PRAGMA table_info(${table})`)
  return rows.some((row) => row.name === column)
}

async function ensureCodeColumn(db: Database): Promise<void> {
  if (await columnExists(db, 'order_statuses', 'code')) return
  await db.exec(`ALTER TABLE order_statuses ADD COLUMN code TEXT`)
}

async function ensureState(
  db: Database,
  state: (typeof ORDER_STATES)[number],
): Promise<number | null> {
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM order_statuses WHERE name = ? OR code = ? ORDER BY id LIMIT 1`,
    state.name,
    state.code,
  )
  if (existing?.id != null) {
    await db.run(
      `UPDATE order_statuses SET code = ? WHERE id = ? AND (code IS NULL OR code = '')`,
      state.code,
      existing.id,
    )
    return Number(existing.id)
  }

  if (state.code === 'waiting') {
    const id0 = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE id = 0`)
    if (!id0) {
      try {
        await db.run(
          `INSERT INTO order_statuses (id, name, color, sort_order, code) VALUES (0, ?, ?, ?, ?)`,
          state.name,
          state.color,
          state.sortOrder,
          state.code,
        )
        return 0
      } catch {
        /* AUTOINCREMENT может не принять 0 — вставим обычной строкой */
      }
    }
  }

  const inserted = await db.run(
    `INSERT INTO order_statuses (name, color, sort_order, code) VALUES (?, ?, ?, ?)`,
    state.name,
    state.color,
    state.sortOrder,
    state.code,
  )
  return inserted.lastID != null ? Number(inserted.lastID) : null
}

export async function up(db: Database): Promise<void> {
  const table = await db.get(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'order_statuses'`,
  )
  if (!table) return

  await ensureCodeColumn(db)

  const statusSevenBefore = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE id = 7`)
  let completedId: number | null = null
  for (const state of ORDER_STATES) {
    const id = await ensureState(db, state)
    if (state.code === 'completed') completedId = id
  }

  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_order_statuses_code ON order_statuses(code) WHERE code IS NOT NULL AND code != ''`,
  )

  const orders = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'orders'`)
  if (!orders || completedId == null) return

  if (!statusSevenBefore && completedId !== 7) {
    await db.run(`UPDATE orders SET status = ? WHERE status = 7`, completedId)
  }
}

export async function down(_db: Database): Promise<void> {
  // Коды состояний не снимаем: на них смотрит выдача и отчёты.
}
