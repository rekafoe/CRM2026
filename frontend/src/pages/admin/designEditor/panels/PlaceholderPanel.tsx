import React from 'react';
import { AppIcon } from '../../../../components/ui/AppIcon';

interface PlaceholderPanelProps {
  title: string;
  onClose: () => void;
}

export const PlaceholderPanel: React.FC<PlaceholderPanelProps> = ({ title, onClose }) => (
  <div className="design-editor-panel-content">
    <div className="design-editor-panel-header">
      <h3 className="design-editor-panel-title">{title}</h3>
      <button type="button" className="design-editor-panel-close" onClick={onClose} aria-label="Закрыть">
        <AppIcon name="x" size="sm" />
      </button>
    </div>
    <p className="design-editor-panel-placeholder">Раздел в разработке.</p>
  </div>
);
