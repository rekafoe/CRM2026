import { hasColumn } from './tableSchemaCache'

let cachedHasFulfillmentCol: boolean | null = null

export async function hasFulfillmentDepartmentColumn(): Promise<boolean> {
  if (cachedHasFulfillmentCol !== null) return cachedHasFulfillmentCol
  try {
    cachedHasFulfillmentCol = await hasColumn('orders', 'fulfillment_department_id')
  } catch {
    cachedHasFulfillmentCol = false
  }
  return cachedHasFulfillmentCol
}

export type FulfillmentDepartmentScope = number | 'unassigned' | null | undefined

export function parseFulfillmentDepartmentId(raw: unknown): FulfillmentDepartmentScope {
  if (raw === 'unassigned' || raw === 'null') return 'unassigned'
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Эффективная точка заказа:
 * 1) явный fulfillment_department_id (самовывоз с сайта / ручной выбор)
 * 2) иначе департамент создателя (CRM-оператор на точке)
 */
export function effectiveLocationDepartmentExpr(
  alias: string,
  options?: { columnExists?: boolean },
): string {
  const p = alias ? `${alias}.` : ''
  if (options?.columnExists === false) {
    return `(SELECT u.department_id FROM users u WHERE u.id = ${p}userId)`
  }
  return `COALESCE(
    ${p}fulfillment_department_id,
    (SELECT u.department_id FROM users u WHERE u.id = ${p}userId)
  )`
}

/** SQL-фрагмент фильтра по эффективной точке */
export function scopeByFulfillmentDepartment(
  alias: string,
  departmentId: FulfillmentDepartmentScope,
  options?: { columnExists?: boolean },
): { clause: string; params: number[] } {
  if (departmentId === undefined || departmentId === null) {
    return { clause: '', params: [] }
  }
  const expr = effectiveLocationDepartmentExpr(alias, options)
  if (departmentId === 'unassigned') {
    return { clause: ` AND (${expr}) IS NULL`, params: [] }
  }
  return { clause: ` AND (${expr}) = ?`, params: [departmentId] }
}

/**
 * «Ожидает» и старое «Новый». SQLite не меняет регистр кириллицы, поэтому перечисляем варианты.
 */
export function waitingStatusNameMatchSql(nameExpr = 'name'): string {
  return `(
    ${nameExpr} LIKE '%жида%' OR ${nameExpr} LIKE '%Жида%' OR ${nameExpr} LIKE '%ЖИДА%'
    OR ${nameExpr} IN ('Новый', 'новый', 'НОВЫЙ', 'New', 'new', 'Pending', 'pending')
  )`
}

export function waitingStatusIdsSubquery(): string {
  return `SELECT id FROM order_statuses WHERE ${waitingStatusNameMatchSql('name')}`
}

/** Пул 0/1 и любой статус с именем «Ожидает» — не выручка, даже с предоплатой paid. */
export function isWaitingStatusSql(statusColumn = 'status'): string {
  return `(
    CAST(COALESCE(${statusColumn}, -1) AS INTEGER) IN (0, 1)
    OR ${statusColumn} IN (${waitingStatusIdsSubquery()})
  )`
}

export function notWaitingStatusSql(statusColumn = 'status'): string {
  return `NOT ${isWaitingStatusSql(statusColumn)}`
}

/**
 * Заказ в выручке: оплачен или завершён, и это уже не «Ожидает».
 * Статусы 0 и 1 в CRM — пул «Ожидает». Предоплата на них выручку не включает.
 */
export function revenueOrdersCondition(alias: string): string {
  const p = alias ? `${alias}.` : ''
  return `${notWaitingStatusSql(`${p}status`)} AND (${p}status = 7 OR ${p}prepaymentStatus IN ('paid', 'successful'))`
}

/** status = 0 — просчёт, его суммы не входят в денежные итоги. NULL не отсекаем. */
export function notEstimateStatusSql(column = 'status'): string {
  return `COALESCE(${column}, -1) != 0`
}
