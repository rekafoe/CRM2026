import { Database } from 'sqlite'
import { SITE_PICKUP_POINTS, type SitePickupPoint } from '../config/sitePickupPoints'

async function findDepartmentIdByCodes(db: Database, codes: string[]): Promise<number | undefined> {
  const unique = codes.map((code) => code.trim()).filter(Boolean)
  if (unique.length === 0) return undefined
  const placeholders = unique.map(() => '?').join(', ')
  const row = await db.get<{ id: number }>(
    `SELECT id FROM departments
     WHERE code IN (${placeholders})
     ORDER BY CASE code WHEN ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [...unique, unique[0]]
  )
  return row?.id
}

async function ensurePickupDepartment(db: Database, point: SitePickupPoint): Promise<number> {
  const lookup = [point.code, ...point.aliases]
  const canonical = await db.get<{ id: number }>(
    `SELECT id FROM departments WHERE code = ? LIMIT 1`,
    [point.code]
  )
  let id = canonical?.id ?? (await findDepartmentIdByCodes(db, lookup))

  if (id) {
    await db.run(
      `UPDATE departments
       SET name = ?,
           description = COALESCE(NULLIF(description, ''), ?),
           address = ?,
           code = ?,
           is_pickup_point = 1,
           is_active = 1,
           sort_order = ?
       WHERE id = ?`,
      [point.name, point.description, point.address, point.code, point.sortOrder, id]
    )
  } else {
    const inserted = await db.run(
      `INSERT INTO departments (name, description, sort_order, code, address, is_pickup_point, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'))`,
      [point.name, point.description, point.sortOrder, point.code, point.address]
    )
    id = Number(inserted.lastID)
  }

  const warehouse = await db.get<{ id: number }>(
    `SELECT id FROM warehouses WHERE department_id = ? LIMIT 1`,
    [id]
  )
  if (!warehouse) {
    await db.run(
      `INSERT INTO warehouses (department_id, name, is_default, created_at)
       VALUES (?, ?, 1, datetime('now'))`,
      [id, `Склад: ${point.name}`]
    )
  }

  return id
}

async function backfillPickupOrders(db: Database, point: SitePickupPoint, departmentId: number): Promise<void> {
  const codes = [point.code, ...point.aliases]
  const placeholders = codes.map(() => '?').join(', ')
  await db.run(
    `UPDATE orders
     SET fulfillment_department_id = ?
     WHERE fulfillment_department_id IS NULL
       AND delivery_json IS NOT NULL
       AND json_extract(delivery_json, '$.kind') = 'pickup'
       AND json_extract(delivery_json, '$.providerId') IN (${placeholders})`,
    [departmentId, ...codes]
  )

  for (const alias of point.aliases) {
    await db.run(
      `UPDATE orders
       SET delivery_json = json_set(delivery_json, '$.providerId', ?)
       WHERE delivery_json IS NOT NULL
         AND json_extract(delivery_json, '$.kind') = 'pickup'
         AND json_extract(delivery_json, '$.providerId') = ?`,
      [point.code, alias]
    )
  }
}

/**
 * Сайт: pickup-dzerzhinskogo-3b (бывший pickup-gikalo) и pickup-dzerzhinskogo-104.
 */
export async function up(db: Database): Promise<void> {
  const hasWarehouses = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'warehouses' LIMIT 1`
  )
  if (!hasWarehouses) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(department_id, name)
      )
    `)
  }

  for (const point of SITE_PICKUP_POINTS) {
    const departmentId = await ensurePickupDepartment(db, point)
    await backfillPickupOrders(db, point, departmentId)
  }
}

export async function down(_db: Database): Promise<void> {
  // Данные точек не откатываем
}
