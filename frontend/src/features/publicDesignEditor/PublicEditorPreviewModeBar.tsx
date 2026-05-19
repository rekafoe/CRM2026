import React from 'react';
import type { ClientEditorMode } from '../clientEditor/ClientEditorRouter';

const MODES: ClientEditorMode[] = ['single', 'multipage', 'photo_batch'];

const MOBILE_MODE_LABELS: Record<ClientEditorMode, string> = {
  single: 'Лист',
  multipage: 'Книга',
  photo_batch: 'Печать',
};

interface PublicEditorPreviewModeBarProps {
  mode: ClientEditorMode;
  onModeChange: (mode: ClientEditorMode) => void;
  onBack: () => void;
}

export const PublicEditorPreviewModeBar: React.FC<PublicEditorPreviewModeBarProps> = ({
  mode,
  onModeChange,
  onBack,
}) => (
  <div className="public-editor-preview-mode-bar" aria-label="Режим клиентского редактора">
    <button
      type="button"
      className="public-editor-preview-mode-bar__back"
      onClick={onBack}
      aria-label="Назад к шаблонам"
    >
      ‹
    </button>
    <div className="public-editor-preview-mode-bar__modes" role="tablist" aria-label="Режим редактора">
      {MODES.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          className={`public-editor-preview-mode-bar__mode${item === mode ? ' public-editor-preview-mode-bar__mode--active' : ''}`}
          aria-selected={item === mode}
          onClick={() => onModeChange(item)}
        >
          {MOBILE_MODE_LABELS[item]}
        </button>
      ))}
    </div>
  </div>
);
