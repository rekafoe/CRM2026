import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppIcon } from '../../../components/ui/AppIcon';
import { useToastNotifications } from '../../../components/Toast';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { knowledgeApi } from '../api';
import { knowledgeKeys, useKnowledgeArticle, useKnowledgeCategories, useKnowledgeProposal } from '../hooks';
import { KnowledgeContent } from '../components/KnowledgeContent';
import { KnowledgeShell } from '../components/KnowledgeShell';

export const KnowledgeProposalPage: React.FC = () => {
  const proposalId = Number(useParams().id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToastNotifications();
  const currentUser = useCurrentUser();
  const proposalQuery = useKnowledgeProposal(proposalId);
  const proposal = proposalQuery.data;
  const articleQuery = useKnowledgeArticle(proposal?.articleId ?? 0);
  const categoriesQuery = useKnowledgeCategories();
  const article = articleQuery.data ?? proposal?.article;
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const canReview = Boolean(currentUser && article && (currentUser.role === 'admin' || article.authorUserId === currentUser.id));
  const review = async (decision: 'approve' | 'reject') => {
    setReviewing(true);
    try {
      await knowledgeApi.reviewProposal(proposalId, decision, note.trim() || undefined);
      await client.invalidateQueries({ queryKey: knowledgeKeys.all });
      toast.success(decision === 'approve' ? 'Изменения приняты' : 'Предложение отклонено');
      navigate(`/knowledge/articles/${proposal!.articleId}`);
    } catch (error: any) {
      toast.error('Не удалось обработать предложение', error?.response?.data?.message ?? error?.message);
    } finally {
      setReviewing(false);
    }
  };

  if (proposalQuery.isLoading || (proposal && articleQuery.isLoading && !proposal.article)) {
    return <KnowledgeShell><div className="kb-state"><span className="kb-spinner" /> Загружаем предложение…</div></KnowledgeShell>;
  }
  if (proposalQuery.isError || !proposal || !article) {
    return <KnowledgeShell><div className="kb-state kb-state--error"><AppIcon name="warning" size="xl" /><h2>Предложение не найдено</h2><button className="kb-button" onClick={() => navigate('/knowledge')}>В каталог</button></div></KnowledgeShell>;
  }
  const proposedCategory = categoriesQuery.data?.find((item) => item.id === proposal.categoryId);

  return (
    <KnowledgeShell>
      <div className="kb-proposal-page">
        <header className="kb-proposal-header">
          <div>
            <button className="kb-link-button" onClick={() => navigate(`/knowledge/articles/${article.id}`)}><AppIcon name="arrow-left" size="sm" /> К статье</button>
            <p className="kb-eyebrow">Предложение от {proposal.author?.name ?? 'пользователя'}</p>
            <h1>Проверка изменений</h1>
            {proposal.note && <p className="kb-proposal-note">«{proposal.note}»</p>}
          </div>
          <span className={`kb-status kb-status--${proposal.status}`}>{proposal.status === 'pending' ? 'Ожидает проверки' : proposal.status === 'approved' ? 'Принято' : 'Отклонено'}</span>
        </header>

        <div className="kb-compare">
          <section>
            <header><span>Текущая версия</span><small>Опубликованный материал</small></header>
            <div className="kb-compare-body">
              <h1>{article.title}</h1>
              {article.excerpt && <p className="kb-article-lead">{article.excerpt}</p>}
              <p className="kb-muted">Категория: {article.category?.name ?? 'Без категории'}</p>
              <div className="kb-tags">{article.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
              <KnowledgeContent content={article.contentJson} />
            </div>
          </section>
          <section className="kb-compare-proposed">
            <header><span>Предложенная версия</span><small>Новые изменения</small></header>
            <div className="kb-compare-body">
              <h1>{proposal.title ?? article.title}</h1>
              {(proposal.excerpt ?? article.excerpt) && <p className="kb-article-lead">{proposal.excerpt ?? article.excerpt}</p>}
              <p className="kb-muted">Категория: {proposedCategory?.name ?? 'Без категории'}</p>
              <div className="kb-tags">{(proposal.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}</div>
              <KnowledgeContent content={proposal.contentJson} />
            </div>
          </section>
        </div>

        {proposal.status === 'pending' && canReview && (
          <section className="kb-review-panel">
            <label>Комментарий к решению
              <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Необязательно. Объясните решение автору правки." />
            </label>
            <div>
              <button className="kb-button kb-button--danger" disabled={reviewing} onClick={() => review('reject')}><AppIcon name="x" size="sm" /> Отклонить</button>
              <button className="kb-button kb-button--primary" disabled={reviewing} onClick={() => review('approve')}><AppIcon name="check" size="sm" /> Принять изменения</button>
            </div>
          </section>
        )}
        {!canReview && proposal.status !== 'pending' && (
          <section className="kb-review-panel">
            <strong>{proposal.status === 'approved' ? 'Изменения приняты' : 'Изменения отклонены'}</strong>
            {proposal.reviewNote && <p>{proposal.reviewNote}</p>}
          </section>
        )}
      </div>
    </KnowledgeShell>
  );
};

export default KnowledgeProposalPage;
