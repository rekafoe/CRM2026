import React from 'react';
import { AppIcon } from '../../../components/ui/AppIcon';
import type { TextOverflowWarningMarker } from './designEditorTextOverflowLive';
import './TextOverflowWarningOverlay.css';

interface TextOverflowWarningOverlayProps {
  canvasWidthPx: number;
  pageHeightPx: number;
  warnings: TextOverflowWarningMarker[];
}

export const TextOverflowWarningOverlay: React.FC<TextOverflowWarningOverlayProps> = ({
  canvasWidthPx,
  pageHeightPx,
  warnings,
}) => {
  if (warnings.length === 0) return null;

  return (
    <div
      className="design-editor-text-overflow-overlay"
      style={{ width: canvasWidthPx, height: pageHeightPx }}
      aria-hidden={false}
    >
      {warnings.map((warning) => (
        <div
          key={warning.id}
          className="design-editor-text-overflow-badge"
          style={{ left: warning.x, top: warning.y }}
          title="Текст выходит за край страницы — уменьшите кегль, сократите надпись или переместите поле"
          role="img"
          aria-label="Текст выходит за край страницы"
        >
          <AppIcon name="warning" size="sm" className="design-editor-text-overflow-badge__icon" />
        </div>
      ))}
    </div>
  );
};
