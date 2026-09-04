import { getDb } from '../config/database'

export async function getDepartmentCashActual(
  reportDate: string,
  departmentId: number,
): Promise<number | null> {
  const d = reportDate.slice(0, 10)
  const db = await getDb()
  const row = await db.get<{ cash_actual: number }>(
    `SELECT cash_actual FROM department_cash_actuals
      WHERE report_date = ? AND department_id = ?`,
    d,
    departmentId,
  )
  if (row == null || row.cash_actual == null) return null
  const n = Number(row.cash_actual)
  return Number.isFinite(n) ? n : null
}

export async function upsertDepartmentCashActual(
  reportDate: string,
  departmentId: number,
  cashActual: number,
  updatedBy?: number,
): Promise<number> {
  const d = reportDate.slice(0, 10)
  const amount = Math.round(Number(cashActual) * 100) / 100
  const db = await getDb()
  await db.run(
    `INSERT INTO department_cash_actuals (report_date, department_id, cash_actual, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(report_date, department_id) DO UPDATE SET
       cash_actual = excluded.cash_actual,
       updated_at = datetime('now'),
       updated_by = excluded.updated_by`,
    d,
    departmentId,
    amount,
    updatedBy ?? null,
  )
  return amount
}
