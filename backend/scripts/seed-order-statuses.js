/*
  Upsert canonical order statuses (IDs 0..6) with names/colors/sort_order.
  Usage: node scripts/seed-order-statuses.js [absolute_db_path]
*/

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const argPath = process.argv[2]
const dbPath = argPath || path.join(__dirname, '..', 'data.db')
const db = new sqlite3.Database(dbPath)

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this)
  }))
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
    if (err) reject(err); else resolve(rows)
  }))
}

;(async () => {
  try {
    await run(`CREATE TABLE IF NOT EXISTS order_statuses (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`)

    const statuses = [
      { id: 0, name: 'Ожидает', color: '#9e9e9e', sort_order: 0 },
      { id: 1, name: 'Оформлен', color: '#607d8b', sort_order: 1 },
      { id: 2, name: 'Принят в работу', color: '#1976d2', sort_order: 2 },
      { id: 3, name: 'Выполнен', color: '#43a047', sort_order: 3 },
      { id: 4, name: 'Передан в ПВЗ', color: '#ffa000', sort_order: 4 },
      { id: 5, name: 'Получен в ПВЗ', color: '#8d6e63', sort_order: 5 },
      { id: 6, name: 'Завершён', color: '#2e7d32', sort_order: 6 },
    ]

    await run('BEGIN')
    for (const s of statuses) {
      await run(
        `INSERT INTO order_statuses (id, name, color, sort_order)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, sort_order=excluded.sort_order`,
        [s.id, s.name, s.color, s.sort_order]
      )
    }
    await run('COMMIT')

    const rows = await all('SELECT id, name, color, sort_order FROM order_statuses ORDER BY sort_order')
    console.log('✅ Seeded order_statuses into', dbPath)
    console.table(rows)
  } catch (e) {
    try { await run('ROLLBACK') } catch {}
    console.error('❌ Failed to seed order_statuses', e)
    process.exit(1)
  } finally {
    db.close()
  }
})()


