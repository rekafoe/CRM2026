import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from './api';
import type { KnowledgeArticleFilters, KnowledgeArticleInput } from './types';

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  categories: () => [...knowledgeKeys.all, 'categories'] as const,
  articles: () => [...knowledgeKeys.all, 'articles'] as const,
  articleList: (filters: KnowledgeArticleFilters) => [...knowledgeKeys.articles(), 'list', filters] as const,
  article: (id: number) => [...knowledgeKeys.articles(), id] as const,
  revisions: (id: number) => [...knowledgeKeys.article(id), 'revisions'] as const,
  proposals: () => [...knowledgeKeys.all, 'proposals'] as const,
  proposal: (id: number) => [...knowledgeKeys.proposals(), id] as const,
};

export const useKnowledgeCategories = () =>
  useQuery({ queryKey: knowledgeKeys.categories(), queryFn: knowledgeApi.getCategories });

export const useKnowledgeArticles = (filters: KnowledgeArticleFilters) =>
  useQuery({ queryKey: knowledgeKeys.articleList(filters), queryFn: () => knowledgeApi.getArticles(filters) });

export const useKnowledgeArticle = (id: number) =>
  useQuery({ queryKey: knowledgeKeys.article(id), queryFn: () => knowledgeApi.getArticle(id), enabled: Number.isFinite(id) && id > 0 });

export const useKnowledgeRevisions = (articleId: number, enabled = true) =>
  useQuery({
    queryKey: knowledgeKeys.revisions(articleId),
    queryFn: () => knowledgeApi.getRevisions(articleId),
    enabled: enabled && articleId > 0,
  });

export const useKnowledgeProposals = () =>
  useQuery({ queryKey: knowledgeKeys.proposals(), queryFn: knowledgeApi.getProposals });

export const useKnowledgeProposal = (id: number) =>
  useQuery({ queryKey: knowledgeKeys.proposal(id), queryFn: () => knowledgeApi.getProposal(id), enabled: id > 0 });

export function useCreateKnowledgeArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: KnowledgeArticleInput) => knowledgeApi.createArticle(input),
    onSuccess: () => client.invalidateQueries({ queryKey: knowledgeKeys.articles() }),
  });
}

export function useUpdateKnowledgeArticle(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: KnowledgeArticleInput) => knowledgeApi.updateArticle(id, input),
    onSuccess: (article) => {
      client.setQueryData(knowledgeKeys.article(id), article);
      client.invalidateQueries({ queryKey: knowledgeKeys.articles() });
      client.invalidateQueries({ queryKey: knowledgeKeys.revisions(id) });
    },
  });
}

export function useInvalidateKnowledgeArticle(id: number) {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: knowledgeKeys.article(id) });
    client.invalidateQueries({ queryKey: knowledgeKeys.articles() });
  };
}
