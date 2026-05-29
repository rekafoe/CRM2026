import React, { useState } from 'react';
import { AppIcon } from '../../components/ui/AppIcon';
import { PublicDesignPhotoLibrary } from './PublicDesignPhotoLibrary';
import { PublicDesignInspectorStatus } from './PublicDesignInspectorStatus';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { SidebarPhotoItem } from '../../pages/admin/designEditor/types';
import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';
import './publicDesignClientAside.css';

export type PublicDesignClientAsideTab = 'photos' | 'check';

const FIELD_STATUS_LABELS: Record<PublicEditorPreflightField['status'], string> = {
  ready: 'Готово',
  missing: 'Нужно заполнить',
  warning: 'Проверьте',
};

const RAIL_TABS: Array<{
  id: PublicDesignClientAsideTab;
  label: string;
  labelSub: string;
  title: string;
  icon: 'image' | 'check';
}> = [
  { id: 'photos', label: 'Загрузка', labelSub: 'фото', title: 'Загрузка фото', icon: 'image' },
  { id: 'check', label: 'Проверка', labelSub: 'макета', title: 'Проверка фото и текста', icon: 'check' },
];

function summarizeCheck(preflight: PublicEditorPreflightSummary): { title: string; detail: string } {
  const errors = preflight.issues.filter((issue) => issue.level === 'error').length;
  const warnings = preflight.issues.filter((issue) => issue.level === 'warning').length;
  if (errors > 0) {
    return {
      title: `Нужно исправить ${errors} ${errors === 1 ? 'ошибку' : 'ошибок'}`,
      detail: 'Заказ лучше не оформлять, пока в макете есть обязательные ошибки.',
    };
  }
  if (warnings > 0) {
    return {
      title: `Есть ${warnings} ${warnings === 1 ? 'предупреждение' : 'предупреждений'}`,
      detail: 'Печать возможна, но лучше проверить качество фото и текст.',
    };
  }
  return {
    title: 'Можно оформлять',
    detail: 'Фото, текст и сохранение выглядят готовыми для заказа.',
  };
}

interface PublicDesignClientAsideProps {
  fragmentLabel: string;
  fragmentPreflight: PublicEditorPreflightSummary;
  globalPreflight: PublicEditorPreflightSummary;
  saving: boolean;
  nextAction: PublicEditorNextAction;
  pageCount: number;
  pageStatuses: Record<number, PageStripStatus>;
  sidebarPhotos: SidebarPhotoItem[];
  selectedPhotoId?: string | null;
  helpOpen: boolean;
  onFilesSelected: (files: File[]) => void;
  onPhotoClick: (id: string) => void;
  onPhotoSelect?: (id: string) => void;
  onPhotoRemove: (id: string) => void;
  onPhotoRetry?: (id: string) => void;
  onNextAction: () => void;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onPlaceSelectedPhoto?: (field: PublicEditorPreflightField) => void;
  onIssueFocus: (issue: PublicEditorPreflightIssue) => void;
}

