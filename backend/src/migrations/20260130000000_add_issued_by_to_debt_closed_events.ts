import { Database } from 'sqlite'

/**
 * Добавляем issued_by_user_id в debt_closed_events.
 * Кто выдал заказ — тому в отчёте учитывается «долги закрыты», без переноса заказа (сдельная остаётся у создателя).
 */
export async function up(db: Database): Promise<void> {
  const cols = (await db.all('PRAGMA table_info(debt_closed_events)')) as Array<{ name: string }>
  const hasIssuedBy = cols.some((c) => c.name === 'issued_by_user_id')
  if (hasIssuedBy) return
  await db.exec(`
    ALTER TABLE debt_closed_events ADD COLUMN issued_by_user_id INTEGER REFERENCES users(id)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_debt_closed_events_issued_by
    ON debt_closed_events(issued_by_user_id)
  `)
}
