export type KnowledgeArticleStatus = 'draft' | 'published' | 'archived'
export type KnowledgeProposalStatus = 'pending' | 'approved' | 'rejected'
export type KnowledgeRevisionSource = 'direct' | 'proposal' | 'restore'

export interface KnowledgeActor {
  id: number
  role: string
}

export interface NormalizedContent {
  value: Record<string, unknown>
  json: string
  plain: string
}

export interface ArticleWriteInput {
  title?: unknown
  slug?: unknown
  excerpt?: unknown
  contentJson?: unknown
  categoryId?: unknown
  tags?: unknown
  baseRevisionId?: unknown
}

export interface ArticleListFilters {
  search?: string
  categoryId?: number
  tag?: string
  scope?: 'my'
  status?: KnowledgeArticleStatus
  page: number
  limit: number
  sort?: string
}

export interface ProposalWriteInput {
  baseRevisionId?: unknown
  title?: unknown
  excerpt?: unknown
  contentJson?: unknown
  categoryId?: unknown
  tags?: unknown
  note?: unknown
}
