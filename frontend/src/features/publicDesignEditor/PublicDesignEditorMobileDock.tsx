import React from 'react';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';

export type PublicDesignMobilePanel = 'canvas' | 'photos' | 'text' | 'check';

function mobileDockActionLabel(action: PublicEditorNextAction): string {
  if (action.kind === 'replacePhoto') return 'Следующее фото';
  if (action.kind === 'editText') {
    if (action.label === 'Проверить текст') return action.label;
    return 'Заполнить текст';
  }
  return action.label;
}

interface PublicDesignEditorMobileDockProps {
  activePanel: PublicDesignMobilePanel;
  photoCount: number;
  missingPhotoCount: number;
  textFieldCount: number;
  missingTextCount: number;
  checkIssueCount: number;
  nextAction: PublicEditorNextAction;
  onPanelChange: (panel: PublicDesignMobilePanel) => void;
  onNextAction: () => void;
}

export const PublicDesignEditorMobileDock: React.FC<PublicDesignEditorMobileDockProps> = ({
  activePanel,
  photoCount,
  missingPhotoCount,
  textFieldCount,
  missingTextCount,
  checkIssueCount,
  nextAction,
  onPanelChange,
  onNextAction,
}) => (
  <nav className="public-design-editor__mobile-dock" aria-label="Переключение макета, фото и текста">
    <div className="public-design-editor__mobile-dock-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        className={`public-design-editor__mobile-dock-tab${activePanel === 'canvas' ? ' is-active' : ''}`}
        aria-selected={activePanel === 'canvas'}
        onClick={() => onPanelChange('canvas')}
      >
        <span>Макет</span>
      </button>
      <button
        type="button"
        role="tab"
        className={`public-design-editor__mobile-dock-tab${activePanel === 'photos' ? ' is-active' : ''}`}
        aria-selected={activePanel === 'photos'}
        onClick={() => onPanelChange('photos')}
      >
        <span>Фото</span>
        {photoCount > 0 && <em>{photoCount}</em>}
        {missingPhotoCount > 0 && <b aria-label={`Не хватает в ${missingPhotoCount} полях`}>{missingPhotoCount}</b>}
      </button>
      {textFieldCount > 0 && (
        <button
          type="button"
          role="tab"
          className={`public-design-editor__mobile-dock-tab${activePanel === 'text' ? ' is-active' : ''}`}
          aria-selected={activePanel === 'text'}
          onClick={() => onPanelChange('text')}
        >
          <span>Текст</span>
          {missingTextCount > 0 && <b aria-label={`Не заполнено ${missingTextCount} полей`}>{missingTextCount}</b>}
        </button>
      )}
      <button
        type="button"
        role="tab"
        className={`public-design-editor__mobile-dock-tab${activePanel === 'check' ? ' is-active' : ''}`}
        aria-selected={activePanel === 'check'}
        onClick={() => onPanelChange('check')}
      >
        <span>Проверка</span>
        {checkIssueCount > 0 && <b aria-label={`Замечаний: ${checkIssueCount}`}>{checkIssueCount}</b>}
      </button>
    </div>
    {nextAction.kind !== 'readyForCart' && (
      <button
        type="button"
        className="public-design-editor__mobile-dock-next"
        onClick={onNextAction}
      >
        {mobileDockActionLabel(nextAction)}
      </button>
    )}
  </nav>
);
