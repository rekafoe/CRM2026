import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppIcon } from '../../../components/ui/AppIcon';
import { useToastNotifications } from '../../../components/Toast';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { knowledgeApi } from '../api';
import { getTableOfContents } from '../content';
import { knowledgeKeys, useKnowledgeArticle, useKnowledgeRevisions } from '../hooks';
import { KnowledgeContent } from '../components/KnowledgeContent';
import { KnowledgeShell } from '../components/KnowledgeShell';
import type { KnowledgeArticle, KnowledgeArticleEngagement, KnowledgeReactionType } from '../types';

function formatDate(value?: string): string {
  if (!value) return 'дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(date);
}

const reactionOptions: Array<{ type: KnowledgeReactionType; emoji: string; label: string }> = [
  { type: 'like', emoji: '👍', label: 'Полезно' },
  { type: 'heart', emoji: '❤️', label: 'Нравится' },
  { type: 'celebrate', emoji: '🎉', label: 'Отлично' },
  { type: 'insightful', emoji: '💡', label: 'Познавательно' },
];

export const KnowledgeArticlePage: React.FC = () => {
  const { id } = useParams();
  const articleId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastNotifications();
  const currentUser = useCurrentUser();
  const articleQuery = useKnowledgeArticle(articleId);
  const revisionsQuery = useKnowledgeRevisions(articleId, false);
  const [question, setQuestion] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState<KnowledgeReactionType | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const recordedViewRef = useRef<number | null>(null);
  const article = articleQuery.data;
  const canEditDirectly = Boolean(article && currentUser && (currentUser.role === 'admin' || article.authorUserId === currentUser.id));
  const toc = useMemo(() => article ? getTableOfContents(article.contentJson) : [], [article]);

  const updateEngagement = (engagement: KnowledgeArticleEngagement) => {
    queryClient.setQueryData<KnowledgeArticle>(knowledgeKeys.article(articleId), (current) =>
      current ? { ...current, engagement } : current);
  };

  useEffect(() => {
    if (!article || recordedViewRef.current === article.id) return;
    recordedViewRef.current = article.id;
    knowledgeApi.recordView(article.id)
      .then(updateEngagement)
      .catch(() => {
        recordedViewRef.current = null;
      });
  }, [article?.id]);

  const toggleReaction = async (reaction: KnowledgeReactionType) => {
    setReactionBusy(reaction);
    try {
      updateEngagement(await knowledgeApi.toggleReaction(articleId, reaction));
    } catch (error: any) {
      toast.error('Не удалось сохранить реакцию', error?.response?.data?.message ?? error?.message);
    } finally {
      setReactionBusy(null);
    }
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
  };

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (error: any) {
      toast.error('Не удалось выполнить действие', error?.response?.data?.message ?? error?.message);
    } finally {
      setBusy(null);
    }
  };

  if (articleQuery.isLoading) return <KnowledgeShell><div className="kb-state"><span className="kb-spinner" /> Загружаем статью…</div></KnowledgeShell>;
  if (articleQuery.isError || !article) {
    return (
      <KnowledgeShell>
        <div className="kb-state kb-state--error">
          <AppIcon name="warning" size="xl" />
          <h2>Статья не найдена</h2>
          <button className="kb-button" onClick={() => navigate('/knowledge')}>Вернуться в каталог</button>
        </div>
      </KnowledgeShell>
    );
  }

  return (
    <KnowledgeShell>
      <div className="kb-article-page">
        <div className="kb-breadcrumbs">
          <Link to="/knowledge">База знаний</Link><span>/</span>
          <Link to={`/knowledge?category=${article.categoryId ?? ''}`}>{article.category?.name ?? 'Без категории'}</Link><span>/</span>
          <span>{article.title}</span>
        </div>

        <div className="kb-article-columns">
          <article className="kb-article">
            <header className="kb-article-header">
              <div className="kb-card-topline">
                <span className="kb-category-pill">{article.category?.name ?? 'Без категории'}</span>
                <span className={`kb-status kb-status--${article.status}`}>
                  {article.status === 'published' ? 'Опубликовано' : article.status === 'draft' ? 'Черновик' : 'Архив'}
                </span>
              </div>
              <h1>{article.title}</h1>
              {article.excerpt && <p className="kb-article-lead">{article.excerpt}</p>}
              <div className="kb-article-meta">
                <span className="kb-avatar">{article.author?.name?.charAt(0) ?? '?'}</span>
                <span><strong>{article.author?.name ?? 'Команда'}</strong><small>Обновлено {formatDate(article.updatedAt)}</small></span>
                <div className="kb-article-actions">
                  <button className="kb-button" type="button" onClick={() => navigate(`/knowledge/articles/${article.id}/edit`)}>
                    <AppIcon name={canEditDirectly ? 'edit' : 'pencil'} size="sm" />
                    {canEditDirectly ? 'Редактировать' : 'Предложить правку'}
                  </button>
                  {canEditDirectly && article.status === 'draft' && (
                    <button className="kb-button kb-button--primary" disabled={Boolean(busy)} onClick={() => run('publish', () => knowledgeApi.publishArticle(article.id), 'Статья опубликована')}>
                      <AppIcon name="check" size="sm" /> Опубликовать
                    </button>
                  )}
                  {canEditDirectly && article.status === 'published' && (
                    <button className="kb-button" disabled={Boolean(busy)} onClick={() => run('archive', () => knowledgeApi.archiveArticle(article.id), 'Статья перемещена в архив')}>
                      <AppIcon name="ban" size="sm" /> В архив
                    </button>
                  )}
                </div>
              </div>
              <div className="kb-tags">{article.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            </header>

            <KnowledgeContent content={article.contentJson} />

            <section className="kb-engagement">
              <div className="kb-reactions">
                <div><strong>Была ли статья полезна?</strong><small>Можно выбрать несколько реакций</small></div>
                <div className="kb-reaction-list">
                  {reactionOptions.map((option) => {
                    const reaction = article.engagement.reactions.find((item) => item.type === option.type);
                    const active = article.engagement.myReactions.includes(option.type);
                    const names = reaction?.users.map((user) => user.name).filter(Boolean).join(', ');
                    return (
                      <button
                        key={option.type}
                        type="button"
                        className={`kb-reaction${active ? ' active' : ''}`}
                        aria-pressed={active}
                        disabled={reactionBusy !== null}
                        title={names || option.label}
                        onClick={() => void toggleReaction(option.type)}
                      >
                        <span>{option.emoji}</span>
                        <span>{option.label}</span>
                        <strong>{reaction?.count ?? 0}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="kb-viewers">
                <button className="kb-link-button" type="button" onClick={() => setShowViewers((value) => !value)}>
                  <AppIcon name="users" size="sm" />
                  Прочитали: {article.engagement.uniqueViewers}
                  {article.engagement.totalViews > article.engagement.uniqueViewers && ` · ${article.engagement.totalViews} просмотров`}
                </button>
                {showViewers && (
                  <div className="kb-viewer-list">
                    {!article.engagement.viewers.length && <span className="kb-muted">Пока никто не прочитал статью.</span>}
                    {article.engagement.viewers.map((viewer) => (
                      <div key={viewer.user.id}>
                        <span className="kb-avatar kb-avatar--small">{viewer.user.name.charAt(0) || '?'}</span>
                        <span><strong>{viewer.user.name}</strong><small>Последний просмотр: {formatDate(viewer.lastViewedAt)}</small></span>
                        {viewer.viewCount > 1 && <small>{viewer.viewCount} раз</small>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {canEditDirectly && (
              <section className="kb-revisions">
                <button
                  className="kb-link-button"
                  type="button"
                  onClick={() => {
                    const next = !showRevisions;
                    setShowRevisions(next);
                    if (next) revisionsQuery.refetch();
                  }}
                >
                  <AppIcon name="history" size="sm" /> {showRevisions ? 'Скрыть историю' : 'История изменений'}
                </button>
                {showRevisions && (
                  <div className="kb-revision-list">
                    {revisionsQuery.isLoading && <span className="kb-muted">Загрузка истории…</span>}
                    {revisionsQuery.data?.map((revision) => (
                      <div key={revision.id}>
                        <span><strong>Версия {revision.revisionNumber ?? revision.id}</strong><small>{formatDate(revision.createdAt)} · {revision.author?.name ?? 'Автор'}</small></span>
                        <button
                          className="kb-button kb-button--small"
                          disabled={Boolean(busy)}
                          onClick={() => run(
                            `restore-${revision.id}`,
                            () => knowledgeApi.restoreRevision(article.id, revision.id, article.currentRevisionId!),
                            'Версия восстановлена',
                          )}
                        >
                          Восстановить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="kb-questions" id="questions">
              <div className="kb-section-heading">
                <div><p className="kb-eyebrow">Обсуждение</p><h2>Вопросы по статье</h2></div>
                <span>{article.questions.length}</span>
              </div>
              <form
                className="kb-question-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const content = question.trim();
                  if (!content) return;
                  run('question', () => knowledgeApi.addQuestion(article.id, content), 'Вопрос добавлен').then(() => setQuestion(''));
                }}
              >
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Что осталось непонятным? Опишите вопрос…" rows={4} />
                <button className="kb-button kb-button--primary" disabled={!question.trim() || busy === 'question'}>Задать вопрос</button>
              </form>

              <div className="kb-thread-list">
                {!article.questions.length && <div className="kb-empty-inline">Пока нет вопросов. Вы можете начать обсуждение.</div>}
                {article.questions.map((item) => (
                  <article id={`question-${item.id}`} key={item.id} className={`kb-thread${item.isResolved ? ' is-resolved' : ''}`}>
                    <header>
                      <span className="kb-avatar kb-avatar--small">{item.author?.name?.charAt(0) ?? '?'}</span>
                      <span><strong>{item.author?.name ?? 'Пользователь'}</strong><small>{formatDate(item.createdAt)}</small></span>
                      {item.isResolved && <span className="kb-resolved"><AppIcon name="check" size="xs" /> Решено</span>}
                    </header>
                    <p>{item.content}</p>
                    {item.replies.map((reply) => (
                      <div className="kb-reply" key={reply.id}>
                        <span className="kb-avatar kb-avatar--small">{reply.author?.name?.charAt(0) ?? '?'}</span>
                        <div><strong>{reply.author?.name ?? 'Пользователь'}</strong><p>{reply.content}</p><small>{formatDate(reply.createdAt)}</small></div>
                      </div>
                    ))}
                    <form
                      className="kb-reply-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const content = replyDrafts[item.id]?.trim();
                        if (!content) return;
                        run(`reply-${item.id}`, () => knowledgeApi.addReply(item.id, content), 'Ответ добавлен')
                          .then(() => setReplyDrafts((prev) => ({ ...prev, [item.id]: '' })));
                      }}
                    >
                      <textarea rows={2} value={replyDrafts[item.id] ?? ''} onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))} placeholder="Написать ответ…" />
                      <div>
                        <button className="kb-button kb-button--small" disabled={!replyDrafts[item.id]?.trim()}>Ответить</button>
                        {!item.isResolved && (canEditDirectly || item.authorUserId === currentUser?.id) && (
                          <button className="kb-link-button" type="button" onClick={() => run(`resolve-${item.id}`, () => knowledgeApi.resolveQuestion(item.id), 'Вопрос отмечен решённым')}>
                            Отметить решённым
                          </button>
                        )}
                      </div>
                    </form>
                  </article>
                ))}
              </div>
            </section>
          </article>

          {toc.length > 0 && (
            <aside className="kb-toc">
              <strong>В этой статье</strong>
              <nav>
                {toc.map((item) => (
                  <a key={item.id} className={`level-${item.level}`} href={`#${item.id}`}>{item.text}</a>
                ))}
                <a href="#questions">Вопросы</a>
              </nav>
            </aside>
          )}
        </div>
      </div>
    </KnowledgeShell>
  );
};

export default KnowledgeArticlePage;
