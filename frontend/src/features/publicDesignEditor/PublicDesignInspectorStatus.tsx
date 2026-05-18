import React from 'react';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type { PublicEditorPreflightSummary } from './publicDesignPreflight';
import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';

interface PublicDesignInspectorStatusProps {
  fragmentLabel: string;
  globalPreflight: PublicEditorPreflightSummary;
  nextAction: PublicEditorNextAction;
  pageCount: number;
  pageStatuses: Record<number, PageStripStatus>;
  saving: boolean;
  onNextAction: () => void;
}

export const PublicDesignInspectorStatus: React.FC<PublicDesignInspectorStatusProps> = ({
  fragmentLabel,
  globalPreflight,
  nextAction,
  pageCount,
  pageStatuses,
  saving,
  onNextAction,
}) => {
  const readyPages = Array.from({ length: pageCount }, (_, pageIndex) => pageStatuses[pageIndex])
    .filter((status) => status?.tone === 'ready').length;

  return (
    <section className="public-design-editor__inspector-status">
      <div className="public-design-editor__inspector-status-head">
        <span>Работа с макетом</span>
        <strong>{globalPreflight.hasBlockingIssues ? 'Осталось заполнить' : 'Можно заказывать'}</strong>
        <p>{fragmentLabel}</p>
      </div>

      <div className="public-design-editor__inspector-metrics" aria-label="Готовность макета">
        <InspectorMetric label="Фото" value={`${globalPreflight.photoReady}/${globalPreflight.photoTotal}`} />
        <InspectorMetric label="Текст" value={`${globalPreflight.textReady}/${globalPreflight.textTotal}`} />
        <InspectorMetric label="Страницы" value={`${readyPages}/${pageCount}`} />
      </div>

      <button
        type="button"
        className={`public-design-editor__inspector-next public-design-editor__inspector-next--${nextAction.kind}`}
        onClick={onNextAction}
        disabled={saving}
      >
        <span>Следующий шаг</span>
        <strong>{nextAction.label}</strong>
      </button>
    </section>
  );
};

const InspectorMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="public-design-editor__inspector-metric">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);
