import React from 'react';
import { Button } from '../../components/common';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';

type TaskTab = 'photo' | 'text' | 'check' | 'checkout';

interface PublicDesignTaskPanelProps {
  activeTab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  preflight: PublicEditorPreflightSummary;
  saveStateLabel: string;
  saving: boolean;
  onSaveDraft: () => void;
  onReadyForCart: () => void;
  onFieldFocus: (field: PublicEditorPreflightField, kind: 'photo' | 'text') => void;
  onPhotoReplace: (field: PublicEditorPreflightField) => void;
  onIssueFocus: (issue: PublicEditorPreflightIssue) => void;
}

const TABS: Array<{ id: TaskTab; label: string }> = [
  { id: 'photo', label: 'Фото' },
  { id: 'text', label: 'Текст' },
  { id: 'check', label: 'Проверка' },
  { id: 'checkout', label: 'Оформление' },
];

export const PublicDesignTaskPanel: React.FC<PublicDesignTaskPanelProps> = ({
  activeTab,
  onTabChange,
  preflight,
  saveStateLabel,
  saving,
  onSaveDraft,
  onReadyForCart,
  onFieldFocus,
  onPhotoReplace,
  onIssueFocus,
}) => {
  const renderFields = activeTab === 'photo' ? preflight.photoFields : preflight.textFields;
  const fieldKind = activeTab === 'photo' ? 'photo' : 'text';

  return (
    <aside className="public-design-editor__tasks" aria-label="Задачи редактора">
      <div className="public-design-editor__task-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`public-design-editor__task-tab${activeTab === tab.id ? ' public-design-editor__task-tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(activeTab === 'photo' || activeTab === 'text') && (
        <div className="public-design-editor__task-list">
          <div className="public-design-editor__task-summary">
            {activeTab === 'photo'
              ? `${preflight.photoReady} / ${preflight.photoTotal} фото заполнено`
              : `${preflight.textReady} / ${preflight.textTotal} текстов заполнено`}
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
                <strong>{field.label}</strong>
                <span>Стр. {field.pageIndex + 1} · {field.detail}</span>
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
            {preflight.hasBlockingIssues ? 'Есть ошибки перед корзиной' : 'Критичных ошибок нет'}
          </div>
          {preflight.issues.length === 0 ? (
            <p className="public-design-editor__task-empty">Макет выглядит готовым.</p>
          ) : preflight.issues.map((issue) => (
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

      {activeTab === 'checkout' && (
        <div className="public-design-editor__task-list">
          <div className="public-design-editor__task-summary">Статус: {saveStateLabel}</div>
          <p className="public-design-editor__task-empty">
            Сначала сохраните draft. Если проверка без ошибок, можно вернуться в корзину сайта.
          </p>
          <Button variant="secondary" onClick={onSaveDraft} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить draft'}
          </Button>
          <Button variant="primary" onClick={onReadyForCart} disabled={saving}>
            Сохранить и вернуться в корзину
          </Button>
        </div>
      )}
    </aside>
  );
};

export type { TaskTab as PublicDesignTaskTab };