export const PublicDesignClientAside: React.FC<PublicDesignClientAsideProps> = ({
  fragmentLabel,
  fragmentPreflight,
  globalPreflight,
  saving,
  nextAction,
  pageCount,
  pageStatuses,
  sidebarPhotos,
  selectedPhotoId,
  helpOpen,
  onFilesSelected,
  onPhotoClick,
  onPhotoSelect,
  onPhotoRemove,
  onPhotoRetry,
  onNextAction,
  onFieldFocus,
  onPhotoReplace,
  onPlaceSelectedPhoto,
  onIssueFocus,
}) => {
  const [activeTab, setActiveTab] = useState<PublicDesignClientAsideTab>('photos');

  const missingPhotoCount = Math.max(0, fragmentPreflight.photoTotal - fragmentPreflight.photoReady);
  const missingTextCount = Math.max(0, fragmentPreflight.textTotal - fragmentPreflight.textReady);
  const checkSummary = summarizeCheck(globalPreflight);

  const resolveTabBadge = (tab: PublicDesignClientAsideTab) => {
    if (tab === 'photos') return missingPhotoCount;
    return globalPreflight.issues.length || missingPhotoCount + missingTextCount;
  };

  const renderFieldList = (
    kind: 'photo' | 'text',
    fields: PublicEditorPreflightField[],
    summaryLabel: string,
    summaryValue: string,
  ) => (
    <div className="public-design-editor__task-list public-design-editor__client-aside-check-group">
      <div className="public-design-editor__task-summary">
        <span>{summaryLabel}</span>
        <strong>{summaryValue}</strong>
        {kind === 'text' && fragmentLabel && (
          <p>{fragmentLabel}</p>
        )}
      </div>
      {fields.length === 0 ? (
        <p className="public-design-editor__task-empty">
          {kind === 'photo' ? 'В шаблоне нет фото-полей.' : 'В шаблоне нет редактируемых текстов.'}
        </p>
      ) : fields.map((field) => (
        <div
          key={`${kind}-${field.pageIndex}-${field.id}`}
          className={`public-design-editor__task-item public-design-editor__task-item--${field.status}`}
        >
          <button
            type="button"
            className="public-design-editor__task-main"
            onClick={() => onFieldFocus(field, kind)}
          >
            <i aria-hidden="true" />
            <strong>{field.label}</strong>
            <span>Стр. {field.pageIndex + 1} · {field.detail}</span>
            <b className="public-design-editor__task-status">{FIELD_STATUS_LABELS[field.status]}</b>
          </button>
          <div className="public-design-editor__task-actions">
            <button type="button" onClick={() => onFieldFocus(field, kind)}>
              Показать
            </button>
            {kind === 'photo' && (
              <>
                {onPlaceSelectedPhoto && (
                  <button type="button" onClick={() => onPlaceSelectedPhoto(field)}>
                    Поставить выбранное
                  </button>
                )}
                <button type="button" onClick={() => onPhotoReplace(field)}>
                  {field.status === 'ready' ? 'Заменить' : 'Добавить'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <aside className="public-design-editor__client-aside" aria-label="Панель редактора">
      <nav className="public-design-editor__client-aside-rail" aria-label="Разделы панели">
        {RAIL_TABS.map((tab) => {
          const badge = resolveTabBadge(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.title}
              className={`public-design-editor__client-aside-rail-btn${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <span className="public-design-editor__client-aside-rail-icon" aria-hidden="true">
                <AppIcon name={tab.icon} size="sm" />
              </span>
              <span className="public-design-editor__client-aside-rail-label">
                {tab.label}
                <small>{tab.labelSub}</small>
              </span>
              {badge > 0 && (
                <b className="public-design-editor__client-aside-rail-badge">{badge > 99 ? '99+' : badge}</b>
              )}
            </button>
          );
        })}
      </nav>

      <div className="public-design-editor__client-aside-panel">
        {activeTab === 'photos' && (
          <>
            <div className="public-design-editor__client-aside-panel-inner public-design-editor__client-aside-panel-inner--photos">
              <PublicDesignPhotoLibrary
                photos={sidebarPhotos}
                selectedPhotoId={selectedPhotoId}
                onFilesSelected={onFilesSelected}
                onPhotoClick={onPhotoClick}
                onPhotoSelect={onPhotoSelect}
                onPhotoRemove={onPhotoRemove}
                onPhotoRetry={onPhotoRetry}
              />
            </div>
            {helpOpen && (
              <div className="public-design-editor__client-aside-help-overlay" role="dialog" aria-label="Справка по редактору">
                <section className="public-design-editor__help">
                  <h2>Как пользоваться редактором</h2>
                  <ul>
                    <li>Загрузите фото на этой вкладке.</li>
                    <li>Перетащите фото на макет или поставьте через вкладку «Проверка».</li>
                    <li>Текстовые поля — во вкладке «Проверка».</li>
                    <li>Финальная проверка откроется перед оформлением заказа.</li>
                  </ul>
                </section>
              </div>
            )}
          </>
        )}

        {activeTab === 'check' && (
          <div className="public-design-editor__client-aside-panel-inner public-design-editor__client-aside-panel-inner--check">
            <PublicDesignInspectorStatus
              fragmentLabel={fragmentLabel}
              fragmentPreflight={fragmentPreflight}
              globalPreflight={globalPreflight}
              nextAction={nextAction}
              pageCount={pageCount}
              pageStatuses={pageStatuses}
              saving={saving}
              onNextAction={onNextAction}
            />

            <div className="public-design-editor__task-summary public-design-editor__client-aside-check-overview">
              <span>Проверка всего макета</span>
              <strong>{checkSummary.title}</strong>
              <p>{checkSummary.detail}</p>
            </div>

            {renderFieldList(
              'photo',
              fragmentPreflight.photoFields,
              'Фото в макете',
              `${fragmentPreflight.photoReady} из ${fragmentPreflight.photoTotal} заполнено`,
            )}

            {renderFieldList(
              'text',
              fragmentPreflight.textFields,
              'Текст в макете',
              `${fragmentPreflight.textReady} из ${fragmentPreflight.textTotal} заполнено`,
            )}

            <div className="public-design-editor__task-list public-design-editor__client-aside-check-group">
              <div className="public-design-editor__task-summary">
                <span>Замечания</span>
                <strong>
                  {globalPreflight.issues.length > 0
                    ? `${globalPreflight.issues.length} пунктов`
                    : 'Замечаний нет'}
                </strong>
              </div>
              {globalPreflight.issues.length === 0 ? (
                <p className="public-design-editor__task-empty">Можно нажимать «Заказать».</p>
              ) : globalPreflight.issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`public-design-editor__task-issue public-design-editor__task-issue--${issue.level}`}
                  onClick={() => onIssueFocus(issue)}
                >
                  {issue.message}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
