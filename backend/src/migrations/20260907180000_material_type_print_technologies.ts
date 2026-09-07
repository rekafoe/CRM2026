import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS material_type_print_technologies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_type_id INTEGER NOT NULL,
      technology_code TEXT NOT NULL,
      supports_indoor INTEGER NOT NULL DEFAULT 1 CHECK (supports_indoor IN (0, 1)),
      supports_outdoor INTEGER NOT NULL DEFAULT 0 CHECK (supports_outdoor IN (0, 1)),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (material_type_id) REFERENCES material_types(id) ON DELETE CASCADE,
      FOREIGN KEY (technology_code) REFERENCES print_technologies(code) ON DELETE CASCADE,
      UNIQUE (material_type_id, technology_code),
      CHECK (supports_indoor = 1 OR supports_outdoor = 1)
    )
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_type_print_technologies_type
    ON material_type_print_technologies(material_type_id, is_active, priority)
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_type_print_technologies_technology
    ON material_type_print_technologies(technology_code, is_active)
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS material_type_print_technologies')
}

export default { up, down }
