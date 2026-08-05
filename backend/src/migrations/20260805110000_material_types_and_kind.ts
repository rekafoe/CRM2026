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
  if (!(await tableExists(db, table))) return false
  const rows = await db.all<TableInfoRow[]>(`PRAGMA table_info('${table}')`)
  return rows.some((row) => row.name === column)
}

async function ensureMaterialTypesTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS material_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(category_id) REFERENCES material_categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, name)
    )
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_types_category_id
    ON material_types(category_id)
  `)
}

async function ensureMaterialsColumns(db: Database): Promise<void> {
  if (!(await columnExists(db, 'materials', 'material_type_id'))) {
    await db.exec(
      `ALTER TABLE materials ADD COLUMN material_type_id INTEGER REFERENCES material_types(id) ON DELETE SET NULL`,
    )
  }

  if (!(await columnExists(db, 'materials', 'material_kind'))) {
    await db.exec(
      `ALTER TABLE materials ADD COLUMN material_kind TEXT NOT NULL DEFAULT 'consumable' CHECK (material_kind IN ('sheet','roll','consumable','area'))`,
    )
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_material_type_id
    ON materials(material_type_id)
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_material_kind
    ON materials(material_kind)
  `)
}

async function backfillMaterialKinds(db: Database): Promise<void> {
  const hasPaperTypeId = await columnExists(db, 'materials', 'paper_type_id')
  const hasSheetWidth = await columnExists(db, 'materials', 'sheet_width')
  const hasSheetHeight = await columnExists(db, 'materials', 'sheet_height')

  const paperTypeExpr = hasPaperTypeId ? 'paper_type_id IS NOT NULL' : '0'
  const sheetSizeExpr = hasSheetWidth && hasSheetHeight
    ? '(COALESCE(sheet_width, 0) > 0 AND COALESCE(sheet_height, 0) > 0)'
    : '0'

  await db.exec(`
    UPDATE materials
    SET material_kind = CASE
      WHEN LOWER(TRIM(COALESCE(unit, ''))) IN ('м', 'm', 'meter', 'meters') THEN 'roll'
      WHEN LOWER(REPLACE(TRIM(COALESCE(unit, '')), ' ', '')) IN ('м²', 'm²', 'm2', 'sqm') THEN 'area'
      WHEN ${sheetSizeExpr} THEN 'sheet'
      WHEN ${paperTypeExpr} THEN 'sheet'
      WHEN material_kind NOT IN ('sheet', 'roll', 'consumable', 'area') THEN 'consumable'
      ELSE material_kind
    END
  `)
}

async function seedDefaultMaterialTypes(db: Database): Promise<void> {
  await db.exec(`
    INSERT OR IGNORE INTO material_types (category_id, name, description, is_active)
    SELECT DISTINCT
      m.category_id,
      'Основной',
      'Автосозданный тип для существующих материалов',
      1
    FROM materials m
    WHERE m.category_id IS NOT NULL
  `)

  await db.exec(`
    UPDATE materials
    SET material_type_id = (
      SELECT mt.id
      FROM material_types mt
      WHERE mt.category_id = materials.category_id
        AND mt.name = 'Основной'
      LIMIT 1
    )
    WHERE material_type_id IS NULL
      AND category_id IS NOT NULL
  `)
}

export async function up(db: Database): Promise<void> {
  await db.exec('BEGIN')
  try {
    await ensureMaterialTypesTable(db)
    await ensureMaterialsColumns(db)
    await backfillMaterialKinds(db)
    await seedDefaultMaterialTypes(db)
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('BEGIN')
  try {
    await db.exec('DROP TABLE IF EXISTS material_types')
    await db.exec('DROP INDEX IF EXISTS idx_materials_material_type_id')
    await db.exec('DROP INDEX IF EXISTS idx_materials_material_kind')
    await db.exec('COMMIT')
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}
