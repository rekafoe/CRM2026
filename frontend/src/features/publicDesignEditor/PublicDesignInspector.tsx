import React, { useEffect, useState } from 'react';
import { PublicDesignPhotoLibrary } from './PublicDesignPhotoLibrary';
import { PublicDesignInspectorStatus } from './PublicDesignInspectorStatus';
import { PublicDesignTaskPanel, type PublicDesignTaskTab } from './PublicDesignTaskPanel';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';
import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';

type InspectorSection = 'photo' | 'text' | 'check' | 'pages';

interface PublicDesignInspectorProps {
  fragmentLabel: string;
  fragmentPreflight: PublicEditorPreflightSummary;
  globalPreflight: PublicEditorPreflightSummary;
  activeTaskTab: PublicDesignTaskTab;
  saving: boolean;
  nextAction: PublicEditorNextAction;
  sidebarPhotos: SidebarPhotoItem[];
  helpOpen: boolean;
  pageCount: number;
  currentPage: number;
  pageStatuses: Record<number, PageStripStatus>;
  onTaskTabChange: (tab: PublicDesignTaskTab) => void;
  onPageSelect: (pageIndex: number) => void;
  onFilesSelected: (files: File[]) => void;
  onImageUrlSubmit: (url: string) => Promise<void>;
  onAutofill: () => void | Promise<void>;
  onPhotoClick: (id: string) => void;
  onPhotoRemove: (id: string) => void;
  onReadyForCart: () => void;
  onNextAction: () => void;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onIssueFocus: (issue: PublicEditorPreflightIssue) => void;
}

const SECTIONS: Array<{ id: InspectorSection; label: string; hint: string }> = [
  { id: 'photo', label: 'Фото', hint: 'Загрузите и поставьте изображения' },
  { id: 'text', label: 'Текст', hint: 'Проверьте подписи и данные' },
  { id: 'check', label: 'Проверка', hint: 'Готовность к заказу' },
  { id: 'pages', label: 'Страницы', hint: 'Что осталось заполнить' },
];

