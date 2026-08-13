import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20260813210000_create_knowledge_base'
import { getDb } from '../config/database'
import { KnowledgeBaseError, KnowledgeBaseService } from '../modules/knowledge-base/knowledgeBaseService'
import { UserInboxNotificationService } from '../services/userInboxNotificationService'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

jest.mock('../services/userInboxNotificationService', () => ({
  UserInboxNotificationService: {
    createMany: jest.fn().mockResolvedValue(undefined),
  },
}))

const content = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('KnowledgeBaseService critical access and revisions', () => {
  let db: Database
  const author = { id: 1, role: 'user' }
  const editor = { id: 2, role: 'manager' }

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE user_inbox_notifications (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        type TEXT,
        title TEXT,
        message TEXT
      );
      INSERT INTO users (id, name, role, is_active) VALUES
        (1, 'Автор', 'user', 1),
        (2, 'Редактор', 'manager', 1),
        (3, 'Администратор', 'admin', 1);
    `)
    await up(db)
    ;(getDb as jest.Mock).mockResolvedValue(db)
    ;(UserInboxNotificationService.createMany as jest.Mock).mockClear()
  })

  afterEach(async () => {
    await db.close()
    jest.clearAllMocks()
  })

  it('hides drafts, publishes to all users and blocks foreign direct updates', async () => {
    const article = await KnowledgeBaseService.createArticle(author, {
      title: 'Настройка резака',
      contentJson: content('Черновик'),
      tags: ['оборудование'],
    })

    expect(article.status).toBe('draft')
    expect(article.currentRevisionId).toBeGreaterThan(0)
    await expect(KnowledgeBaseService.listArticles(editor, {
      page: 1,
      limit: 20,
    })).resolves.toMatchObject({ total: 0 })

    await KnowledgeBaseService.publishArticle(article.id, author)
    await expect(KnowledgeBaseService.listArticles(editor, {
      page: 1,
      limit: 20,
      search: 'оборудование',
    })).resolves.toMatchObject({ total: 1 })
    expect(UserInboxNotificationService.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kb_article_published',
        userIds: expect.arrayContaining([2, 3]),
      }),
    )

    await expect(KnowledgeBaseService.updateArticle(article.id, editor, {
      baseRevisionId: article.currentRevisionId,
      title: 'Чужая правка',
    })).rejects.toMatchObject<Partial<KnowledgeBaseError>>({ status: 403 })
  })

  it('approves a proposal atomically and creates a proposal revision', async () => {
    const article = await KnowledgeBaseService.createArticle(author, {
      title: 'Материалы',
      contentJson: content('Исходный текст'),
    })
    await KnowledgeBaseService.publishArticle(article.id, author)
    const category = await db.get<{ id: number }>(
      `SELECT id FROM kb_categories WHERE slug = 'materialy'`,
    )
    const proposal = await KnowledgeBaseService.createProposal(article.id, editor, {
      baseRevisionId: article.currentRevisionId,
      title: 'Материалы для печати',
      contentJson: content('Обновлённый текст'),
      categoryId: category!.id,
      tags: ['плёнка', 'печать'],
      note: 'Добавил практический опыт',
    })

    const reviewed = await KnowledgeBaseService.reviewProposal(
      proposal.id,
      author,
      'approve',
      'Проверено',
    )
    const updated = await KnowledgeBaseService.getArticle(article.id, author)
    const revisions = await KnowledgeBaseService.listRevisions(article.id, author)

    expect(reviewed.status).toBe('approved')
    expect(reviewed.note).toBe('Добавил практический опыт')
    expect(updated.title).toBe('Материалы для печати')
    expect(updated.categoryId).toBe(category!.id)
    expect(updated.tags).toEqual(expect.arrayContaining(['плёнка', 'печать']))
    expect(revisions[0]).toMatchObject({ source: 'proposal', version: 2 })
  })

  it('returns 409 when a proposal base revision became stale', async () => {
    const article = await KnowledgeBaseService.createArticle(author, {
      title: 'Регламент',
      contentJson: content('Версия один'),
    })
    await KnowledgeBaseService.publishArticle(article.id, author)
    const proposal = await KnowledgeBaseService.createProposal(article.id, editor, {
      baseRevisionId: article.currentRevisionId,
      contentJson: content('Предложенная версия'),
    })
    await KnowledgeBaseService.updateArticle(article.id, author, {
      baseRevisionId: article.currentRevisionId,
      contentJson: content('Версия автора'),
    })

    await expect(KnowledgeBaseService.reviewProposal(
      proposal.id,
      author,
      'approve',
      null,
    )).rejects.toMatchObject<Partial<KnowledgeBaseError>>({
      status: 409,
      code: 'REVISION_CONFLICT',
    })
  })

  it('does not let an uploader delete an asset from another author article', async () => {
    const article = await KnowledgeBaseService.createArticle(author, {
      title: 'Изображения',
      contentJson: content('Инструкция'),
    })
    await KnowledgeBaseService.publishArticle(article.id, author)
    const asset = await KnowledgeBaseService.createAsset(article.id, editor, {
      filename: 'asset.png',
      originalName: 'asset.png',
      mimeType: 'image/png',
      size: 1024,
    })

    await expect(KnowledgeBaseService.deleteAsset(asset.id, editor))
      .rejects.toMatchObject<Partial<KnowledgeBaseError>>({ status: 403 })
    await expect(KnowledgeBaseService.deleteAsset(asset.id, author))
      .resolves.toMatchObject({ storageName: 'asset.png' })
  })

  it('tracks viewers and toggles reactions without inbox notifications', async () => {
    const article = await KnowledgeBaseService.createArticle(author, {
      title: 'Просмотры',
      contentJson: content('Полезная статья'),
    })
    await KnowledgeBaseService.publishArticle(article.id, author)
    ;(UserInboxNotificationService.createMany as jest.Mock).mockClear()

    await KnowledgeBaseService.recordView(article.id, editor)
    await KnowledgeBaseService.recordView(article.id, editor)
    await KnowledgeBaseService.recordView(article.id, author)
    await KnowledgeBaseService.toggleReaction(article.id, editor, 'like')
    await KnowledgeBaseService.toggleReaction(article.id, editor, 'heart')
    await KnowledgeBaseService.toggleReaction(article.id, author, 'like')

    const withEngagement = await KnowledgeBaseService.getArticle(article.id, author)
    expect(withEngagement.engagement).toMatchObject({
      totalViews: 2,
      uniqueViewers: 2,
      myReactions: ['like'],
    })
    expect(withEngagement.engagement.reactions.find((item: any) => item.type === 'like').count).toBe(2)

    const afterToggle = await KnowledgeBaseService.toggleReaction(article.id, editor, 'like')
    expect(afterToggle.reactions.find((item: any) => item.type === 'like').count).toBe(1)
    expect(UserInboxNotificationService.createMany).not.toHaveBeenCalled()
  })
})
