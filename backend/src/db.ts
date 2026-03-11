// backend/src/db.ts

import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import path from 'path'
import fs from 'fs'
import { invalidateTableSchemaCache } from './utils/tableSchemaCache'

function resolveDatabasePath(): string {
  const raw = (process.env.DB_FILE || '').trim()

  // Если DB_FILE задан — используем его всегда (даже если файла ещё нет: он создастся при первом старте)
  if (raw) {
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
    // Гарантируем, что директория для файла существует (частая проблема на Railway при DB_FILE=/data/...)
    try {
      const dir = path.dirname(resolved)
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch (e) {
      console.log('⚠️ Не удалось создать директорию для DB_FILE:', resolved, e)
    }
    console.log('✅ Используется БД из DB_FILE:', resolved)
    return resolved
  }

  // По умолчанию храним БД в рабочей директории процесса (в dev это backend/, в Docker/Railway — WORKDIR)
  const defaultPath = path.resolve(process.cwd(), 'data.db')
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.log('⚠️ DB_FILE не задан. В production на Railway без Volume SQLite файл может теряться при рестартах/деплоях.')
    console.log('   Рекомендуется подключить Railway Volume и выставить DB_FILE=/data/data.db')
  }
  console.log('✅ Используется БД:', defaultPath)
  return defaultPath
}

const DB_FILE = resolveDatabasePath()

let dbInstance: Database | null = null
let initPromise: Promise<Database> | null = null

// Отключаем опасные миграции, которые удаляют данные
const DISABLED_MIGRATIONS = new Set<string>([
  '20250201000001_remove_legacy_pricing_tables',  // Удаляет product_operations_link!
])

export async function initDB(): Promise<Database> {
  if (dbInstance) return dbInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    console.log('📂 Opening database at', DB_FILE)
    const db = await open({
      filename: DB_FILE,
      driver: sqlite3.Database
    })

    await db.exec('PRAGMA foreign_keys = ON;')

    await runMigrations(db)
    await migrateLegacyMaterialMoves(db)

    dbInstance = db
    return db
  })()

  return initPromise
}

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDB() first.')
  }
  return dbInstance
}

/**
 * Выполнить операцию в транзакции с автоматическим откатом при ошибке
 */
export async function withTransaction<T>(
  operation: (db: Database) => Promise<T>
): Promise<T> {
  const db = await getDb()
  
  try {
    await db.run('BEGIN')
    const result = await operation(db)
    await db.run('COMMIT')
    return result
  } catch (error) {
    await db.run('ROLLBACK')
    throw error
  }
}

/**
 * Выполнить несколько операций в одной транзакции
 */
export async function runInTransaction(
  operations: Array<(db: Database) => Promise<void>>
): Promise<void> {
  await withTransaction(async (db) => {
    for (const operation of operations) {
      await operation(db)
    }
  })
}

async function runMigrations(db: Database): Promise<void> {
  try {
    // Создаем таблицу для отслеживания миграций
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);

    console.log('🌱 Applying migrations...')
    const migrationsDir = path.resolve(__dirname, './migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
      .sort()

    for (const migrationFile of migrationFiles) {
      const migrationName = migrationFile.replace(/\.(ts|js)$/i, '')
      
      if (DISABLED_MIGRATIONS.has(migrationName)) {
        console.log(`⏭️  Skipping disabled migration: ${migrationName}`)
        continue
      }

      // Проверяем применялась ли уже эта миграция
      const applied = await db.get('SELECT name FROM migrations WHERE name = ?', [migrationName]);
      if (applied) {
        // Миграция уже применена, пропускаем
        continue;
      }

      try {
        const migrationPath = path.join(migrationsDir, migrationFile)
        const migration = require(migrationPath)
        const runner = migration.up ?? migration.default?.up
        if (typeof runner === 'function') {
          await runner(db)
          await db.run('INSERT OR IGNORE INTO migrations (name) VALUES (?)', [migrationName]);
          console.log(`✅ Migration applied: ${migrationFile}`)
        }
      } catch (error: any) {
        const msg = String(error?.message || error || '')
        const isDuplicateColumn = msg.includes('duplicate column')
        if (isDuplicateColumn) {
          await db.run('INSERT OR IGNORE INTO migrations (name) VALUES (?)', [migrationName]);
          console.log(`✅ Migration applied (column exists): ${migrationFile}`)
        } else {
          console.log(`⚠️ Migration failed: ${migrationFile}`, error)
        }
      }
    }
    invalidateTableSchemaCache()
    console.log('✅ Migrations completed')
  } catch (error) {
    console.log('⚠️ Failed to apply migrations', error)
  }
}

