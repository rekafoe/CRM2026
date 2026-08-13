import { Database } from 'sqlite'

const categorySeeds = [
  ['Производство', 'proizvodstvo', 10],
  ['Материалы', 'materialy', 20],
  ['Оборудование', 'oborudovanie', 30],
  ['Работа с клиентами', 'rabota-s-klientami', 40],
  ['Регламенты', 'reglamenty', 50],
] as const

export async function up(db: Database): Promise<void> {
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS kb_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_plain TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      author_user_id INTEGER,
      current_revision_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(category_id) REFERENCES kb_categories(id) ON DELETE SET NULL,
      FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(current_revision_id) REFERENCES kb_article_revisions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_article_tags (
      article_id INTEGER NOT NULL,
      tag TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY(article_id, tag),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kb_article_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_plain TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      tags_json TEXT NOT NULL DEFAULT '[]',
      editor_user_id INTEGER,
      source TEXT NOT NULL DEFAULT 'direct'
        CHECK (source IN ('direct', 'proposal', 'restore')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES kb_categories(id) ON DELETE SET NULL,
      FOREIGN KEY(editor_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(article_id, version)
    );

    CREATE TABLE IF NOT EXISTS kb_edit_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      base_revision_id INTEGER NOT NULL,
      proposer_user_id INTEGER,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_plain TEXT NOT NULL DEFAULT '',
      proposal_note TEXT,
      category_id INTEGER,
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewer_user_id INTEGER,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      reviewed_at TEXT,
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(base_revision_id) REFERENCES kb_article_revisions(id) ON DELETE RESTRICT,
      FOREIGN KEY(proposer_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(category_id) REFERENCES kb_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      author_user_id INTEGER,
      body_json TEXT NOT NULL,
      body_plain TEXT NOT NULL,
      is_resolved INTEGER NOT NULL DEFAULT 0 CHECK (is_resolved IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      author_user_id INTEGER,
      body_json TEXT NOT NULL,
      body_plain TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(question_id) REFERENCES kb_questions(id) ON DELETE CASCADE,
      FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      uploader_user_id INTEGER,
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(uploader_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS kb_article_views (
      article_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count > 0),
      first_viewed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY(article_id, user_id),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kb_article_reactions (
      article_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction TEXT NOT NULL CHECK (reaction IN ('like', 'heart', 'celebrate', 'insightful')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY(article_id, user_id, reaction),
      FOREIGN KEY(article_id) REFERENCES kb_articles(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kb_categories_active_sort
      ON kb_categories(is_active, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_status_updated
      ON kb_articles(status, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_category_status
      ON kb_articles(category_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_author_status
      ON kb_articles(author_user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_article_tags_tag
      ON kb_article_tags(tag, article_id);
    CREATE INDEX IF NOT EXISTS idx_kb_revisions_article_created
      ON kb_article_revisions(article_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_proposals_status_article
      ON kb_edit_proposals(status, article_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_proposals_proposer
      ON kb_edit_proposals(proposer_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_questions_article_resolved
      ON kb_questions(article_id, is_resolved, created_at);
    CREATE INDEX IF NOT EXISTS idx_kb_replies_question_created
      ON kb_replies(question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_kb_assets_article
      ON kb_assets(article_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_kb_article_views_recent
      ON kb_article_views(article_id, last_viewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_article_reactions_article
      ON kb_article_reactions(article_id, reaction);
  `)

  for (const [name, slug, sortOrder] of categorySeeds) {
    await db.run(
      `INSERT OR IGNORE INTO kb_categories
        (name, slug, description, sort_order, is_active, created_by)
       VALUES (?, ?, NULL, ?, 1, NULL)`,
      name,
      slug,
      sortOrder,
    )
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec(`
    DROP TABLE IF EXISTS kb_article_reactions;
    DROP TABLE IF EXISTS kb_article_views;
    DROP TABLE IF EXISTS kb_assets;
    DROP TABLE IF EXISTS kb_replies;
    DROP TABLE IF EXISTS kb_questions;
    DROP TABLE IF EXISTS kb_edit_proposals;
    DROP TABLE IF EXISTS kb_article_tags;
    DROP TABLE IF EXISTS kb_article_revisions;
    DROP TABLE IF EXISTS kb_articles;
    DROP TABLE IF EXISTS kb_categories;
  `)
}
