import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  const colName = columnDefinition.split(/\s+/)[0]
  const columns = await db.all(`PRAGMA table_info('${table}')`)
  const hasCol = (columns as Array<{ name: string }>).some((c) => c.name === colName)
  if (hasCol) return
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`)
}

/**
 * Multi-warehouse: warehouses per department, material_stock balances,
 * material_moves.warehouse_id, printers.department_id.
 * Existing materials.quantity copied into default warehouse stock.
 */
export async function up(db: Database): Promise<void> {
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
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_warehouses_department ON warehouses (department_id)`)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS material_stock (
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (material_id, warehouse_id)
    )
  `)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_material_stock_warehouse ON material_stock (warehouse_id)`)

  await addColumnIfMissing(db, 'material_moves', 'warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL')
  await addColumnIfMissing(db, 'printers', 'department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL')

  // Default warehouse for primary pickup point (or first department)
  let dept = await db.get<{ id: number; name: string }>(
    `SELECT id, name FROM departments WHERE code = 'pickup-gikalo' LIMIT 1`
  )
  if (!dept) {
    dept = await db.get<{ id: number; name: string }>(
      `SELECT id, name FROM departments ORDER BY sort_order ASC, id ASC LIMIT 1`
    )
  }
  if (!dept) {
    const ins = await db.run(
      `INSERT INTO departments (name, description, sort_order, code, address, is_pickup_point, is_active, created_at)
       VALUES (?, ?, 0, ?, ?, 1, 1, datetime('now'))`,
      ['Проспект Дзержинского 3б', 'Основная точка', 'pickup-gikalo', 'г. Минск, пр. Дзержинского 3б']
    )
    dept = { id: Number(ins.lastID), name: 'Проспект Дзержинского 3б' }
  }

  let warehouse = await db.get<{ id: number }>(
    `SELECT id FROM warehouses WHERE department_id = ? AND is_default = 1 LIMIT 1`,
    [dept.id]
  )
  if (!warehouse) {
    const w = await db.run(
      `INSERT INTO warehouses (department_id, name, is_default, created_at)
       VALUES (?, ?, 1, datetime('now'))`,
      [dept.id, `Склад: ${dept.name}`]
    )
    warehouse = { id: Number(w.lastID) }
  }

  // Copy materials.quantity → material_stock for default warehouse (once)
  const materialsRaw = await db.all<{ id: number; quantity: number }>(
    `SELECT id, COALESCE(quantity, 0) as quantity FROM materials`
  )
  const materials = Array.isArray(materialsRaw) ? materialsRaw : []
  for (const m of materials) {
    const existing = await db.get(
      `SELECT 1 FROM material_stock WHERE material_id = ? AND warehouse_id = ?`,
      [m.id, warehouse.id]
    )
    if (!existing) {
      await db.run(
        `INSERT INTO material_stock (material_id, warehouse_id, quantity) VALUES (?, ?, ?)`,
        [m.id, warehouse.id, Number(m.quantity) || 0]
      )
    }
  }

  // Tag existing printers with primary department if unset
  await db.run(
    `UPDATE printers SET department_id = ? WHERE department_id IS NULL`,
    [dept.id]
  ).catch(() => {})
}

export async function down(_db: Database): Promise<void> {
  // keep tables
}
