import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_kb_article_views_recent
      ON kb_article_views(article_id, last_viewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_article_reactions_article
      ON kb_article_reactions(article_id, reaction);
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec(`
    DROP TABLE IF EXISTS kb_article_reactions;
    DROP TABLE IF EXISTS kb_article_views;
  `)
}
