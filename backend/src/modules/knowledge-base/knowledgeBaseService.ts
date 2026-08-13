import { Database } from 'sqlite'
import { getDb } from '../../config/database'
import { UserInboxNotificationService } from '../../services/userInboxNotificationService'
import {
  MAX_DISCUSSION_CONTENT_BYTES,
  normalizeTipTapContent,
} from './content'
import {
  ArticleListFilters,
  ArticleWriteInput,
  KnowledgeActor,
  KnowledgeArticleStatus,
  ProposalWriteInput,
} from './types'
import {
  canDirectEditKnowledgeArticle,
  canViewKnowledgeArticle,
  isKnowledgeAdmin,
} from './access'

const ARTICLE_SELECT = `
  SELECT
    a.*,
    c.name AS category_name,
    c.slug AS category_slug,
    c.description AS category_description,
    u.name AS author_name,
    u.role AS author_role,
    (
      SELECT GROUP_CONCAT(tag, char(31))
      FROM kb_article_tags kt
      WHERE kt.article_id = a.id
    ) AS tags_joined,
    (SELECT COUNT(*) FROM kb_article_views view WHERE view.article_id = a.id) AS unique_viewers,
    (SELECT COALESCE(SUM(view.view_count), 0) FROM kb_article_views view WHERE view.article_id = a.id) AS total_views,
    (SELECT COUNT(*) FROM kb_article_reactions reaction WHERE reaction.article_id = a.id) AS total_reactions
  FROM kb_articles a
  LEFT JOIN kb_categories c ON c.id = a.category_id
  LEFT JOIN users u ON u.id = a.author_user_id
`

const KNOWLEDGE_REACTIONS = new Set(['like', 'heart', 'celebrate', 'insightful'])

export class KnowledgeBaseError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name =
      status === 404 ? 'NotFoundError'
        : status === 403 ? 'ForbiddenError'
          : status === 409 ? 'ConflictError'
            : status === 401 ? 'UnauthorizedError'
              : 'ValidationError'
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function isAdmin(actor: KnowledgeActor): boolean {
  return isKnowledgeAdmin(actor)
}

function positiveId(value: unknown, field: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', `${field} должен быть положительным целым числом`)
  }
  return id
}

function optionalCategoryId(value: unknown): number | null {
  if (value == null || value === '') return null
  return positiveId(value, 'categoryId')
}

function cleanTitle(value: unknown, fallback?: string): string {
  if (value == null && fallback != null) return fallback
  if (typeof value !== 'string') {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'title должен быть строкой')
  }
  const title = value.trim()
  if (!title || title.length > 240) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'title должен содержать от 1 до 240 символов')
  }
  return title
}

function cleanExcerpt(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  if (typeof value !== 'string' || value.length > 2000) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'excerpt должен быть строкой до 2000 символов')
  }
  return value.trim()
}

function cleanProposalNote(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 2000) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Комментарий к правке должен быть строкой до 2000 символов')
  }
  return value.trim() || null
}

function cleanTags(value: unknown, fallback: string[] = []): string[] {
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.length > 30) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'tags должен быть массивом максимум из 30 элементов')
  }
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Каждый тег должен быть строкой')
    }
    const tag = item.trim().toLocaleLowerCase('ru')
    if (!tag || tag.length > 64 || /[\u0000-\u001f]/.test(tag)) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Тег должен содержать от 1 до 64 печатных символов')
    }
    const key = tag.toLocaleLowerCase('ru')
    if (!seen.has(key)) {
      seen.add(key)
      result.push(tag)
    }
  }
  return result
}

const cyrillicMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function slugify(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLocaleLowerCase('ru')
    .split('')
    .map((char) => cyrillicMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

function mapArticle(row: any) {
  const tags = row.tags_joined ? String(row.tags_joined).split(String.fromCharCode(31)).filter(Boolean) : []
  const authorUserId = row.author_user_id == null ? null : Number(row.author_user_id)
  const categoryId = row.category_id == null ? null : Number(row.category_id)
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    slug: String(row.slug || ''),
    excerpt: String(row.excerpt || ''),
    contentJson: parseJsonObject(row.content_json),
    contentPlain: String(row.content_plain || ''),
    categoryId,
    authorUserId,
    currentRevisionId: row.current_revision_id == null ? null : Number(row.current_revision_id),
    status: row.status as KnowledgeArticleStatus,
    publishedAt: row.published_at ?? null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    tags,
    category: categoryId == null ? null : {
      id: categoryId,
      name: String(row.category_name || ''),
      slug: String(row.category_slug || ''),
      description: row.category_description ?? null,
    },
    author: authorUserId == null ? null : {
      id: authorUserId,
      name: String(row.author_name || ''),
      role: String(row.author_role || ''),
    },
    engagement: {
      totalViews: Number(row.total_views || 0),
      uniqueViewers: Number(row.unique_viewers || 0),
      totalReactions: Number(row.total_reactions || 0),
      viewers: [],
      reactions: [],
      myReactions: [],
    },
  }
}

function mapRevision(row: any) {
  const editorUserId = row.editor_user_id == null ? null : Number(row.editor_user_id)
  return {
    id: Number(row.id),
    articleId: Number(row.article_id),
    version: Number(row.version),
    revisionNumber: Number(row.version),
    title: String(row.title || ''),
    excerpt: String(row.excerpt || ''),
    contentJson: parseJsonObject(row.content_json),
    contentPlain: String(row.content_plain || ''),
    categoryId: row.category_id == null ? null : Number(row.category_id),
    tags: (() => {
      try {
        const tags = typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : row.tags_json
        return Array.isArray(tags) ? tags.map(String) : []
      } catch {
        return []
      }
    })(),
    editorUserId,
    authorUserId: editorUserId,
    source: String(row.source || ''),
    createdAt: String(row.created_at || ''),
    editor: editorUserId == null ? null : {
      id: editorUserId,
      name: String(row.editor_name || ''),
      role: String(row.editor_role || ''),
    },
    author: editorUserId == null ? null : {
      id: editorUserId,
      name: String(row.editor_name || ''),
      role: String(row.editor_role || ''),
    },
  }
}

function mapProposal(row: any) {
  const proposerUserId = row.proposer_user_id == null ? null : Number(row.proposer_user_id)
  const reviewerUserId = row.reviewer_user_id == null ? null : Number(row.reviewer_user_id)
  return {
    id: Number(row.id),
    articleId: Number(row.article_id),
    baseRevisionId: Number(row.base_revision_id),
    proposerUserId,
    authorUserId: proposerUserId,
    title: String(row.title || ''),
    excerpt: String(row.excerpt || ''),
    contentJson: parseJsonObject(row.content_json),
    contentPlain: String(row.content_plain || ''),
    note: row.proposal_note ?? null,
    proposalNote: row.proposal_note ?? null,
    categoryId: row.category_id == null ? null : Number(row.category_id),
    tags: (() => {
      try {
        const tags = typeof row.tags_json === 'string' ? JSON.parse(row.tags_json) : row.tags_json
        return Array.isArray(tags) ? tags.map(String) : []
      } catch {
        return []
      }
    })(),
    status: String(row.status || ''),
    reviewerUserId,
    reviewNote: row.review_note ?? null,
    createdAt: String(row.created_at || ''),
    reviewedAt: row.reviewed_at ?? null,
    article: row.article_title == null ? undefined : {
      id: Number(row.article_id),
      title: String(row.article_title),
      slug: String(row.article_slug || ''),
      status: String(row.article_status || ''),
      authorUserId: row.article_author_user_id == null ? null : Number(row.article_author_user_id),
    },
    proposer: proposerUserId == null ? null : {
      id: proposerUserId,
      name: String(row.proposer_name || ''),
      role: String(row.proposer_role || ''),
    },
    author: proposerUserId == null ? null : {
      id: proposerUserId,
      name: String(row.proposer_name || ''),
      role: String(row.proposer_role || ''),
    },
    reviewer: reviewerUserId == null ? null : {
      id: reviewerUserId,
      name: String(row.reviewer_name || ''),
      role: String(row.reviewer_role || ''),
    },
  }
}

function mapReply(row: any) {
  const authorUserId = row.author_user_id == null ? null : Number(row.author_user_id)
  return {
    id: Number(row.id),
    questionId: Number(row.question_id),
    authorUserId,
    bodyJson: parseJsonObject(row.body_json),
    bodyPlain: String(row.body_plain || ''),
    content: String(row.body_plain || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    author: authorUserId == null ? null : {
      id: authorUserId,
      name: String(row.author_name || ''),
      role: String(row.author_role || ''),
    },
  }
}

function mapQuestion(row: any, replies: any[] = []) {
  const authorUserId = row.author_user_id == null ? null : Number(row.author_user_id)
  return {
    id: Number(row.id),
    articleId: Number(row.article_id),
    authorUserId,
    bodyJson: parseJsonObject(row.body_json),
    bodyPlain: String(row.body_plain || ''),
    content: String(row.body_plain || ''),
    isResolved: Number(row.is_resolved) === 1,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    author: authorUserId == null ? null : {
      id: authorUserId,
      name: String(row.author_name || ''),
      role: String(row.author_role || ''),
    },
    replies,
  }
}

function mapAsset(row: any) {
  const uploaderUserId = row.uploader_user_id == null ? null : Number(row.uploader_user_id)
  return {
    id: Number(row.id),
    articleId: Number(row.article_id),
    uploaderUserId,
    storageName: String(row.storage_name || ''),
    originalName: String(row.original_name || ''),
    mimeType: String(row.mime_type || ''),
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: String(row.created_at || ''),
    contentPath: `/api/knowledge/assets/${Number(row.id)}/content`,
  }
}

async function loadEngagement(db: Database, articleId: number, actor: KnowledgeActor) {
  const [viewRows, reactionRows] = await Promise.all([
    db.all<any[]>(
      `SELECT view.*, user.name AS user_name, user.role AS user_role
       FROM kb_article_views view
       JOIN users user ON user.id = view.user_id
       WHERE view.article_id = ?
       ORDER BY view.last_viewed_at DESC, user.name`,
      articleId,
    ),
    db.all<any[]>(
      `SELECT reaction.*, user.name AS user_name, user.role AS user_role
       FROM kb_article_reactions reaction
       JOIN users user ON user.id = reaction.user_id
       WHERE reaction.article_id = ?
       ORDER BY reaction.created_at, reaction.user_id`,
      articleId,
    ),
  ])
  const reactions = Array.from(KNOWLEDGE_REACTIONS).map((type) => {
    const rows = reactionRows.filter((row) => row.reaction === type)
    return {
      type,
      count: rows.length,
      users: rows.map((row) => ({
        id: Number(row.user_id),
        name: String(row.user_name || ''),
        role: String(row.user_role || ''),
      })),
    }
  })
  return {
    totalViews: viewRows.reduce((sum, row) => sum + Number(row.view_count || 0), 0),
    uniqueViewers: viewRows.length,
    totalReactions: reactionRows.length,
    viewers: viewRows.map((row) => ({
      user: {
        id: Number(row.user_id),
        name: String(row.user_name || ''),
        role: String(row.user_role || ''),
      },
      viewCount: Number(row.view_count || 0),
      firstViewedAt: String(row.first_viewed_at || ''),
      lastViewedAt: String(row.last_viewed_at || ''),
    })),
    reactions,
    myReactions: reactionRows
      .filter((row) => Number(row.user_id) === actor.id)
      .map((row) => String(row.reaction)),
  }
}

let knowledgeTransactionQueue: Promise<void> = Promise.resolve()

async function inTransaction<T>(db: Database, operation: () => Promise<T>): Promise<T> {
  let release!: () => void
  const previous = knowledgeTransactionQueue
  knowledgeTransactionQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    await db.run('BEGIN IMMEDIATE')
    try {
      const result = await operation()
      await db.run('COMMIT')
      return result
    } catch (error) {
      try { await db.run('ROLLBACK') } catch {}
      throw error
    }
  } finally {
    release()
  }
}

async function ensureCategory(db: Database, categoryId: number | null): Promise<void> {
  if (categoryId == null) return
  const row = await db.get<{ id: number }>('SELECT id FROM kb_categories WHERE id = ?', categoryId)
  if (!row) throw new KnowledgeBaseError(400, 'INVALID_CATEGORY', 'Категория не найдена')
}

async function uniqueSlug(db: Database, requested: unknown, title: string, excludeArticleId?: number): Promise<string> {
  const base = slugify(requested) || slugify(title) || 'article'
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`.slice(0, 110)
    const row = await db.get<{ id: number }>(
      `SELECT id FROM kb_articles WHERE slug = ? ${excludeArticleId ? 'AND id <> ?' : ''}`,
      ...(excludeArticleId ? [candidate, excludeArticleId] : [candidate]),
    )
    if (!row) return candidate
  }
  throw new KnowledgeBaseError(409, 'SLUG_CONFLICT', 'Не удалось подобрать уникальный slug статьи')
}

function assertDirectAccess(article: any, actor: KnowledgeActor): void {
  if (!canDirectEditKnowledgeArticle(article, actor)) {
    throw new KnowledgeBaseError(403, 'FORBIDDEN', 'Редактировать статью может только автор или администратор')
  }
}

function assertCurrentRevision(article: any, baseRevisionId: number): void {
  if (Number(article.current_revision_id) !== baseRevisionId) {
    throw new KnowledgeBaseError(
      409,
      'REVISION_CONFLICT',
      'Статья уже изменена. Обновите данные и повторите операцию.',
    )
  }
}

function canViewArticleRow(article: any, actor: KnowledgeActor): boolean {
  return canViewKnowledgeArticle(article, actor)
}

async function insertRevision(
  db: Database,
  params: {
    articleId: number
    title: string
    excerpt: string
    contentJson: string
    contentPlain: string
    categoryId: number | null
    tags: string[]
    editorUserId: number
    source: 'direct' | 'proposal' | 'restore'
  },
): Promise<number> {
  const versionRow = await db.get<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM kb_article_revisions WHERE article_id = ?',
    params.articleId,
  )
  const result = await db.run(
    `INSERT INTO kb_article_revisions
      (article_id, version, title, excerpt, content_json, content_plain,
       category_id, tags_json, editor_user_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params.articleId,
    Number(versionRow?.version || 1),
    params.title,
    params.excerpt,
    params.contentJson,
    params.contentPlain,
    params.categoryId,
    JSON.stringify(params.tags),
    params.editorUserId,
    params.source,
  )
  return Number(result.lastID)
}

async function replaceTags(db: Database, articleId: number, tags: string[]): Promise<void> {
  await db.run('DELETE FROM kb_article_tags WHERE article_id = ?', articleId)
  for (const tag of tags) {
    await db.run(
      'INSERT INTO kb_article_tags (article_id, tag) VALUES (?, ?)',
      articleId,
      tag,
    )
  }
}

const PROPOSAL_SELECT = `
  SELECT
    p.*,
    a.title AS article_title,
    a.slug AS article_slug,
    a.status AS article_status,
    a.author_user_id AS article_author_user_id,
    proposer.name AS proposer_name,
    proposer.role AS proposer_role,
    reviewer.name AS reviewer_name,
    reviewer.role AS reviewer_role
  FROM kb_edit_proposals p
  JOIN kb_articles a ON a.id = p.article_id
  LEFT JOIN users proposer ON proposer.id = p.proposer_user_id
  LEFT JOIN users reviewer ON reviewer.id = p.reviewer_user_id
`

export class KnowledgeBaseService {
  static async listCategories(_actor: KnowledgeActor) {
    const db = await getDb()
    const rows = await db.all<any[]>(
      `SELECT c.*,
        (
          SELECT COUNT(*)
          FROM kb_articles a
          WHERE a.category_id = c.id
            AND a.status = 'published'
        ) AS article_count
       FROM kb_categories c
       WHERE c.is_active = 1
       ORDER BY c.sort_order, c.name`,
    )
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      slug: String(row.slug || ''),
      description: row.description ?? null,
      sortOrder: Number(row.sort_order || 0),
      isActive: Number(row.is_active) === 1,
      articleCount: Number(row.article_count || 0),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    }))
  }

  static async listArticles(actor: KnowledgeActor, filters: ArticleListFilters) {
    const db = await getDb()
    const where: string[] = []
    const params: any[] = []

    if (!isAdmin(actor)) {
      where.push(`(a.status = 'published' OR a.author_user_id = ?)`)
      params.push(actor.id)
    }
    if (filters.scope === 'my') {
      where.push('a.author_user_id = ?')
      params.push(actor.id)
    }
    if (filters.status) {
      where.push('a.status = ?')
      params.push(filters.status)
    }
    if (filters.categoryId != null) {
      where.push('a.category_id = ?')
      params.push(filters.categoryId)
    }
    if (filters.tag) {
      where.push(`EXISTS (
        SELECT 1 FROM kb_article_tags filter_tag
        WHERE filter_tag.article_id = a.id AND lower(filter_tag.tag) = lower(?)
      )`)
      params.push(filters.tag.toLocaleLowerCase('ru'))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const orderSql =
      filters.sort === 'oldest' ? 'a.created_at ASC, a.id ASC'
        : filters.sort === 'title' ? 'lower(a.title) ASC, a.id ASC'
          : filters.sort === 'published' ? 'a.published_at DESC, a.id DESC'
            : filters.sort === 'created' ? 'a.created_at DESC, a.id DESC'
              : 'a.updated_at DESC, a.id DESC'
    const offset = (filters.page - 1) * filters.limit
    if (filters.search) {
      const needle = filters.search.trim().toLocaleLowerCase('ru')
      const allRows = await db.all<any[]>(
        `${ARTICLE_SELECT}
         ${whereSql}
         ORDER BY ${orderSql}`,
        ...params,
      )
      const matched = allRows.filter((row) => [
        row.title,
        row.excerpt,
        row.content_plain,
        row.category_name,
        row.author_name,
        row.tags_joined,
      ].some((value) => String(value || '').toLocaleLowerCase('ru').includes(needle)))
      const total = matched.length
      return {
        items: matched.slice(offset, offset + filters.limit).map(mapArticle),
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      }
    }
    const countRow = await db.get<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id
       LEFT JOIN users u ON u.id = a.author_user_id
       ${whereSql}`,
      ...params,
    )
    const rows = await db.all<any[]>(
      `${ARTICLE_SELECT}
       ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      ...params,
      filters.limit,
      offset,
    )
    const total = Number(countRow?.total || 0)
    return {
      items: rows.map(mapArticle),
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    }
  }

  static async getArticle(articleId: number, actor: KnowledgeActor, includeDiscussion = true) {
    const db = await getDb()
    const row = await db.get<any>(`${ARTICLE_SELECT} WHERE a.id = ?`, articleId)
    if (!row || !canViewArticleRow(row, actor)) {
      throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
    }
    const article: any = mapArticle(row)
    if (includeDiscussion) {
      const [questions, assets, engagement] = await Promise.all([
        this.listQuestions(db, articleId),
        db.all<any[]>('SELECT * FROM kb_assets WHERE article_id = ? ORDER BY id', articleId),
        loadEngagement(db, articleId, actor),
      ])
      article.questions = questions
      article.assets = assets.map(mapAsset)
      article.engagement = engagement
    }
    return article
  }

  static async recordView(articleId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
    if (!article || !canViewArticleRow(article, actor)) {
      throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
    }
    await db.run(
      `INSERT INTO kb_article_views (article_id, user_id)
       VALUES (?, ?)
       ON CONFLICT(article_id, user_id) DO UPDATE SET
         view_count = view_count + CASE
           WHEN last_viewed_at <= datetime('now','localtime','-15 minutes') THEN 1 ELSE 0
         END,
         last_viewed_at = datetime('now','localtime')`,
      articleId,
      actor.id,
    )
    return loadEngagement(db, articleId, actor)
  }

  static async toggleReaction(articleId: number, actor: KnowledgeActor, reactionValue: unknown) {
    const reaction = String(reactionValue || '').trim()
    if (!KNOWLEDGE_REACTIONS.has(reaction)) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Некорректная реакция')
    }
    const db = await getDb()
    const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
    if (!article || !canViewArticleRow(article, actor)) {
      throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
    }
    await inTransaction(db, async () => {
      const existing = await db.get<{ article_id: number }>(
        `SELECT article_id FROM kb_article_reactions
         WHERE article_id = ? AND user_id = ? AND reaction = ?`,
        articleId,
        actor.id,
        reaction,
      )
      if (existing) {
        await db.run(
          `DELETE FROM kb_article_reactions
           WHERE article_id = ? AND user_id = ? AND reaction = ?`,
          articleId,
          actor.id,
          reaction,
        )
      } else {
        await db.run(
          `INSERT INTO kb_article_reactions (article_id, user_id, reaction)
           VALUES (?, ?, ?)`,
          articleId,
          actor.id,
          reaction,
        )
      }
    })
    return loadEngagement(db, articleId, actor)
  }

  static async createArticle(actor: KnowledgeActor, input: ArticleWriteInput) {
    const db = await getDb()
    const title = cleanTitle(input.title)
    const excerpt = cleanExcerpt(input.excerpt)
    const content = normalizeTipTapContent(input.contentJson)
    const categoryId = optionalCategoryId(input.categoryId)
    const tags = cleanTags(input.tags, [])
    const articleId = await inTransaction(db, async () => {
      await ensureCategory(db, categoryId)
      const slug = await uniqueSlug(db, input.slug, title)
      const inserted = await db.run(
        `INSERT INTO kb_articles
          (title, slug, excerpt, content_json, content_plain, category_id, author_user_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
        title,
        slug,
        excerpt,
        content.json,
        content.plain,
        categoryId,
        actor.id,
      )
      const id = Number(inserted.lastID)
      const revisionId = await insertRevision(db, {
        articleId: id,
        title,
        excerpt,
        contentJson: content.json,
        contentPlain: content.plain,
        categoryId,
        tags,
        editorUserId: actor.id,
        source: 'direct',
      })
      await db.run('UPDATE kb_articles SET current_revision_id = ? WHERE id = ?', revisionId, id)
      await replaceTags(db, id, tags)
      return id
    })
    return this.getArticle(articleId, actor)
  }

  static async updateArticle(articleId: number, actor: KnowledgeActor, input: ArticleWriteInput) {
    const db = await getDb()
    const baseRevisionId = positiveId(input.baseRevisionId, 'baseRevisionId')
    await inTransaction(db, async () => {
      const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
      if (!article) throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
      assertDirectAccess(article, actor)
      assertCurrentRevision(article, baseRevisionId)

      const title = cleanTitle(input.title, String(article.title))
      const excerpt = cleanExcerpt(input.excerpt, String(article.excerpt || ''))
      const content = input.contentJson === undefined
        ? {
          json: String(article.content_json),
          plain: String(article.content_plain || ''),
        }
        : normalizeTipTapContent(input.contentJson)
      const categoryId = input.categoryId === undefined
        ? (article.category_id == null ? null : Number(article.category_id))
        : optionalCategoryId(input.categoryId)
      await ensureCategory(db, categoryId)
      const slug = input.slug === undefined
        ? String(article.slug)
        : await uniqueSlug(db, input.slug, title, articleId)
      const currentTags = await db.all<Array<{ tag: string }>>(
        'SELECT tag FROM kb_article_tags WHERE article_id = ? ORDER BY tag',
        articleId,
      )
      const tags = cleanTags(input.tags, currentTags.map((item) => String(item.tag)))
      const revisionId = await insertRevision(db, {
        articleId,
        title,
        excerpt,
        contentJson: content.json,
        contentPlain: content.plain,
        categoryId,
        tags,
        editorUserId: actor.id,
        source: 'direct',
      })
      await db.run(
        `UPDATE kb_articles
         SET title = ?, slug = ?, excerpt = ?, content_json = ?, content_plain = ?,
             category_id = ?, current_revision_id = ?, updated_at = datetime('now','localtime')
         WHERE id = ?`,
        title,
        slug,
        excerpt,
        content.json,
        content.plain,
        categoryId,
        revisionId,
        articleId,
      )
      await replaceTags(db, articleId, tags)
    })
    return this.getArticle(articleId, actor)
  }

  static async publishArticle(articleId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const result = await inTransaction(db, async () => {
      const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
      if (!article) throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
      assertDirectAccess(article, actor)
      if (!article.current_revision_id) {
        throw new KnowledgeBaseError(409, 'MISSING_REVISION', 'Статья не имеет текущей ревизии')
      }
      const firstPublish = article.published_at == null
      await db.run(
        `UPDATE kb_articles
         SET status = 'published',
             published_at = COALESCE(published_at, datetime('now','localtime')),
             updated_at = datetime('now','localtime')
         WHERE id = ?`,
        articleId,
      )
      return { firstPublish, title: String(article.title || '') }
    })

    if (result.firstPublish) {
      const users = await db.all<Array<{ id: number }>>(
        'SELECT id FROM users WHERE COALESCE(is_active, 1) = 1 AND id <> ?',
        actor.id,
      )
      await UserInboxNotificationService.createMany({
        userIds: users.map((user) => Number(user.id)),
        type: 'kb_article_published',
        title: 'Опубликована статья базы знаний',
        message: result.title,
        actorUserId: actor.id,
        payload: { articleId, path: `/knowledge/articles/${articleId}` },
      })
    }
    return this.getArticle(articleId, actor)
  }

  static async archiveArticle(articleId: number, actor: KnowledgeActor) {
    const db = await getDb()
    await inTransaction(db, async () => {
      const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
      if (!article) throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
      assertDirectAccess(article, actor)
      await db.run(
        `UPDATE kb_articles
         SET status = 'archived', updated_at = datetime('now','localtime')
         WHERE id = ?`,
        articleId,
      )
    })
    return this.getArticle(articleId, actor)
  }

  static async listRevisions(articleId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const article = await db.get<any>('SELECT author_user_id FROM kb_articles WHERE id = ?', articleId)
    if (!article) throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
    assertDirectAccess(article, actor)
    const rows = await db.all<any[]>(
      `SELECT r.*, u.name AS editor_name, u.role AS editor_role
       FROM kb_article_revisions r
       LEFT JOIN users u ON u.id = r.editor_user_id
       WHERE r.article_id = ?
       ORDER BY r.version DESC`,
      articleId,
    )
    return rows.map(mapRevision)
  }

  static async restoreRevision(
    articleId: number,
    revisionId: number,
    actor: KnowledgeActor,
    baseRevisionValue: unknown,
  ) {
    const db = await getDb()
    const baseRevisionId = positiveId(baseRevisionValue, 'baseRevisionId')
    await inTransaction(db, async () => {
      const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
      if (!article) throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
      assertDirectAccess(article, actor)
      assertCurrentRevision(article, baseRevisionId)
      const revision = await db.get<any>(
        'SELECT * FROM kb_article_revisions WHERE id = ? AND article_id = ?',
        revisionId,
        articleId,
      )
      if (!revision) throw new KnowledgeBaseError(404, 'REVISION_NOT_FOUND', 'Ревизия не найдена')
      const revisionCategoryId = revision.category_id == null ? null : Number(revision.category_id)
      await ensureCategory(db, revisionCategoryId)
      let revisionTags: string[] = []
      try {
        const parsedTags = JSON.parse(String(revision.tags_json || '[]'))
        revisionTags = Array.isArray(parsedTags) ? cleanTags(parsedTags) : []
      } catch {
        revisionTags = []
      }
      const restoredRevisionId = await insertRevision(db, {
        articleId,
        title: String(revision.title),
        excerpt: String(revision.excerpt || ''),
        contentJson: String(revision.content_json),
        contentPlain: String(revision.content_plain || ''),
        categoryId: revisionCategoryId,
        tags: revisionTags,
        editorUserId: actor.id,
        source: 'restore',
      })
      await db.run(
        `UPDATE kb_articles
         SET title = ?, excerpt = ?, content_json = ?, content_plain = ?,
             category_id = ?, current_revision_id = ?, updated_at = datetime('now','localtime')
         WHERE id = ?`,
        revision.title,
        revision.excerpt,
        revision.content_json,
        revision.content_plain,
        revisionCategoryId,
        restoredRevisionId,
        articleId,
      )
      await replaceTags(db, articleId, revisionTags)
    })
    return this.getArticle(articleId, actor)
  }

  static async createProposal(articleId: number, actor: KnowledgeActor, input: ProposalWriteInput) {
    const db = await getDb()
    const proposalId = await inTransaction(db, async () => {
      const article = await db.get<any>('SELECT * FROM kb_articles WHERE id = ?', articleId)
      if (!article || !canViewArticleRow(article, actor)) {
        throw new KnowledgeBaseError(404, 'ARTICLE_NOT_FOUND', 'Статья не найдена')
      }
      if (isAdmin(actor) || Number(article.author_user_id) === actor.id) {
        throw new KnowledgeBaseError(403, 'DIRECT_UPDATE_REQUIRED', 'Автор и администратор должны использовать прямое редактирование')
      }
      const baseRevisionId = positiveId(input.baseRevisionId, 'baseRevisionId')
      assertCurrentRevision(article, baseRevisionId)
      const title = cleanTitle(input.title, String(article.title))
      const excerpt = cleanExcerpt(input.excerpt, String(article.excerpt || ''))
      const content = input.contentJson === undefined
        ? { json: String(article.content_json), plain: String(article.content_plain || '') }
        : normalizeTipTapContent(input.contentJson)
      const categoryId = input.categoryId === undefined
        ? (article.category_id == null ? null : Number(article.category_id))
        : optionalCategoryId(input.categoryId)
      await ensureCategory(db, categoryId)
      const currentTags = await db.all<Array<{ tag: string }>>(
        'SELECT tag FROM kb_article_tags WHERE article_id = ? ORDER BY tag',
        articleId,
      )
      const tags = cleanTags(input.tags, currentTags.map((item) => String(item.tag)))
      const proposalNote = cleanProposalNote(input.note)
      const inserted = await db.run(
        `INSERT INTO kb_edit_proposals
          (article_id, base_revision_id, proposer_user_id, title, excerpt, content_json,
           content_plain, proposal_note, category_id, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        articleId,
        baseRevisionId,
        actor.id,
        title,
        excerpt,
        content.json,
        content.plain,
        proposalNote,
        categoryId,
        JSON.stringify(tags),
      )
      return Number(inserted.lastID)
    })

    const article = await db.get<any>('SELECT title, author_user_id FROM kb_articles WHERE id = ?', articleId)
    const admins = await db.all<Array<{ id: number }>>(
      `SELECT id FROM users WHERE role = 'admin' AND COALESCE(is_active, 1) = 1`,
    )
    await UserInboxNotificationService.createMany({
      userIds: [article?.author_user_id, ...admins.map((user) => user.id)],
      type: 'kb_edit_proposed',
      title: 'Предложена правка статьи',
      message: String(article?.title || ''),
      actorUserId: actor.id,
      payload: {
        articleId,
        proposalId,
        path: `/knowledge/proposals/${proposalId}`,
      },
    })
    return this.getProposal(proposalId, actor)
  }

  static async listProposals(actor: KnowledgeActor, status?: string) {
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Некорректный status предложения')
    }
    const db = await getDb()
    const where: string[] = []
    const params: any[] = []
    if (!isAdmin(actor)) {
      where.push('(p.proposer_user_id = ? OR a.author_user_id = ?)')
      params.push(actor.id, actor.id)
    }
    if (status) {
      where.push('p.status = ?')
      params.push(status)
    }
    const rows = await db.all<any[]>(
      `${PROPOSAL_SELECT}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END, p.created_at DESC, p.id DESC`,
      ...params,
    )
    return rows.map(mapProposal)
  }

  static async getProposal(proposalId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const row = await db.get<any>(`${PROPOSAL_SELECT} WHERE p.id = ?`, proposalId)
    if (!row || (!isAdmin(actor)
      && Number(row.proposer_user_id) !== actor.id
      && Number(row.article_author_user_id) !== actor.id)) {
      throw new KnowledgeBaseError(404, 'PROPOSAL_NOT_FOUND', 'Предложение не найдено')
    }
    return mapProposal(row)
  }

  static async reviewProposal(
    proposalId: number,
    actor: KnowledgeActor,
    decisionValue: unknown,
    noteValue: unknown,
  ) {
    const decision = String(decisionValue || '')
    if (decision !== 'approve' && decision !== 'reject') {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'decision должен быть approve или reject')
    }
    const note = noteValue == null ? null : String(noteValue).trim()
    if (note && note.length > 2000) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'note слишком длинный')
    }
    const db = await getDb()
    const result = await inTransaction(db, async () => {
      const proposal = await db.get<any>(
        `SELECT p.*, a.author_user_id AS article_author_user_id,
                a.current_revision_id, a.title AS article_current_title
         FROM kb_edit_proposals p
         JOIN kb_articles a ON a.id = p.article_id
         WHERE p.id = ?`,
        proposalId,
      )
      if (!proposal) throw new KnowledgeBaseError(404, 'PROPOSAL_NOT_FOUND', 'Предложение не найдено')
      if (!isAdmin(actor) && Number(proposal.article_author_user_id) !== actor.id) {
        throw new KnowledgeBaseError(403, 'FORBIDDEN', 'Рассматривать предложение может автор статьи или администратор')
      }
      if (proposal.status !== 'pending') {
        throw new KnowledgeBaseError(409, 'PROPOSAL_ALREADY_REVIEWED', 'Предложение уже рассмотрено')
      }
      if (decision === 'approve') {
        if (Number(proposal.current_revision_id) !== Number(proposal.base_revision_id)) {
          throw new KnowledgeBaseError(
            409,
            'REVISION_CONFLICT',
            'Статья изменилась после создания предложения. Предложение нужно обновить.',
          )
        }
        const proposalCategoryId = proposal.category_id == null ? null : Number(proposal.category_id)
        await ensureCategory(db, proposalCategoryId)
        let proposalTags: string[] = []
        try {
          const parsedTags = JSON.parse(String(proposal.tags_json || '[]'))
          proposalTags = Array.isArray(parsedTags) ? cleanTags(parsedTags) : []
        } catch {
          proposalTags = []
        }
        const revisionId = await insertRevision(db, {
          articleId: Number(proposal.article_id),
          title: String(proposal.title),
          excerpt: String(proposal.excerpt || ''),
          contentJson: String(proposal.content_json),
          contentPlain: String(proposal.content_plain || ''),
          categoryId: proposalCategoryId,
          tags: proposalTags,
          editorUserId: actor.id,
          source: 'proposal',
        })
        await db.run(
          `UPDATE kb_articles
           SET title = ?, excerpt = ?, content_json = ?, content_plain = ?,
               category_id = ?, current_revision_id = ?, updated_at = datetime('now','localtime')
           WHERE id = ?`,
          proposal.title,
          proposal.excerpt,
          proposal.content_json,
          proposal.content_plain,
          proposalCategoryId,
          revisionId,
          proposal.article_id,
        )
        await replaceTags(db, Number(proposal.article_id), proposalTags)
      }
      await db.run(
        `UPDATE kb_edit_proposals
         SET status = ?, reviewer_user_id = ?, review_note = ?,
             reviewed_at = datetime('now','localtime')
         WHERE id = ?`,
        decision === 'approve' ? 'approved' : 'rejected',
        actor.id,
        note,
        proposalId,
      )
      return {
        articleId: Number(proposal.article_id),
        proposerUserId: proposal.proposer_user_id == null ? null : Number(proposal.proposer_user_id),
        articleTitle: decision === 'approve' ? String(proposal.title) : String(proposal.article_current_title),
      }
    })

    await UserInboxNotificationService.createMany({
      userIds: [result.proposerUserId],
      type: 'kb_edit_proposal_resolved',
      title: decision === 'approve' ? 'Правка одобрена' : 'Правка отклонена',
      message: result.articleTitle,
      actorUserId: actor.id,
      payload: {
        articleId: result.articleId,
        proposalId,
        decision,
        path: `/knowledge/proposals/${proposalId}`,
        articlePath: `/knowledge/articles/${result.articleId}`,
      },
    })
    return this.getProposal(proposalId, actor)
  }

  private static async listQuestions(db: Database, articleId: number) {
    const questionRows = await db.all<any[]>(
      `SELECT q.*, u.name AS author_name, u.role AS author_role
       FROM kb_questions q
       LEFT JOIN users u ON u.id = q.author_user_id
       WHERE q.article_id = ?
       ORDER BY q.created_at, q.id`,
      articleId,
    )
    if (!questionRows.length) return []
    const ids = questionRows.map((row) => Number(row.id))
    const placeholders = ids.map(() => '?').join(',')
    const replyRows = await db.all<any[]>(
      `SELECT r.*, u.name AS author_name, u.role AS author_role
       FROM kb_replies r
       LEFT JOIN users u ON u.id = r.author_user_id
       WHERE r.question_id IN (${placeholders})
       ORDER BY r.created_at, r.id`,
      ...ids,
    )
    const repliesByQuestion = new Map<number, any[]>()
    for (const row of replyRows) {
      const questionId = Number(row.question_id)
      const list = repliesByQuestion.get(questionId) || []
      list.push(mapReply(row))
      repliesByQuestion.set(questionId, list)
    }
    return questionRows.map((row) => mapQuestion(row, repliesByQuestion.get(Number(row.id)) || []))
  }

  static async createQuestion(articleId: number, actor: KnowledgeActor, bodyValue: unknown) {
    const article = await this.getArticle(articleId, actor, false)
    const content = normalizeTipTapContent(bodyValue, MAX_DISCUSSION_CONTENT_BYTES)
    if (!content.plain) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Вопрос не может быть пустым')
    }
    const db = await getDb()
    const inserted = await db.run(
      `INSERT INTO kb_questions (article_id, author_user_id, body_json, body_plain)
       VALUES (?, ?, ?, ?)`,
      articleId,
      actor.id,
      content.json,
      content.plain,
    )
    const questionId = Number(inserted.lastID)
    await UserInboxNotificationService.createMany({
      userIds: [article.authorUserId],
      type: 'kb_question_created',
      title: 'Новый вопрос к статье',
      message: article.title,
      actorUserId: actor.id,
      payload: {
        articleId,
        questionId,
        path: `/knowledge/articles/${articleId}#question-${questionId}`,
      },
    })
    const questions = await this.listQuestions(db, articleId)
    return questions.find((question) => question.id === questionId)
  }

  static async createReply(questionId: number, actor: KnowledgeActor, bodyValue: unknown) {
    const db = await getDb()
    const question = await db.get<any>(
      `SELECT q.*, a.title AS article_title, a.status AS article_status,
              a.author_user_id AS article_author_user_id
       FROM kb_questions q
       JOIN kb_articles a ON a.id = q.article_id
       WHERE q.id = ?`,
      questionId,
    )
    if (!question || !canViewArticleRow({
      status: question.article_status,
      author_user_id: question.article_author_user_id,
    }, actor)) {
      throw new KnowledgeBaseError(404, 'QUESTION_NOT_FOUND', 'Вопрос не найден')
    }
    const content = normalizeTipTapContent(bodyValue, MAX_DISCUSSION_CONTENT_BYTES)
    if (!content.plain) {
      throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Ответ не может быть пустым')
    }
    const inserted = await db.run(
      `INSERT INTO kb_replies (question_id, author_user_id, body_json, body_plain)
       VALUES (?, ?, ?, ?)`,
      questionId,
      actor.id,
      content.json,
      content.plain,
    )
    const replyId = Number(inserted.lastID)
    const participants = await db.all<Array<{ author_user_id: number | null }>>(
      `SELECT DISTINCT author_user_id
       FROM kb_replies
       WHERE question_id = ? AND author_user_id IS NOT NULL`,
      questionId,
    )
    await UserInboxNotificationService.createMany({
      userIds: [
        question.article_author_user_id,
        question.author_user_id,
        ...participants.map((row) => row.author_user_id),
      ],
      type: 'kb_reply_created',
      title: 'Новый ответ в базе знаний',
      message: String(question.article_title || ''),
      actorUserId: actor.id,
      payload: {
        articleId: Number(question.article_id),
        questionId,
        replyId,
        path: `/knowledge/articles/${Number(question.article_id)}#question-${questionId}`,
      },
    })
    const row = await db.get<any>(
      `SELECT r.*, u.name AS author_name, u.role AS author_role
       FROM kb_replies r
       LEFT JOIN users u ON u.id = r.author_user_id
       WHERE r.id = ?`,
      replyId,
    )
    return mapReply(row)
  }

  static async resolveQuestion(
    questionId: number,
    actor: KnowledgeActor,
    isResolvedValue: unknown,
  ) {
    const db = await getDb()
    const question = await db.get<any>(
      `SELECT q.*, a.author_user_id AS article_author_user_id
       FROM kb_questions q
       JOIN kb_articles a ON a.id = q.article_id
       WHERE q.id = ?`,
      questionId,
    )
    if (!question) throw new KnowledgeBaseError(404, 'QUESTION_NOT_FOUND', 'Вопрос не найден')
    if (!isAdmin(actor)
      && Number(question.article_author_user_id) !== actor.id
      && Number(question.author_user_id) !== actor.id) {
      throw new KnowledgeBaseError(403, 'FORBIDDEN', 'Недостаточно прав для изменения статуса вопроса')
    }
    const isResolved = isResolvedValue === undefined
      ? true
      : isResolvedValue === true || isResolvedValue === 1 || isResolvedValue === '1'
    await db.run(
      `UPDATE kb_questions
       SET is_resolved = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      isResolved ? 1 : 0,
      questionId,
    )
    const questions = await this.listQuestions(db, Number(question.article_id))
    return questions.find((item) => item.id === questionId)
  }

  static async createAsset(
    articleId: number,
    actor: KnowledgeActor,
    file: { filename: string; originalName: string; mimeType: string; size: number },
  ) {
    await this.getArticle(articleId, actor, false)
    const db = await getDb()
    const perArticle = await db.get<{ count: number; bytes: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM kb_assets WHERE article_id = ? AND uploader_user_id = ?`,
      articleId,
      actor.id,
    )
    const daily = await db.get<{ count: number; bytes: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
       FROM kb_assets
       WHERE uploader_user_id = ? AND created_at >= datetime('now','-1 day')`,
      actor.id,
    )
    if (
      Number(perArticle?.count || 0) >= 50
      || Number(perArticle?.bytes || 0) + file.size > 100 * 1024 * 1024
      || Number(daily?.count || 0) >= 100
      || Number(daily?.bytes || 0) + file.size > 200 * 1024 * 1024
    ) {
      throw new KnowledgeBaseError(429, 'ASSET_QUOTA_EXCEEDED', 'Превышен лимит изображений базы знаний')
    }
    const inserted = await db.run(
      `INSERT INTO kb_assets
        (article_id, uploader_user_id, storage_name, original_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      articleId,
      actor.id,
      file.filename,
      file.originalName,
      file.mimeType,
      file.size,
    )
    const row = await db.get<any>('SELECT * FROM kb_assets WHERE id = ?', inserted.lastID)
    return mapAsset(row)
  }

  static async getAsset(assetId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const row = await db.get<any>(
      `SELECT asset.*, article.status AS article_status,
              article.author_user_id AS article_author_user_id
       FROM kb_assets asset
       JOIN kb_articles article ON article.id = asset.article_id
       WHERE asset.id = ?`,
      assetId,
    )
    if (!row || !canViewArticleRow({
      status: row.article_status,
      author_user_id: row.article_author_user_id,
    }, actor)) {
      throw new KnowledgeBaseError(404, 'ASSET_NOT_FOUND', 'Файл не найден')
    }
    return { ...mapAsset(row), storageName: String(row.storage_name) }
  }

  static async deleteAsset(assetId: number, actor: KnowledgeActor) {
    const db = await getDb()
    const row = await db.get<any>(
      `SELECT asset.*, article.author_user_id AS article_author_user_id
       FROM kb_assets asset
       JOIN kb_articles article ON article.id = asset.article_id
       WHERE asset.id = ?`,
      assetId,
    )
    if (!row) throw new KnowledgeBaseError(404, 'ASSET_NOT_FOUND', 'Файл не найден')
    if (!isAdmin(actor) && Number(row.article_author_user_id) !== actor.id) {
      throw new KnowledgeBaseError(403, 'FORBIDDEN', 'Удалить файл может автор статьи или администратор')
    }
    await db.run('DELETE FROM kb_assets WHERE id = ?', assetId)
    return { storageName: String(row.storage_name) }
  }
}
