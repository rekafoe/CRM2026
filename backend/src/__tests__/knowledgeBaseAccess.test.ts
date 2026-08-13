import {
  canDirectEditKnowledgeArticle,
  canViewKnowledgeArticle,
} from '../modules/knowledge-base/access'

const author = { id: 10, role: 'user' }
const otherUser = { id: 20, role: 'manager' }
const admin = { id: 30, role: 'admin' }

describe('knowledge base access rules', () => {
  it('shows published articles to every authenticated CRM user', () => {
    expect(canViewKnowledgeArticle(
      { status: 'published', author_user_id: author.id },
      otherUser,
    )).toBe(true)
  })

  it('keeps drafts and archived articles private to their author and admins', () => {
    for (const status of ['draft', 'archived']) {
      const article = { status, author_user_id: author.id }
      expect(canViewKnowledgeArticle(article, author)).toBe(true)
      expect(canViewKnowledgeArticle(article, admin)).toBe(true)
      expect(canViewKnowledgeArticle(article, otherUser)).toBe(false)
    }
  })

  it('allows direct edits only to the author or an admin', () => {
    const article = { author_user_id: author.id }
    expect(canDirectEditKnowledgeArticle(article, author)).toBe(true)
    expect(canDirectEditKnowledgeArticle(article, admin)).toBe(true)
    expect(canDirectEditKnowledgeArticle(article, otherUser)).toBe(false)
  })
})
