import React from 'react';
import { Button } from '../../components/common';
import { EditorViewControls, type EditorViewOptions } from './EditorViewControls';

interface EditorStageToolbarProps {
  fragmentLabel: string;
  fragmentDetail: string;
  issueCount?: number;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  viewOptions: EditorViewOptions;
  toolsSlot?: React.ReactNode;
  onViewOptionsChange: (value: EditorViewOptions) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export const EditorStageToolbar: React.FC<EditorStageToolbarProps> = ({
  fragmentLabel,
  fragmentDetail,
  issueCount = 0,
  canUndo,
  canRedo,
  zoom,
  viewOptions,
  toolsSlot,
  onViewOptionsChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}) => (
  <div className="public-design-editor__stage-toolbar">
    <div className="public-design-editor__page-caption">
      <strong>{fragmentLabel}</strong>
      <span>{fragmentDetail}</span>
      {issueCount > 0 && <em>{issueCount} к проверке</em>}
    </div>
    <div className="public-design-editor__canvas-actions">
      {toolsSlot}
      <details className="public-design-editor__stage-hints">
        <summary>Подсказки</summary>
        <div className="public-design-editor__stage-hints-panel">
          <EditorViewControls value={viewOptions} onChange={onViewOptionsChange} />
        </div>
      </details>
      <Button variant="secondary" size="sm" onClick={onUndo} disabled={!canUndo} title="Отменить">↶</Button>
      <Button variant="secondary" size="sm" onClick={onRedo} disabled={!canRedo} title="Повторить">↷</Button>
      <Button variant="secondary" size="sm" onClick={onZoomOut} title="Уменьшить">−</Button>
      <button type="button" className="public-design-editor__zoom-value" onClick={onZoomReset}>
        {Math.round(zoom * 100)}%
      </button>
      <Button variant="secondary" size="sm" onClick={onZoomIn} title="Увеличить">+</Button>
    </div>
  </div>
);
