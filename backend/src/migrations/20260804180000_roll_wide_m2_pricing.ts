import { Database } from 'sqlite'

type TableInfoRow = { name: string }

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  )
  return !!row
}

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.all<TableInfoRow[]>(`PRAGMA table_info('${table}')`)
  return rows.some((r) => r.name === column)
}

async function ensurePrintPricesM2Kind(db: Database): Promise<void> {
  if (!(await columnExists(db, 'print_prices', 'm2_pricing_kind'))) {
    await db.exec(
      `ALTER TABLE print_prices ADD COLUMN m2_pricing_kind TEXT CHECK (m2_pricing_kind IN ('uv_flatbed','roll_wide'))`,
    )
  }

  await db.run(
    `UPDATE print_prices
     SET m2_pricing_kind = CASE
       WHEN counter_unit = 'm2' AND LOWER(COALESCE(technology_code, '')) = 'uv' THEN 'uv_flatbed'
       WHEN counter_unit = 'm2' THEN 'roll_wide'
       ELSE NULL
     END
     WHERE m2_pricing_kind IS NULL`,
  )
}

async function ensureRollM2TiersTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS print_price_roll_m2_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_price_id INTEGER NOT NULL,
      min_m2 REAL NOT NULL DEFAULT 0,
      max_m2 REAL,
      price_per_m2 REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(print_price_id) REFERENCES print_prices(id) ON DELETE CASCADE,
      UNIQUE(print_price_id, min_m2)
    )
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_print_price_roll_m2_tiers_print_price_id
    ON print_price_roll_m2_tiers(print_price_id)
  `)
}

async function ensurePrintTechnologiesSupportsBw(db: Database): Promise<void> {
  if (!(await tableExists(db, 'print_technologies'))) return
  if (!(await columnExists(db, 'print_technologies', 'supports_bw'))) {
    await db.exec(`ALTER TABLE print_technologies ADD COLUMN supports_bw INTEGER NOT NULL DEFAULT 1`)
  }

  // Цвет-only профили (ШФП/УФ) — без режима ч/б.
  await db.run(
    `UPDATE print_technologies
     SET supports_bw = CASE
       WHEN LOWER(code) IN ('inkjet_solvent', 'inkjet_pigment', 'uv') THEN 0
       WHEN supports_bw IS NULL THEN 1
       ELSE supports_bw
     END,
     updated_at = datetime('now')`,
  )
}

async function rebuildPrintersCounterUnitCheckForM2(db: Database): Promise<void> {
  if (!(await tableExists(db, 'printers'))) return
  if (!(await columnExists(db, 'printers', 'counter_unit'))) return

  const tableSqlRow = await db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'printers'`,
  )
  const tableSql = tableSqlRow?.sql ?? ''
  if (tableSql.includes("'m2'")) return

  const cols = await db.all<TableInfoRow[]>(`PRAGMA table_info('printers')`)
  const hasCol = new Set(cols.map((c) => c.name))
  const hasDepartmentId = hasCol.has('department_id')
  const counterUnitExpr = hasCol.has('counter_unit') ? 'counter_unit' : "'sheets'"

  const selectExpr = (name: string, fallback: string): string =>
    hasCol.has(name) ? name : `${fallback} AS ${name}`

  await db.exec('PRAGMA foreign_keys=OFF')
  try {
    await db.exec(`
    CREATE TABLE printers_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      technology_code TEXT,
      counter_unit TEXT CHECK (counter_unit IN ('sheets','meters','m2')) DEFAULT 'sheets',
      max_width_mm REAL,
      color_mode TEXT CHECK (color_mode IN ('bw','color','both')) DEFAULT 'both',
      printer_class TEXT CHECK (printer_class IN ('office','pro')) DEFAULT 'office',
      ${hasDepartmentId ? 'department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,' : ''}
      price_single REAL,
      price_duplex REAL,
      price_per_meter REAL,
      price_bw_single REAL,
      price_bw_duplex REAL,
      price_color_single REAL,
      price_color_duplex REAL,
      price_bw_per_meter REAL,
      price_color_per_meter REAL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

    await db.exec(`
    INSERT INTO printers_new (
      id,
      code,
      name,
      technology_code,
      counter_unit,
      max_width_mm,
      color_mode,
      printer_class,
      ${hasDepartmentId ? 'department_id,' : ''}
      price_single,
      price_duplex,
      price_per_meter,
      price_bw_single,
      price_bw_duplex,
      price_color_single,
      price_color_duplex,
      price_bw_per_meter,
      price_color_per_meter,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      ${selectExpr('id', 'NULL')},
      ${selectExpr('code', "''")},
      ${selectExpr('name', "''")},
      ${selectExpr('technology_code', 'NULL')},
      CASE
        WHEN ${counterUnitExpr} IN ('sheets','meters','m2') THEN ${counterUnitExpr}
        ELSE 'sheets'
      END AS counter_unit,
      ${selectExpr('max_width_mm', 'NULL')},
      ${selectExpr('color_mode', "'both'")},
      ${selectExpr('printer_class', "'office'")},
      ${hasDepartmentId ? `${selectExpr('department_id', 'NULL')},` : ''}
      ${selectExpr('price_single', 'NULL')},
      ${selectExpr('price_duplex', 'NULL')},
      ${selectExpr('price_per_meter', 'NULL')},
      ${selectExpr('price_bw_single', 'NULL')},
      ${selectExpr('price_bw_duplex', 'NULL')},
      ${selectExpr('price_color_single', 'NULL')},
      ${selectExpr('price_color_duplex', 'NULL')},
      ${selectExpr('price_bw_per_meter', 'NULL')},
      ${selectExpr('price_color_per_meter', 'NULL')},
      ${selectExpr('is_active', '1')},
      ${selectExpr('created_at', "datetime('now')")},
      ${selectExpr('updated_at', "datetime('now')")}
    FROM printers
  `)

    await db.exec('DROP TABLE printers')
    await db.exec('ALTER TABLE printers_new RENAME TO printers')
  } finally {
    await db.exec('PRAGMA foreign_keys=ON')
  }
}

export async function up(db: Database): Promise<void> {
  await db.exec('BEGIN')
  try {
    await ensurePrintPricesM2Kind(db)
    await ensureRollM2TiersTable(db)
    await ensurePrintTechnologiesSupportsBw(db)
    await rebuildPrintersCounterUnitCheckForM2(db)
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('BEGIN')
  try {
    await db.exec('DROP TABLE IF EXISTS print_price_roll_m2_tiers')
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

