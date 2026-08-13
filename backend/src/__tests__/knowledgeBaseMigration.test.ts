import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { down, up } from '../migrations/20260813210000_create_knowledge_base'
import { up as extendProposals } from '../migrations/20260813211500_extend_knowledge_edit_proposals'
import { up as addEngagement } from '../migrations/20260813213000_add_knowledge_engagement'

describe('knowledge base migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        is_active INTEGER DEFAULT 1
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('creates the complete schema and category seeds on a fresh database', async () => {
    await up(db)

    const tables = await db.all<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE 'kb_%'
       ORDER BY name`,
    )
    expect(tables.map((row) => row.name)).toEqual([
      'kb_article_reactions',
      'kb_article_revisions',
      'kb_article_tags',
      'kb_article_views',
      'kb_articles',
      'kb_assets',
      'kb_categories',
      'kb_edit_proposals',
      'kb_questions',
      'kb_replies',
    ])

    const categories = await db.all<Array<{ name: string; sort_order: number }>>(
      'SELECT name, sort_order FROM kb_categories ORDER BY sort_order',
    )
    expect(categories.map((row) => row.name)).toEqual([
      'Производство',
      'Материалы',
      'Оборудование',
      'Работа с клиентами',
      'Регламенты',
    ])
  })

  it('is idempotent and preserves existing category changes', async () => {
    await up(db)
    await db.run(
      `UPDATE kb_categories SET description = 'Локальное описание'
       WHERE slug = 'materialy'`,
    )
    await up(db)

    const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM kb_categories')
    const category = await db.get<{ description: string }>(
      `SELECT description FROM kb_categories WHERE slug = 'materialy'`,
    )
    expect(count?.count).toBe(5)
    expect(category?.description).toBe('Локальное описание')
  })

  it('supports article, revision and proposal foreign keys', async () => {
    await up(db)
    const user = await db.run(`INSERT INTO users (name, role) VALUES ('Автор', 'user')`)
    const category = await db.get<{ id: number }>(
      `SELECT id FROM kb_categories WHERE slug = 'reglamenty'`,
    )
    const article = await db.run(
      `INSERT INTO kb_articles
        (title, slug, content_json, category_id, author_user_id)
       VALUES ('Инструкция', 'instrukciya', '{"type":"doc"}', ?, ?)`,
      category!.id,
      user.lastID,
    )
    const revision = await db.run(
      `INSERT INTO kb_article_revisions
        (article_id, version, title, content_json, editor_user_id)
       VALUES (?, 1, 'Инструкция', '{"type":"doc"}', ?)`,
      article.lastID,
      user.lastID,
    )
    await db.run(
      `UPDATE kb_articles SET current_revision_id = ? WHERE id = ?`,
      revision.lastID,
      article.lastID,
    )
    await expect(db.run(
      `INSERT INTO kb_edit_proposals
        (article_id, base_revision_id, proposer_user_id, title, content_json)
       VALUES (?, ?, ?, 'Правка', '{"type":"doc"}')`,
      article.lastID,
      revision.lastID,
      user.lastID,
    )).resolves.toBeTruthy()

    await down(db)
  })

  it('extends an already deployed proposal table idempotently', async () => {
    await db.exec(`
      CREATE TABLE kb_articles (id INTEGER PRIMARY KEY, category_id INTEGER);
      CREATE TABLE kb_article_tags (article_id INTEGER, tag TEXT);
      CREATE TABLE kb_edit_proposals (
        id INTEGER PRIMARY KEY,
        article_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      INSERT INTO kb_articles (id, category_id) VALUES (10, 7);
      INSERT INTO kb_article_tags (article_id, tag) VALUES (10, 'печать'), (10, 'плёнка');
      INSERT INTO kb_edit_proposals (id, article_id, status) VALUES (20, 10, 'pending');
    `)
    await extendProposals(db)
    await extendProposals(db)

    const columns = await db.all<Array<{ name: string }>>(
      `PRAGMA table_info(kb_edit_proposals)`,
    )
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'proposal_note',
      'category_id',
      'tags_json',
    ]))
    const proposal = await db.get<{ category_id: number; tags_json: string }>(
      `SELECT category_id, tags_json FROM kb_edit_proposals WHERE id = 20`,
    )
    expect(proposal?.category_id).toBe(7)
    expect(JSON.parse(proposal!.tags_json)).toEqual(['печать', 'плёнка'])
  })

  it('adds engagement tables idempotently to an existing knowledge base', async () => {
    await up(db)
    await addEngagement(db)
    await addEngagement(db)

    const tables = await db.all<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('kb_article_views', 'kb_article_reactions')
       ORDER BY name`,
    )
    expect(tables.map((row) => row.name)).toEqual([
      'kb_article_reactions',
      'kb_article_views',
    ])
  })
})
