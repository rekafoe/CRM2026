import { Database } from 'sqlite'

type ColumnInfo = { name: string }

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const columns = await db.all<ColumnInfo[]>(`PRAGMA table_info(${table})`)
  return columns.some((item) => item.name === column)
}

export async function up(db: Database): Promise<void> {
  const table = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kb_edit_proposals'`,
  )
  if (!table) return

  if (!(await hasColumn(db, 'kb_edit_proposals', 'proposal_note'))) {
    await db.run(`ALTER TABLE kb_edit_proposals ADD COLUMN proposal_note TEXT`)
  }
  const addedCategoryId = !(await hasColumn(db, 'kb_edit_proposals', 'category_id'))
  if (addedCategoryId) {
    await db.run(`ALTER TABLE kb_edit_proposals ADD COLUMN category_id INTEGER`)
  }
  const addedTagsJson = !(await hasColumn(db, 'kb_edit_proposals', 'tags_json'))
  if (addedTagsJson) {
    await db.run(`ALTER TABLE kb_edit_proposals ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`)
  }

  const pending = (addedCategoryId || addedTagsJson)
    ? await db.all<Array<{ id: number; article_id: number }>>(
      `SELECT id, article_id FROM kb_edit_proposals WHERE status = 'pending'`,
    )
    : []
  for (const proposal of pending) {
    const article = await db.get<{ category_id: number | null }>(
      `SELECT category_id FROM kb_articles WHERE id = ?`,
      proposal.article_id,
    )
    const tags = await db.all<Array<{ tag: string }>>(
      `SELECT tag FROM kb_article_tags WHERE article_id = ? ORDER BY tag`,
      proposal.article_id,
    )
    const tagsJson = JSON.stringify(tags.map((item) => item.tag))
    if (addedCategoryId && addedTagsJson) {
      await db.run(
        `UPDATE kb_edit_proposals SET category_id = ?, tags_json = ? WHERE id = ?`,
        article?.category_id ?? null,
        tagsJson,
        proposal.id,
      )
    } else if (addedCategoryId) {
      await db.run(
        `UPDATE kb_edit_proposals SET category_id = ? WHERE id = ?`,
        article?.category_id ?? null,
        proposal.id,
      )
    } else {
      await db.run(
        `UPDATE kb_edit_proposals SET tags_json = ? WHERE id = ?`,
        tagsJson,
        proposal.id,
      )
    }
  }

  const revisionTable = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kb_article_revisions'`,
  )
  if (!revisionTable) return
  const addedRevisionCategory = !(await hasColumn(db, 'kb_article_revisions', 'category_id'))
  if (addedRevisionCategory) {
    await db.run(`ALTER TABLE kb_article_revisions ADD COLUMN category_id INTEGER`)
  }
  const addedRevisionTags = !(await hasColumn(db, 'kb_article_revisions', 'tags_json'))
  if (addedRevisionTags) {
    await db.run(`ALTER TABLE kb_article_revisions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'`)
  }
  if (addedRevisionCategory || addedRevisionTags) {
    const revisions = await db.all<Array<{ id: number; article_id: number }>>(
      `SELECT id, article_id FROM kb_article_revisions`,
    )
    for (const revision of revisions) {
      const article = await db.get<{ category_id: number | null }>(
        `SELECT category_id FROM kb_articles WHERE id = ?`,
        revision.article_id,
      )
      const tags = await db.all<Array<{ tag: string }>>(
        `SELECT tag FROM kb_article_tags WHERE article_id = ? ORDER BY tag`,
        revision.article_id,
      )
      const tagsJson = JSON.stringify(tags.map((item) => item.tag))
      if (addedRevisionCategory && addedRevisionTags) {
        await db.run(
          `UPDATE kb_article_revisions SET category_id = ?, tags_json = ? WHERE id = ?`,
          article?.category_id ?? null,
          tagsJson,
          revision.id,
        )
      } else if (addedRevisionCategory) {
        await db.run(
          `UPDATE kb_article_revisions SET category_id = ? WHERE id = ?`,
          article?.category_id ?? null,
          revision.id,
        )
      } else {
        await db.run(
          `UPDATE kb_article_revisions SET tags_json = ? WHERE id = ?`,
          tagsJson,
          revision.id,
        )
      }
    }
  }
}

export async function down(_db: Database): Promise<void> {
  // SQLite legacy: добавленные данные предложений не удаляем.
}
