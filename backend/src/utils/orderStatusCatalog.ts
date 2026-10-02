import { Database } from 'sqlite'

/** Состояния заказа. Id в базе может быть любым, смысл задаёт code. */
export const ORDER_STATES = [
  { code: 'waiting', name: 'Ожидает', color: '#9e9e9e', sortOrder: 1 },
  { code: 'placed', name: 'Оформлен', color: '#1976d2', sortOrder: 2 },
  { code: 'in_work', name: 'Принят в работу', color: '#5c6bc0', sortOrder: 3 },
  { code: 'done', name: 'Выполнен', color: '#2e7d32', sortOrder: 4 },
  { code: 'at_pickup', name: 'Передан в ПВЗ', color: '#ffa000', sortOrder: 5 },
  { code: 'picked_up', name: 'Получен в ПВЗ', color: '#7b1fa2', sortOrder: 6 },
  { code: 'completed', name: 'Завершён', color: '#1b5e20', sortOrder: 7 },
  { code: 'cancelled', name: 'Отменён', color: '#d32f2f', sortOrder: 99 },
] as const

export type OrderStateCode = (typeof ORDER_STATES)[number]['code']

const POOL_CODES = new Set<OrderStateCode>(['waiting', 'placed'])

export function stateByCode(code: OrderStateCode) {
  return ORDER_STATES.find((state) => state.code === code)!
}

/**
 * Выдан / завершён — только по code/name справочника.
 * Нельзя считать «status = 7» завершённым: после unify на каталоге 0..6
 * AUTOINCREMENT вешает «Отменён» на id 7, и soft-cancel попадал в выручку/выдачу.
 */
export function completedStatusSql(statusColumn = 'status'): string {
  return `(
    ${statusColumn} IN (
      SELECT id FROM order_statuses
      WHERE code = 'completed' OR name = 'Завершён'
    )
  )`
}

/** Мягкая отмена / Отменён — не в выручке и не «выдан». */
export function cancelledStatusSql(statusColumn = 'status'): string {
  return `(
    ${statusColumn} IN (
      SELECT id FROM order_statuses
      WHERE code = 'cancelled' OR name = 'Отменён' OR name = 'Отменен'
    )
  )`
}

export function notCancelledStatusSql(statusColumn = 'status'): string {
  return `NOT ${cancelledStatusSql(statusColumn)}`
}

export async function findOrderStatusId(
  db: Pick<Database, 'get'>,
  code: OrderStateCode,
  fallback: number,
): Promise<number> {
  const state = stateByCode(code)
  try {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses
       WHERE code = ? OR name = ?
       ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, id
       LIMIT 1`,
      code,
      state.name,
      code,
    )
    if (row?.id != null && Number.isFinite(Number(row.id))) return Number(row.id)
  } catch {
    try {
      const row = await db.get<{ id: number }>(
        `SELECT id FROM order_statuses WHERE name = ? LIMIT 1`,
        state.name,
      )
      if (row?.id != null && Number.isFinite(Number(row.id))) return Number(row.id)
    } catch {
      /* справочника ещё нет */
    }
  }
  return fallback
}

export async function isPoolStatusId(db: Pick<Database, 'get'>, statusId: number): Promise<boolean> {
  const id = Number(statusId)
  if (id === 0) return true
  try {
    const row = await db.get<{ code?: string | null; name?: string | null }>(
      `SELECT code, name FROM order_statuses WHERE id = ?`,
      id,
    )
    if (!row) return id === 1
    if (row.code && POOL_CODES.has(row.code as OrderStateCode)) return true
    return row.name === 'Ожидает' || row.name === 'Оформлен'
  } catch {
    return id === 1
  }
}
