import { getDb } from '../config/database'
import { hasColumn } from './tableSchemaCache'

export function parsePositiveDepartmentId(raw: unknown): number | undefined {
  if (raw == null || raw === '' || raw === 'null' || raw === 'undefined') return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export async function getUserDepartmentId(userId: number): Promise<number | undefined> {
  const hasDept = await hasColumn('users', 'department_id').catch(() => false)
  if (!hasDept) return undefined
  const db = await getDb()
  const row = await db.get<{ department_id: number | null }>(
    'SELECT department_id FROM users WHERE id = ?',
    userId,
  )
  const n = row?.department_id != null ? Number(row.department_id) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Оператор — только своя точка (даже если в query другая).
 * Админ — точка из query или все точки (undefined).
 * Оператор без department_id — пустая выборка (`empty`).
 */
export async function resolveDepartmentScope(opts: {
  user?: { id: number; role?: string } | null
  queryDepartmentId?: unknown
}): Promise<number | undefined | 'empty'> {
  const requested = parsePositiveDepartmentId(opts.queryDepartmentId)
  const isAdmin = opts.user?.role === 'admin'
  if (!opts.user?.id) return requested
  if (isAdmin) return requested
  const own = await getUserDepartmentId(opts.user.id)
  return own ?? 'empty'
}

export function emptyDepartmentSql(): { clause: string; params: number[] } {
  return { clause: ' AND 1=0', params: [] }
}
