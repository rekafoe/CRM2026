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

/** SQL-фрагмент: AND (alias.fulfillment_department_id = ?) или IS NULL для unassigned */
export function scopeByFulfillmentDepartment(
  alias: string,
  departmentId: FulfillmentDepartmentScope,
  options?: { columnExists?: boolean },
): { clause: string; params: number[] } {
  if (departmentId === undefined || departmentId === null) {
    return { clause: '', params: [] }
  }
  if (options?.columnExists === false) {
    return { clause: '', params: [] }
  }
  const col = `${alias}.fulfillment_department_id`
  if (departmentId === 'unassigned') {
    return { clause: ` AND ${col} IS NULL`, params: [] }
  }
  return { clause: ` AND ${col} = ?`, params: [departmentId] }
}

/** Условие «заказ в выручке» (оплачен или завершён, не отменён). */
export function revenueOrdersCondition(alias: string): string {
  const p = alias ? `${alias}.` : ''
  return `${p}status != 0 AND (${p}status = 7 OR ${p}prepaymentStatus IN ('paid', 'successful'))`
}
