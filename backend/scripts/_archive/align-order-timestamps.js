/*
  Align orders timestamp columns to support both camelCase and snake_case.
  - Adds createdAt/updatedAt if missing
  - Backfills values from created_at/updated_at
  - Adds triggers to keep columns in sync on insert/update
*/

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(__dirname, '..', 'data.db')
const db = new sqlite3.Database(dbPath)

function exec(sql) {
  return new Promise((resolve, reject) => db.exec(sql, err => (err ? reject(err) : resolve())))
}

;(async () => {
  try {
    // Add columns if not present
    try { await exec("ALTER TABLE orders ADD COLUMN createdAt TEXT") } catch (_) {}
    try { await exec("ALTER TABLE orders ADD COLUMN updatedAt TEXT") } catch (_) {}

    // Backfill from snake_case
    await exec(
      "UPDATE orders SET createdAt = COALESCE(createdAt, created_at), updatedAt = COALESCE(updatedAt, updated_at, datetime('now'))"
    )

    // Triggers to keep both styles in sync
    await exec(`
      CREATE TRIGGER IF NOT EXISTS orders_sync_timestamps_insert
      AFTER INSERT ON orders
      BEGIN
        UPDATE orders
        SET createdAt = COALESCE(NEW.createdAt, NEW.created_at),
            updatedAt = COALESCE(NEW.updatedAt, NEW.updated_at, datetime('now'))
        WHERE id = NEW.id;
      END;
    `)

    await exec(`
      CREATE TRIGGER IF NOT EXISTS orders_sync_timestamps_update
      AFTER UPDATE ON orders
      BEGIN
        UPDATE orders
        SET createdAt = COALESCE(NEW.createdAt, NEW.created_at),
            updatedAt = COALESCE(NEW.updatedAt, NEW.updated_at, datetime('now'))
        WHERE id = NEW.id;
      END;
    `)

    console.log('✅ Aligned orders timestamps (createdAt/updatedAt)')
  } catch (e) {
    console.error('❌ Align failed', e)
    process.exit(1)
  } finally {
    db.close()
  }
})()


