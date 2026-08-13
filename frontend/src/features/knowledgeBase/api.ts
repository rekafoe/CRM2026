import { apiClient, postMultipartUpload } from '../../api/client';
import { parseKnowledgeContent } from './content';
import type {
  KnowledgeArticle,
  KnowledgeArticleFilters,
  KnowledgeArticleInput,
  KnowledgeArticleEngagement,
  KnowledgeCategory,
  KnowledgeProposal,
  KnowledgeQuestion,
  KnowledgeReply,
  KnowledgeRevision,
  KnowledgeReactionType,
  PaginatedKnowledgeArticles,
} from './types';

type AnyRecord = Record<string, any>;
const base = '/knowledge';

function unwrap<T = unknown>(value: any): T {
  return (value?.data?.data ?? value?.data ?? value) as T;
}

function valueOf<T = unknown>(raw: AnyRecord, camel: string, snake: string, fallback?: T): T {
  return (raw?.[camel] ?? raw?.[snake] ?? fallback) as T;
}

function normalizeUser(raw: any) {
  if (!raw || typeof raw !== 'object') return undefined;
  return { id: Number(raw.id), name: String(raw.name ?? raw.full_name ?? raw.email ?? 'Пользователь'), role: raw.role };
}

export function normalizeCategory(raw: AnyRecord): KnowledgeCategory {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? raw.title ?? 'Без категории'),
    slug: raw.slug,
    description: raw.description,
    articleCount: Number(valueOf(raw, 'articleCount', 'article_count', 0)),
  };
}

function normalizeReply(raw: AnyRecord): KnowledgeReply {
  return {
    id: Number(raw.id),
    questionId: Number(valueOf(raw, 'questionId', 'question_id', 0)),
    content: String(raw.content ?? raw.text ?? ''),
    authorUserId: Number(valueOf(raw, 'authorUserId', 'author_user_id', 0)),
    author: normalizeUser(raw.author ?? raw.user),
    createdAt: String(valueOf(raw, 'createdAt', 'created_at', '')),
  };
}

function normalizeQuestion(raw: AnyRecord): KnowledgeQuestion {
  const replies = raw.replies ?? raw.answers ?? [];
  return {
    id: Number(raw.id),
    articleId: Number(valueOf(raw, 'articleId', 'article_id', 0)),
    content: String(raw.content ?? raw.text ?? raw.question ?? ''),
    authorUserId: Number(valueOf(raw, 'authorUserId', 'author_user_id', 0)),
    author: normalizeUser(raw.author ?? raw.user),
    replies: Array.isArray(replies) ? replies.map(normalizeReply) : [],
    isResolved: Boolean(valueOf(raw, 'isResolved', 'is_resolved', raw.resolved)),
    createdAt: String(valueOf(raw, 'createdAt', 'created_at', '')),
  };
}

const reactionTypes: KnowledgeReactionType[] = ['like', 'heart', 'celebrate', 'insightful'];

function normalizeEngagement(raw: AnyRecord = {}): KnowledgeArticleEngagement {
  const sourceReactions = Array.isArray(raw.reactions) ? raw.reactions : [];
  return {
    totalViews: Number(raw.totalViews ?? raw.total_views ?? 0),
    uniqueViewers: Number(raw.uniqueViewers ?? raw.unique_viewers ?? 0),
    totalReactions: Number(raw.totalReactions ?? raw.total_reactions ?? 0),
    viewers: (Array.isArray(raw.viewers) ? raw.viewers : []).map((item: AnyRecord) => ({
      user: normalizeUser(item.user) ?? { id: 0, name: 'Пользователь' },
      viewCount: Number(item.viewCount ?? item.view_count ?? 0),
      firstViewedAt: String(item.firstViewedAt ?? item.first_viewed_at ?? ''),
      lastViewedAt: String(item.lastViewedAt ?? item.last_viewed_at ?? ''),
    })),
    reactions: reactionTypes.map((type) => {
      const item = sourceReactions.find((reaction: AnyRecord) => reaction.type === type) ?? {};
      return {
        type,
        count: Number(item.count ?? 0),
        users: (Array.isArray(item.users) ? item.users : []).map(normalizeUser).filter(Boolean),
      };
    }),
    myReactions: (Array.isArray(raw.myReactions ?? raw.my_reactions) ? raw.myReactions ?? raw.my_reactions : [])
      .filter((type: unknown): type is KnowledgeReactionType => reactionTypes.includes(type as KnowledgeReactionType)),
  };
}

