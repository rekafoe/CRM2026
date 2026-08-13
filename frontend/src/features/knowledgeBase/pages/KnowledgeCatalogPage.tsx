import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon } from '../../../components/ui/AppIcon';
import { useKnowledgeArticles, useKnowledgeCategories } from '../hooks';
import { KnowledgeShell } from '../components/KnowledgeShell';

type CatalogMode = 'updated' | 'new' | 'mine';

function formatDate(value?: string): string {
  if (!value) return 'Недавно';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Недавно'
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export const KnowledgeCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>(() => {
    const value = Number(searchParams.get('category'));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  });
  const [mode, setMode] = useState<CatalogMode>('updated');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(() => ({
    search: search || undefined,
    categoryId,
    scope: mode === 'mine' ? 'my' : undefined,
    status: mode === 'mine' ? undefined : 'published' as const,
    page,
    limit: 12,
    sort: mode === 'new' ? 'created' : undefined,
  }), [categoryId, mode, page, search]);

  const categories = useKnowledgeCategories();
  const articles = useKnowledgeArticles(filters);

  return (
    <KnowledgeShell>
      <section className="kb-hero">
        <div>
          <p className="kb-eyebrow">Внутренняя библиотека команды</p>
          <h1>Найдите ответ за пару секунд</h1>
          <p>Инструкции, регламенты и накопленный опыт типографии — в одном месте.</p>
        </div>
        <button className="kb-button kb-button--primary" type="button" onClick={() => navigate('/knowledge/new')}>
          <AppIcon name="plus" size="sm" /> Новая статья
        </button>
        <label className="kb-search">
          <AppIcon name="search" size="md" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Поиск по статьям, тегам и содержимому"
            aria-label="Поиск по базе знаний"
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput('')} aria-label="Очистить поиск">
              <AppIcon name="x" size="sm" />
            </button>
          )}
        </label>
      </section>

      <div className="kb-catalog-layout">
        <aside className="kb-category-panel">
          <h2>Категории</h2>
          <button className={!categoryId ? 'active' : ''} type="button" onClick={() => { setCategoryId(undefined); setPage(1); }}>
            <span><AppIcon name="folder" size="sm" /> Все материалы</span>
          </button>
          {categories.isLoading && <span className="kb-muted">Загрузка…</span>}
          {categories.data?.map((category) => (
            <button
              key={category.id}
              className={categoryId === category.id ? 'active' : ''}
              type="button"
              onClick={() => { setCategoryId(category.id); setPage(1); }}
            >
              <span><AppIcon name="document" size="sm" /> {category.name}</span>
              {category.articleCount ? <small>{category.articleCount}</small> : null}
            </button>
          ))}
        </aside>

        <section className="kb-catalog-results">
          <div className="kb-results-toolbar">
            <div>
              <h2>{categoryId ? categories.data?.find((item) => item.id === categoryId)?.name : 'Все статьи'}</h2>
              <span>{articles.data?.total ?? 0} материалов</span>
            </div>
            <div className="kb-segmented">
              <button type="button" className={mode === 'updated' ? 'active' : ''} onClick={() => { setMode('updated'); setPage(1); }}>Обновлённые</button>
              <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setPage(1); }}>Новые</button>
              <button type="button" className={mode === 'mine' ? 'active' : ''} onClick={() => { setMode('mine'); setPage(1); }}>Мои</button>
            </div>
          </div>

          {articles.isLoading && <div className="kb-state"><span className="kb-spinner" /> Загружаем статьи…</div>}
          {articles.isError && (
            <div className="kb-state kb-state--error">
              <AppIcon name="warning" size="lg" />
              <h3>Не удалось загрузить статьи</h3>
              <button className="kb-button" type="button" onClick={() => articles.refetch()}>Повторить</button>
            </div>
          )}
          {!articles.isLoading && !articles.isError && !articles.data?.items.length && (
            <div className="kb-state">
              <AppIcon name="search" size="xl" />
              <h3>Ничего не найдено</h3>
              <p>Измените запрос или создайте первую статью в этом разделе.</p>
            </div>
          )}

          <div className="kb-article-grid">
            {articles.data?.items.map((article) => (
              <article key={article.id} className="kb-article-card" onClick={() => navigate(`/knowledge/articles/${article.id}`)}>
                <div className="kb-card-topline">
                  <span className="kb-category-pill">{article.category?.name ?? 'Без категории'}</span>
                  {article.status !== 'published' && <span className={`kb-status kb-status--${article.status}`}>{article.status === 'draft' ? 'Черновик' : 'Архив'}</span>}
                </div>
                <h3>{article.title}</h3>
                <p>{article.excerpt || article.contentPlain?.slice(0, 150) || 'Описание пока не добавлено.'}</p>
                <div className="kb-tags">
                  {article.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
                <footer>
                  <span className="kb-avatar kb-avatar--small">{article.author?.name?.charAt(0) ?? '?'}</span>
                  <span>{article.author?.name ?? 'Команда'}</span>
                  <span className="kb-card-metric" title="Прочитали">
                    <AppIcon name="users" size="xs" /> {article.engagement.uniqueViewers}
                  </span>
                  <span className="kb-card-metric" title="Реакции">
                    👍 {article.engagement.totalReactions}
                  </span>
                  <time>{formatDate(article.updatedAt || article.createdAt)}</time>
                </footer>
              </article>
            ))}
          </div>

          {(articles.data?.totalPages ?? 1) > 1 && (
            <div className="kb-pagination">
              <button className="kb-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</button>
              <span>Страница {page} из {articles.data?.totalPages}</span>
              <button className="kb-button" disabled={page >= (articles.data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Далее</button>
            </div>
          )}
        </section>
      </div>
    </KnowledgeShell>
  );
};

export default KnowledgeCatalogPage;
