import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS internal_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK(status IN ('todo', 'in_progress', 'review', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      due_date TEXT,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `)

  await db.exec('CREATE INDEX IF NOT EXISTS idx_internal_tasks_status ON internal_tasks (status)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_internal_tasks_assignee_status ON internal_tasks (assignee_id, status)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_internal_tasks_due_date ON internal_tasks (due_date)')
  await db.exec('CREATE INDEX IF NOT EXISTS idx_internal_tasks_department ON internal_tasks (department_id)')
}

export async function down(_db: Database): Promise<void> {
  // SQLite: таблицы не удаляем
}