export function normalizeRevision(raw: AnyRecord): KnowledgeRevision {
  return {
    id: Number(raw.id),
    articleId: Number(valueOf(raw, 'articleId', 'article_id', 0)),
    revisionNumber: Number(valueOf(raw, 'revisionNumber', 'revision_number', 0)) || undefined,
    title: String(raw.title ?? ''),
    excerpt: raw.excerpt,
    contentJson: parseKnowledgeContent(valueOf(raw, 'contentJson', 'content_json')),
    contentPlain: valueOf(raw, 'contentPlain', 'content_plain', ''),
    categoryId: Number(valueOf(raw, 'categoryId', 'category_id', 0)) || null,
    tags: Array.isArray(raw.tags)
      ? raw.tags.map(String)
      : typeof raw.tags_json === 'string'
        ? (() => {
          try {
            const tags = JSON.parse(raw.tags_json);
            return Array.isArray(tags) ? tags.map(String) : [];
          } catch {
            return [];
          }
        })()
        : [],
    authorUserId: Number(valueOf(raw, 'authorUserId', 'author_user_id', 0)) || undefined,
    author: normalizeUser(raw.author ?? raw.user),
    createdAt: String(valueOf(raw, 'createdAt', 'created_at', '')),
  };
}

export function normalizeArticle(raw: AnyRecord): KnowledgeArticle {
  const categoryRaw = raw.category;
  const questions = raw.questions ?? [];
  const revisions = raw.revisions ?? [];
  return {
    id: Number(raw.id),
    title: String(raw.title ?? 'Без названия'),
    excerpt: String(raw.excerpt ?? raw.summary ?? ''),
    contentJson: parseKnowledgeContent(valueOf(raw, 'contentJson', 'content_json')),
    contentPlain: String(valueOf(raw, 'contentPlain', 'content_plain', '')),
    categoryId: Number(valueOf(raw, 'categoryId', 'category_id', categoryRaw?.id)) || null,
    authorUserId: Number(valueOf(raw, 'authorUserId', 'author_user_id', raw.author?.id)),
    currentRevisionId: Number(valueOf(raw, 'currentRevisionId', 'current_revision_id', 0)) || null,
    status: raw.status ?? 'draft',
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : typeof raw.tags === 'string' ? raw.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [],
    author: normalizeUser(raw.author ?? raw.user),
    category: categoryRaw ? normalizeCategory(categoryRaw) : undefined,
    questions: Array.isArray(questions) ? questions.map(normalizeQuestion) : [],
    revisions: Array.isArray(revisions) ? revisions.map(normalizeRevision) : [],
    engagement: normalizeEngagement(raw.engagement),
    createdAt: String(valueOf(raw, 'createdAt', 'created_at', '')),
    updatedAt: String(valueOf(raw, 'updatedAt', 'updated_at', '')),
    publishedAt: valueOf(raw, 'publishedAt', 'published_at', null),
  };
}

export function normalizeProposal(raw: AnyRecord): KnowledgeProposal {
  const proposed = raw.proposed ?? raw.changes ?? raw.proposed_data ?? raw;
  const hasFullArticle = raw.article && (raw.article.contentJson != null || raw.article.content_json != null);
  return {
    id: Number(raw.id),
    articleId: Number(valueOf(raw, 'articleId', 'article_id', raw.article?.id)),
    authorUserId: Number(valueOf(raw, 'authorUserId', 'author_user_id', raw.author?.id)),
    status: raw.status ?? 'pending',
    note: raw.note ?? raw.message,
    reviewNote: valueOf(raw, 'reviewNote', 'review_note', ''),
    article: hasFullArticle ? normalizeArticle(raw.article) : undefined,
    author: normalizeUser(raw.author ?? raw.user),
    title: proposed.title,
    excerpt: proposed.excerpt,
    contentJson: parseKnowledgeContent(valueOf(proposed, 'contentJson', 'content_json')),
    contentPlain: valueOf(proposed, 'contentPlain', 'content_plain', ''),
    categoryId: Number(valueOf(proposed, 'categoryId', 'category_id', 0)) || null,
    tags: Array.isArray(proposed.tags) ? proposed.tags.map(String) : undefined,
    createdAt: String(valueOf(raw, 'createdAt', 'created_at', '')),
    reviewedAt: valueOf(raw, 'reviewedAt', 'reviewed_at', null),
  };
}

