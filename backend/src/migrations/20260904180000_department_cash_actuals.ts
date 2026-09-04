import { Database } from 'sqlite'

/** Факт кассы с терминала — отдельно на каждую точку (не общий daily_reports). */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS department_cash_actuals (
      report_date TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      cash_actual REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by INTEGER,
      PRIMARY KEY (report_date, department_id)
    )
  `)
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_department_cash_actuals_dept
     ON department_cash_actuals (department_id, report_date)`,
  )
}
