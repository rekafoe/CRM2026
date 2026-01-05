/*
  Add is_cancelled flag to orders and a trigger that sets it to 1 when
  an order is moved to pool (status=0) for online sources (website/telegram).
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
    // Add column if missing
    try { await exec("ALTER TABLE orders ADD COLUMN is_cancelled INTEGER DEFAULT 0") } catch (_) {}

    // Normalize nulls to 0
    await exec("UPDATE orders SET is_cancelled = COALESCE(is_cancelled, 0)")

    // Trigger: when status becomes 0 for online/telegram -> mark cancelled
    await exec(`
      CREATE TRIGGER IF NOT EXISTS orders_online_soft_cancel
      AFTER UPDATE OF status ON orders
      FOR EACH ROW
      WHEN NEW.status = 0 AND (NEW.source = 'website' OR NEW.source = 'telegram')
      BEGIN
        UPDATE orders SET is_cancelled = 1 WHERE id = NEW.id;
      END;
    `)

    console.log('✅ orders.is_cancelled added and trigger installed')
  } catch (e) {
    console.error('❌ Failed to install cancel flag', e)
    process.exit(1)
  } finally {
    db.close()
  }
})()


