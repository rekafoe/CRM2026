import React from 'react';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';

interface PublicDesignStageGuideProps {
  fragmentLabel: string;
  fragmentDetail: string;
  issueCount: number;
  nextAction: PublicEditorNextAction;
  onNextAction: () => void;
}

export const PublicDesignStageGuide: React.FC<PublicDesignStageGuideProps> = ({
  fragmentLabel,
  fragmentDetail,
  issueCount,
  nextAction,
  onNextAction,
}) => (
  <section className="public-design-editor__stage-guide" aria-label="Подсказка по текущей части макета">
    <div className="public-design-editor__stage-guide-copy">
      <span>Текущая часть</span>
      <strong>{fragmentLabel}</strong>
      <p>{issueCount > 0 ? `${issueCount} пункт(ов) нужно проверить · ${fragmentDetail}` : 'Эта часть макета выглядит готовой'}</p>
    </div>
    <button
      type="button"
      className={`public-design-editor__stage-guide-action public-design-editor__stage-guide-action--${nextAction.kind}`}
      onClick={onNextAction}
    >
      <span>Следующий шаг</span>
      <strong>{nextAction.label}</strong>
      <small>{nextAction.description}</small>
    </button>
  </section>
);
