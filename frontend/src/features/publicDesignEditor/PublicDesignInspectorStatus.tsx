import React from 'react';
import type { PublicEditorNextAction } from './publicDesignTaskFlow';
import type { PublicEditorPreflightSummary } from './publicDesignPreflight';
import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';

interface PublicDesignInspectorStatusProps {
  fragmentLabel: string;
  fragmentPreflight: PublicEditorPreflightSummary;
  globalPreflight: PublicEditorPreflightSummary;
  nextAction: PublicEditorNextAction;
  pageCount: number;
  pageStatuses: Record<number, PageStripStatus>;
  saving: boolean;
  onNextAction: () => void;
}

export const PublicDesignInspectorStatus: React.FC<PublicDesignInspectorStatusProps> = ({
  fragmentLabel,
  fragmentPreflight,
  globalPreflight,
  nextAction,
  pageCount,
  pageStatuses,
  saving,
  onNextAction,
}) => {
  const readyPages = Array.from({ length: pageCount }, (_, pageIndex) => pageStatuses[pageIndex])
    .filter((status) => status?.tone === 'ready').length;
  const fragmentErrors = fragmentPreflight.issues.filter((issue) => issue.level === 'error').length;
  const fragmentWarnings = fragmentPreflight.issues.filter((issue) => issue.level === 'warning').length;
  const globalErrors = globalPreflight.issues.filter((issue) => issue.level === 'error').length;
  const statusTitle = globalErrors > 0
    ? `Нужно исправить ${globalErrors}`
    : globalPreflight.issues.length > 0
      ? 'Есть предупреждения'
      : 'Можно оформлять';

  return (
    <section className="public-design-editor__inspector-status">
      <div className="public-design-editor__inspector-status-head">
        <span>Работа с макетом</span>
        <strong>{statusTitle}</strong>
        <p>
          {fragmentLabel}: {fragmentErrors > 0
            ? `${fragmentErrors} ошибок`
            : fragmentWarnings > 0
              ? `${fragmentWarnings} предупреждений`
              : 'готово'}
        </p>
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
        <span>Главное действие</span>
        <strong>{nextAction.label}</strong>
        <small>{nextAction.description}</small>
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
