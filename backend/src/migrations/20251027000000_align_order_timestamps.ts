import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  // Add legacy camelCase timestamp columns if missing
  try {
    await db.exec(`ALTER TABLE orders ADD COLUMN createdAt TEXT`)
  } catch (e: any) {
    if (!String(e?.message || '').includes('duplicate column name')) throw e
  }

  try {
    await db.exec(`ALTER TABLE orders ADD COLUMN updatedAt TEXT`)
  } catch (e: any) {
    if (!String(e?.message || '').includes('duplicate column name')) throw e
  }

  // Backfill values from snake_case columns when available
  await db.exec(`
    UPDATE orders
    SET createdAt = COALESCE(createdAt, created_at),
        updatedAt = COALESCE(updatedAt, updated_at)
  `)

  // Create triggers to keep both styles in sync on insert/update
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS orders_sync_timestamps_insert
    AFTER INSERT ON orders
    BEGIN
      UPDATE orders
      SET createdAt = COALESCE(NEW.createdAt, NEW.created_at),
          updatedAt = COALESCE(NEW.updatedAt, NEW.updated_at, datetime('now'))
      WHERE id = NEW.id;
    END;
  `)

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS orders_sync_timestamps_update
    AFTER UPDATE ON orders
    BEGIN
      UPDATE orders
      SET createdAt = COALESCE(NEW.createdAt, NEW.created_at),
          updatedAt = COALESCE(NEW.updatedAt, NEW.updated_at, datetime('now'))
      WHERE id = NEW.id;
    END;
  `)
}

export async function down(db: Database): Promise<void> {
  // Best-effort drop triggers; keep columns to avoid data loss
  await db.exec(`DROP TRIGGER IF EXISTS orders_sync_timestamps_insert`)
  await db.exec(`DROP TRIGGER IF EXISTS orders_sync_timestamps_update`)
}


