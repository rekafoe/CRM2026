import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261109120000_design_template_upload_ownership'

describe('design template ownership migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE design_templates (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('adds the uploader column and one pending delete request per design', async () => {
    await up(db)
    await up(db)

    const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(design_templates)')
    expect(columns.map((column) => column.name)).toContain('uploaded_by_user_id')

    await db.run(`INSERT INTO users (id, name) VALUES (1, 'Менеджер')`)
    await db.run(`INSERT INTO design_templates (id, name) VALUES (10, 'Макет')`)
    await db.run(
      `INSERT INTO design_template_delete_requests (design_template_id, requested_by_user_id, status)
       VALUES (10, 1, 'pending')`,
    )
    await expect(db.run(
      `INSERT INTO design_template_delete_requests (design_template_id, requested_by_user_id, status)
       VALUES (10, 1, 'pending')`,
    )).rejects.toThrow(/UNIQUE|constraint/i)

    await db.run(
      `UPDATE design_template_delete_requests SET status = 'rejected' WHERE design_template_id = 10`,
    )
    await db.run(
      `INSERT INTO design_template_delete_requests (design_template_id, requested_by_user_id, status)
       VALUES (10, 1, 'pending')`,
    )
    const pending = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM design_template_delete_requests WHERE design_template_id = 10 AND status = 'pending'`,
    )
    expect(pending?.n).toBe(1)
  })
})