export const knowledgeApi = {
  async getCategories(): Promise<KnowledgeCategory[]> {
    const response = await apiClient.get(`${base}/categories`);
    const raw: any = unwrap(response);
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.categories ?? [];
    return items.map(normalizeCategory);
  },

  async getArticles(filters: KnowledgeArticleFilters): Promise<PaginatedKnowledgeArticles> {
    const params = {
      ...filters,
      category_id: filters.categoryId,
      categoryId: undefined,
    };
    const response = await apiClient.get(`${base}/articles`, { params });
    const raw: any = unwrap(response);
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.articles ?? raw?.data ?? [];
    const page = Number(raw?.page ?? raw?.meta?.page ?? filters.page ?? 1);
    const limit = Number(raw?.limit ?? raw?.meta?.limit ?? filters.limit ?? 12);
    const total = Number(raw?.total ?? raw?.meta?.total ?? items.length);
    return {
      items: items.map(normalizeArticle),
      page,
      limit,
      total,
      totalPages: Number(raw?.totalPages ?? raw?.total_pages ?? raw?.meta?.totalPages ?? Math.max(1, Math.ceil(total / limit))),
    };
  },

  async createArticle(input: KnowledgeArticleInput): Promise<KnowledgeArticle> {
    const response = await apiClient.post(`${base}/articles`, input);
    return normalizeArticle(unwrap(response));
  },

  async getArticle(id: number): Promise<KnowledgeArticle> {
    const response = await apiClient.get(`${base}/articles/${id}`);
    return normalizeArticle(unwrap(response));
  },

  async updateArticle(id: number, input: KnowledgeArticleInput): Promise<KnowledgeArticle> {
    const response = await apiClient.put(`${base}/articles/${id}`, input);
    return normalizeArticle(unwrap(response));
  },

  async publishArticle(id: number): Promise<KnowledgeArticle> {
    const response = await apiClient.post(`${base}/articles/${id}/publish`);
    return normalizeArticle(unwrap(response));
  },

  async archiveArticle(id: number): Promise<KnowledgeArticle> {
    const response = await apiClient.post(`${base}/articles/${id}/archive`);
    return normalizeArticle(unwrap(response));
  },

  async recordView(id: number): Promise<KnowledgeArticleEngagement> {
    const response = await apiClient.post(`${base}/articles/${id}/views`);
    return normalizeEngagement(unwrap(response));
  },

  async toggleReaction(id: number, reaction: KnowledgeReactionType): Promise<KnowledgeArticleEngagement> {
    const response = await apiClient.post(`${base}/articles/${id}/reactions`, { reaction });
    return normalizeEngagement(unwrap(response));
  },

  async getRevisions(id: number): Promise<KnowledgeRevision[]> {
    const response = await apiClient.get(`${base}/articles/${id}/revisions`);
    const raw: any = unwrap(response);
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.revisions ?? [];
    return items.map(normalizeRevision);
  },

  async restoreRevision(articleId: number, revisionId: number, baseRevisionId: number): Promise<KnowledgeArticle> {
    const response = await apiClient.post(`${base}/articles/${articleId}/revisions/${revisionId}/restore`, { baseRevisionId });
    return normalizeArticle(unwrap(response));
  },

  async createProposal(articleId: number, input: KnowledgeArticleInput & { note?: string }): Promise<KnowledgeProposal> {
    const response = await apiClient.post(`${base}/articles/${articleId}/proposals`, input);
    return normalizeProposal(unwrap(response));
  },

  async getProposals(): Promise<KnowledgeProposal[]> {
    const response = await apiClient.get(`${base}/proposals`);
    const raw: any = unwrap(response);
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.proposals ?? [];
    return items.map(normalizeProposal);
  },

  async getProposal(id: number): Promise<KnowledgeProposal> {
    const response = await apiClient.get(`${base}/proposals/${id}`);
    return normalizeProposal(unwrap(response));
  },

  async reviewProposal(id: number, decision: 'approve' | 'reject', note?: string): Promise<KnowledgeProposal> {
    const response = await apiClient.post(`${base}/proposals/${id}/review`, { decision, status: decision === 'approve' ? 'approved' : 'rejected', note });
    return normalizeProposal(unwrap(response));
  },

  async addQuestion(articleId: number, content: string): Promise<KnowledgeQuestion> {
    const response = await apiClient.post(`${base}/articles/${articleId}/questions`, {
      bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] },
    });
    return normalizeQuestion(unwrap(response));
  },

  async addReply(questionId: number, content: string): Promise<KnowledgeReply> {
    const response = await apiClient.post(`${base}/questions/${questionId}/replies`, {
      bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] },
    });
    return normalizeReply(unwrap(response));
  },

  async resolveQuestion(questionId: number): Promise<KnowledgeQuestion> {
    const response = await apiClient.patch(`${base}/questions/${questionId}/resolve`);
    return normalizeQuestion(unwrap(response));
  },

  async uploadAsset(articleId: number, file: File): Promise<{ id: number; [key: string]: unknown }> {
    const form = new FormData();
    form.append('file', file);
    const raw: any = await postMultipartUpload(`${base}/articles/${articleId}/assets`, form);
    const asset = raw?.asset ?? raw;
    return { ...asset, id: Number(asset?.id ?? asset?.asset_id) };
  },

  async getAssetContent(assetId: number): Promise<Blob> {
    const response = await apiClient.get(`${base}/assets/${assetId}/content`, { responseType: 'blob' });
    return response.data as Blob;
  },
};
