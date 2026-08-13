export type KnowledgeArticleStatus = 'draft' | 'published' | 'archived';
export type KnowledgeProposalStatus = 'pending' | 'approved' | 'rejected';
export type KnowledgeReactionType = 'like' | 'heart' | 'celebrate' | 'insightful';

export interface KnowledgeUser {
  id: number;
  name: string;
  role?: string;
}

export interface KnowledgeCategory {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  articleCount?: number;
}

export type KnowledgeContent = Record<string, unknown>;

export interface KnowledgeArticleEngagement {
  totalViews: number;
  uniqueViewers: number;
  totalReactions: number;
  viewers: Array<{
    user: KnowledgeUser;
    viewCount: number;
    firstViewedAt: string;
    lastViewedAt: string;
  }>;
  reactions: Array<{
    type: KnowledgeReactionType;
    count: number;
    users: KnowledgeUser[];
  }>;
  myReactions: KnowledgeReactionType[];
}

export interface KnowledgeReply {
  id: number;
  questionId: number;
  content: string;
  authorUserId: number;
  author?: KnowledgeUser;
  createdAt: string;
}

export interface KnowledgeQuestion {
  id: number;
  articleId: number;
  content: string;
  authorUserId: number;
  author?: KnowledgeUser;
  replies: KnowledgeReply[];
  isResolved: boolean;
  createdAt: string;
}

export interface KnowledgeRevision {
  id: number;
  articleId: number;
  revisionNumber?: number;
  title: string;
  excerpt?: string;
  contentJson: KnowledgeContent;
  contentPlain?: string;
  categoryId?: number | null;
  tags?: string[];
  authorUserId?: number;
  author?: KnowledgeUser;
  createdAt: string;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  excerpt: string;
  contentJson: KnowledgeContent;
  contentPlain: string;
  categoryId: number | null;
  authorUserId: number;
  currentRevisionId: number | null;
  status: KnowledgeArticleStatus;
  tags: string[];
  author?: KnowledgeUser;
  category?: KnowledgeCategory;
  questions: KnowledgeQuestion[];
  revisions: KnowledgeRevision[];
  engagement: KnowledgeArticleEngagement;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface KnowledgeProposal {
  id: number;
  articleId: number;
  authorUserId: number;
  status: KnowledgeProposalStatus;
  note?: string;
  reviewNote?: string;
  article?: KnowledgeArticle;
  author?: KnowledgeUser;
  title?: string;
  excerpt?: string;
  contentJson: KnowledgeContent;
  contentPlain?: string;
  categoryId?: number | null;
  tags?: string[];
  createdAt: string;
  reviewedAt?: string | null;
}

export interface KnowledgeArticleInput {
  title: string;
  excerpt?: string;
  contentJson: KnowledgeContent;
  contentPlain?: string;
  categoryId?: number | null;
  status?: KnowledgeArticleStatus;
  tags?: string[];
  baseRevisionId?: number;
}

export interface KnowledgeArticleFilters {
  search?: string;
  categoryId?: number;
  tag?: string;
  scope?: string;
  status?: KnowledgeArticleStatus;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PaginatedKnowledgeArticles {
  items: KnowledgeArticle[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