async function migrateLegacyMaterialMoves(db: Database): Promise<void> {
  try {
    const columns: Array<{ name: string }> = await db.all(`PRAGMA table_info(material_moves)`)
    if (!columns.length) return

    const hasColumn = (name: string) => columns.some((column) => column.name === name)
    const ensureColumn = async (name: string, ddl: string) => {
      if (!hasColumn(name)) {
        await db.exec(ddl)
        columns.push({ name } as any)
      }
    }

    await ensureColumn('material_id', "ALTER TABLE material_moves ADD COLUMN material_id INTEGER")
    await ensureColumn('type', "ALTER TABLE material_moves ADD COLUMN type TEXT DEFAULT 'legacy'")
    await ensureColumn('quantity', "ALTER TABLE material_moves ADD COLUMN quantity REAL")
    await ensureColumn('delta', "ALTER TABLE material_moves ADD COLUMN delta REAL")
    await ensureColumn('price', "ALTER TABLE material_moves ADD COLUMN price REAL")
    await ensureColumn('order_id', "ALTER TABLE material_moves ADD COLUMN order_id INTEGER")
    await ensureColumn('supplier_id', "ALTER TABLE material_moves ADD COLUMN supplier_id INTEGER")
    await ensureColumn('delivery_number', "ALTER TABLE material_moves ADD COLUMN delivery_number TEXT")
    await ensureColumn('invoice_number', "ALTER TABLE material_moves ADD COLUMN invoice_number TEXT")
    await ensureColumn('delivery_date', "ALTER TABLE material_moves ADD COLUMN delivery_date TEXT")
    await ensureColumn('delivery_notes', "ALTER TABLE material_moves ADD COLUMN delivery_notes TEXT")
    await ensureColumn('metadata', "ALTER TABLE material_moves ADD COLUMN metadata TEXT")

    await db.exec('CREATE INDEX IF NOT EXISTS idx_material_moves_material ON material_moves(material_id)')
    await db.exec('CREATE INDEX IF NOT EXISTS idx_material_moves_created ON material_moves(created_at)')
    await db.exec('CREATE INDEX IF NOT EXISTS idx_material_moves_order ON material_moves(order_id)')

    if (hasColumn('materialId') && hasColumn('material_id')) {
      await db.exec(`UPDATE material_moves SET material_id = materialId WHERE (material_id IS NULL OR material_id = 0) AND materialId IS NOT NULL`)
    }

    if (hasColumn('orderId') && hasColumn('order_id')) {
      await db.exec(`UPDATE material_moves SET order_id = orderId WHERE order_id IS NULL AND orderId IS NOT NULL`)
    }

    if (hasColumn('delta') && hasColumn('quantity')) {
      await db.exec(`UPDATE material_moves SET quantity = COALESCE(quantity, ABS(delta))`)
    }

    if (hasColumn('delta') && hasColumn('type')) {
      await db.exec(`UPDATE material_moves SET type = CASE WHEN type IS NULL OR type = '' OR type = 'legacy' THEN CASE WHEN delta IS NOT NULL AND delta < 0 THEN 'spend' ELSE 'add' END ELSE type END`)
    }
  } catch {
    // Silent fallback: legacy tables will be handled by migrations when possible
  }
}
