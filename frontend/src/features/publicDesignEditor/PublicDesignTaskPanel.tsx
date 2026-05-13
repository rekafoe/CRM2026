import React from 'react';
import { Button } from '../../components/common';
import type { PublicEditorPreflightSummary } from './publicDesignPreflight';

type TaskTab = 'photo' | 'text' | 'check' | 'checkout';

interface PublicDesignTaskPanelProps {
  activeTab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  preflight: PublicEditorPreflightSummary;
  saveStateLabel: string;
  saving: boolean;
  onSaveDraft: () => void;
  onReadyForCart: () => void;
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
}) => {
  const renderFields = activeTab === 'photo' ? preflight.photoFields : preflight.textFields;

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
              <strong>{field.label}</strong>
              <span>Стр. {field.pageIndex + 1} · {field.detail}</span>
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
            <div key={issue.id} className={`public-design-editor__task-issue public-design-editor__task-issue--${issue.level}`}>
              {issue.message}
            </div>
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