export const PublicDesignInspector: React.FC<PublicDesignInspectorProps> = ({
  fragmentLabel,
  fragmentPreflight,
  globalPreflight,
  activeTaskTab,
  saving,
  nextAction,
  sidebarPhotos,
  helpOpen,
  pageCount,
  currentPage,
  pageStatuses,
  onTaskTabChange,
  onPageSelect,
  onFilesSelected,
  onImageUrlSubmit,
  onAutofill,
  onPhotoClick,
  onPhotoRemove,
  onReadyForCart,
  onNextAction,
  onFieldFocus,
  onPhotoReplace,
  onIssueFocus,
}) => {
  const [section, setSection] = useState<InspectorSection>('photo');

  useEffect(() => {
    setSection(activeTaskTab);
  }, [activeTaskTab]);

  const selectSection = (nextSection: InspectorSection) => {
    setSection(nextSection);
    if (nextSection === 'photo' || nextSection === 'text' || nextSection === 'check') {
      onTaskTabChange(nextSection);
    }
  };

  return (
    <aside className="public-design-editor__sidepanel" aria-label="Инструменты макета">
      <PublicDesignInspectorStatus
        fragmentLabel={fragmentLabel}
        globalPreflight={globalPreflight}
        nextAction={nextAction}
        pageCount={pageCount}
        pageStatuses={pageStatuses}
        saving={saving}
        onNextAction={onNextAction}
      />

      <div className="public-design-editor__inspector-tabs">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`public-design-editor__inspector-tab${section === item.id ? ' public-design-editor__inspector-tab--active' : ''}`}
            onClick={() => selectSection(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      {section === 'photo' && (
        <div className="public-design-editor__inspector-section">
          <PublicDesignPhotoLibrary
            photos={sidebarPhotos}
            onFilesSelected={onFilesSelected}
            onImageUrlSubmit={onImageUrlSubmit}
            onAutofill={onAutofill}
            onPhotoClick={onPhotoClick}
            onPhotoRemove={onPhotoRemove}
          />
          <PublicDesignTaskPanel
            activeTab="photo"
            onTabChange={onTaskTabChange}
            preflight={fragmentPreflight}
            checkPreflight={globalPreflight}
            saving={saving}
            nextAction={nextAction}
            showTabs={false}
            showNextAction={false}
            showOrderBar={false}
            onReadyForCart={onReadyForCart}
            onNextAction={onNextAction}
            onFieldFocus={onFieldFocus}
            onPhotoReplace={onPhotoReplace}
            onIssueFocus={onIssueFocus}
          />
        </div>
      )}

      {section === 'text' && (
        <div className="public-design-editor__inspector-section">
          <PublicDesignTaskPanel
            activeTab="text"
            onTabChange={onTaskTabChange}
            preflight={fragmentPreflight}
            checkPreflight={globalPreflight}
            saving={saving}
            nextAction={nextAction}
            showTabs={false}
            showNextAction={false}
            showOrderBar={false}
            onReadyForCart={onReadyForCart}
            onNextAction={onNextAction}
            onFieldFocus={onFieldFocus}
            onPhotoReplace={onPhotoReplace}
            onIssueFocus={onIssueFocus}
          />
        </div>
      )}

      {section === 'check' && (
        <div className="public-design-editor__inspector-section">
          <PrintPrepSummary preflight={globalPreflight} />
          <PublicDesignTaskPanel
            activeTab="check"
            onTabChange={(tab) => {
              if (tab === 'photo' || tab === 'text') setSection(tab);
              onTaskTabChange(tab);
            }}
            preflight={fragmentPreflight}
            checkPreflight={globalPreflight}
            saving={saving}
            nextAction={nextAction}
            showTabs={false}
            onReadyForCart={onReadyForCart}
            onNextAction={onNextAction}
            onFieldFocus={onFieldFocus}
            onPhotoReplace={onPhotoReplace}
            onIssueFocus={onIssueFocus}
          />
        </div>
      )}

      {section === 'pages' && (
        <div className="public-design-editor__inspector-section">
          <PageOverview
            pageCount={pageCount}
            currentPage={currentPage}
            pageStatuses={pageStatuses}
            onPageSelect={onPageSelect}
          />
        </div>
      )}

      {helpOpen && (
        <section className="public-design-editor__help">
          <h2>Как пользоваться редактором</h2>
          <ul>
            <li>Заполните фото и текст в текущей части макета.</li>
            <li>Для точной настройки используйте иконки над макетом.</li>
            <li>Внизу видно, на каких страницах ещё есть вопросы.</li>
          </ul>
        </section>
      )}
    </aside>
  );
};

const PrintPrepSummary: React.FC<{ preflight: PublicEditorPreflightSummary }> = ({ preflight }) => (
  <section className="public-design-editor__prep-card">
    <span className="public-design-editor__prep-kicker">Подготовка к печати</span>
    <strong>{preflight.hasBlockingIssues ? 'Нужно проверить макет' : 'Макет выглядит готовым'}</strong>
    <div className="public-design-editor__prep-stats">
      <span>{preflight.photoReady}/{preflight.photoTotal} фото</span>
      <span>{preflight.textReady}/{preflight.textTotal} текст</span>
    </div>
  </section>
);

interface PageOverviewItem {
  pageIndex: number;
  status: PageStripStatus;
}

const PageOverview: React.FC<{
  pageCount: number;
  currentPage: number;
  pageStatuses: Record<number, PageStripStatus>;
  onPageSelect: (pageIndex: number) => void;
}> = ({ pageCount, currentPage, pageStatuses, onPageSelect }) => {
  const items = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageIndex,
    status: pageStatuses[pageIndex] ?? { tone: 'ready' as const, label: 'Готово' },
  }));
  const current = items.find((item) => item.pageIndex === currentPage);
  const needsAttention = items.filter((item) => item.pageIndex !== currentPage && item.status.tone !== 'ready');
  const ready = items.filter((item) => item.pageIndex !== currentPage && item.status.tone === 'ready');
  const nextAttention = needsAttention[0];

  return (
    <section className="public-design-editor__page-overview">
      <div className="public-design-editor__page-overview-head">
        <span>Страницы макета</span>
        <strong>{pageCount} стр.</strong>
      </div>
      {nextAttention && (
        <button
          type="button"
          className="public-design-editor__page-overview-next"
          onClick={() => onPageSelect(nextAttention.pageIndex)}
        >
          Перейти к следующей незаполненной
        </button>
      )}
      <PageOverviewGroup
        title="Сейчас открыта"
        items={current ? [current] : []}
        currentPage={currentPage}
        onPageSelect={onPageSelect}
      />
      <PageOverviewGroup
        title="Требует внимания"
        items={needsAttention}
        currentPage={currentPage}
        emptyLabel="Все остальные страницы готовы"
        onPageSelect={onPageSelect}
      />
      <PageOverviewGroup
        title="Готовые страницы"
        items={ready}
        currentPage={currentPage}
        emptyLabel="Пока нет готовых страниц"
        onPageSelect={onPageSelect}
      />
    </section>
  );
};

const PageOverviewGroup: React.FC<{
  title: string;
  items: PageOverviewItem[];
  currentPage: number;
  emptyLabel?: string;
  onPageSelect: (pageIndex: number) => void;
}> = ({ title, items, currentPage, emptyLabel, onPageSelect }) => (
  <div className="public-design-editor__page-overview-group">
    <div className="public-design-editor__page-overview-group-title">
      <span>{title}</span>
      <b>{items.length}</b>
    </div>
    {items.length === 0 ? (
      <p className="public-design-editor__page-overview-empty">{emptyLabel ?? 'Нет страниц'}</p>
    ) : (
      <div className="public-design-editor__page-overview-list">
        {items.map(({ pageIndex, status }) => (
          <button
            key={pageIndex}
            type="button"
            className={`public-design-editor__page-overview-item public-design-editor__page-overview-item--${status.tone}${pageIndex === currentPage ? ' public-design-editor__page-overview-item--active' : ''}`}
            onClick={() => onPageSelect(pageIndex)}
          >
            <span>Страница {pageIndex + 1}</span>
            <b>{status.label}</b>
          </button>
        ))}
      </div>
    )}
  </div>
);
