import React from 'react';
import { Button } from '../../components/common';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';

type TaskTab = 'photo' | 'text' | 'check';

interface PublicDesignTaskPanelProps {
  activeTab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  preflight: PublicEditorPreflightSummary;
  checkPreflight?: PublicEditorPreflightSummary;
  saving: boolean;
  nextAction: PublicEditorNextAction;
  showTabs?: boolean;
  showNextAction?: boolean;
  showOrderBar?: boolean;
  onReadyForCart: () => void;
  onNextAction: () => void;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onIssueFocus: (issue: PublicEditorPreflightIssue) => void;
}

const TABS: Array<{ id: TaskTab; label: string; icon: string }> = [
  { id: 'photo', label: 'Фото', icon: '▧' },
  { id: 'text', label: 'Текст', icon: 'T' },
  { id: 'check', label: 'Проверка', icon: '✓' },
];

const FIELD_STATUS_LABELS: Record<PublicEditorPreflightField['status'], string> = {
  ready: 'Готово',
  missing: 'Нужно заполнить',
  warning: 'Проверьте',
};

export const PublicDesignTaskPanel: React.FC<PublicDesignTaskPanelProps> = ({
  activeTab,
  onTabChange,
  preflight,
  checkPreflight,
  saving,
  nextAction,
  showTabs = true,
  showNextAction = true,
  showOrderBar = true,
  onReadyForCart,
  onNextAction,
  onFieldFocus,
  onPhotoReplace,
  onIssueFocus,
}) => {
  const readinessPreflight = checkPreflight ?? preflight;
  const renderFields = activeTab === 'photo' ? preflight.photoFields : preflight.textFields;
  const fieldKind = activeTab === 'photo' ? 'photo' : 'text';
  const photoLeft = Math.max(0, preflight.photoTotal - preflight.photoReady);
  const textLeft = Math.max(0, preflight.textTotal - preflight.textReady);
  const issueLeft = readinessPreflight.issues.length;

  const resolveTabCount = (tab: TaskTab) => {
    if (tab === 'photo') return photoLeft;
    if (tab === 'text') return textLeft;
    return issueLeft;
  };

  return (
    <aside className="public-design-editor__tasks" aria-label="Задачи редактора">
      {showNextAction && (
      <div className={`public-design-editor__next-action public-design-editor__next-action--${nextAction.kind}`}>
        <span>Следующий шаг</span>
        <strong>{nextAction.label}</strong>
        <p>{nextAction.description}</p>
        <Button variant="primary" onClick={onNextAction} disabled={saving}>
          Продолжить
        </Button>
      </div>
      )}

      {showTabs && (
      <div className="public-design-editor__task-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`public-design-editor__task-tab${activeTab === tab.id ? ' public-design-editor__task-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="public-design-editor__task-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {resolveTabCount(tab.id) > 0 && (
              <b>{resolveTabCount(tab.id)}</b>
            )}
          </button>
        ))}
      </div>
      )}

      {(activeTab === 'photo' || activeTab === 'text') && (
        <div className="public-design-editor__task-list">
          <div className="public-design-editor__task-summary">
            <span>{activeTab === 'photo' ? 'Фото в макете' : 'Текст в макете'}</span>
            <strong>
              {activeTab === 'photo'
                ? `${preflight.photoReady} из ${preflight.photoTotal} заполнено`
                : `${preflight.textReady} из ${preflight.textTotal} заполнено`}
            </strong>
          </div>
          {renderFields.length === 0 ? (
            <p className="public-design-editor__task-empty">
              {activeTab === 'photo' ? 'В шаблоне нет фото-полей.' : 'В шаблоне нет редактируемых текстов.'}
            </p>
          ) : renderFields.map((field) => (
            <div key={`${field.pageIndex}-${field.id}`} className={`public-design-editor__task-item public-design-editor__task-item--${field.status}`}>
              <button
                type="button"
                className="public-design-editor__task-main"
                onClick={() => onFieldFocus(field, fieldKind)}
              >
                <i aria-hidden="true" />
                <strong>{field.label}</strong>
                <span>Стр. {field.pageIndex + 1} · {field.detail}</span>
                <b className="public-design-editor__task-status">{FIELD_STATUS_LABELS[field.status]}</b>
              </button>
              <div className="public-design-editor__task-actions">
                <button type="button" onClick={() => onFieldFocus(field, fieldKind)}>
                  Показать
                </button>
                {activeTab === 'photo' && (
                  <button type="button" onClick={() => onPhotoReplace(field)}>
                    {field.status === 'ready' ? 'Заменить' : 'Добавить'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'check' && (
        <div className="public-design-editor__task-list">
          <div className="public-design-editor__task-summary">
            <span>Проверка перед заказом</span>
            <strong>{readinessPreflight.hasBlockingIssues ? 'Нужно заполнить макет' : 'Макет готов к заказу'}</strong>
          </div>
          {readinessPreflight.issues.length === 0 ? (
            <p className="public-design-editor__task-empty">Можно нажимать «Заказать».</p>
          ) : readinessPreflight.issues.map((issue) => (
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
      )}

      {showOrderBar && (
      <div className="public-design-editor__order-bar">
        <Button variant="primary" onClick={onReadyForCart} disabled={saving}>
          {saving ? 'Готовим заказ...' : 'Заказать'}
        </Button>
      </div>
      )}
    </aside>
  );
};

export type { TaskTab as PublicDesignTaskTab };
