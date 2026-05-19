import React from 'react';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';

export type PublicDesignMobilePanel = 'canvas' | 'photos';

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
  nextAction: PublicEditorNextAction;
  onPanelChange: (panel: PublicDesignMobilePanel) => void;
  onNextAction: () => void;
}

export const PublicDesignEditorMobileDock: React.FC<PublicDesignEditorMobileDockProps> = ({
  activePanel,
  photoCount,
  missingPhotoCount,
  nextAction,
  onPanelChange,
  onNextAction,
}) => (
  <nav className="public-design-editor__mobile-dock" aria-label="Переключение макета и фото">
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
