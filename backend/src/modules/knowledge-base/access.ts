import { KnowledgeActor } from './types'

export interface KnowledgeArticleAccessRow {
  status: string
  author_user_id: number | null
}

export function isKnowledgeAdmin(actor: KnowledgeActor): boolean {
  return actor.role === 'admin'
}

export function canViewKnowledgeArticle(
  article: KnowledgeArticleAccessRow,
  actor: KnowledgeActor,
): boolean {
  return article.status === 'published'
    || isKnowledgeAdmin(actor)
    || Number(article.author_user_id) === actor.id
}

export function canDirectEditKnowledgeArticle(
  article: Pick<KnowledgeArticleAccessRow, 'author_user_id'>,
  actor: KnowledgeActor,
): boolean {
  return isKnowledgeAdmin(actor) || Number(article.author_user_id) === actor.id
}
