import React from 'react';
import { Button } from '../../components/common';

interface EditorTopBarProps {
  templateName: string;
  documentLabel: string;
  saving: boolean;
  helpOpen?: boolean;
  helpLabel?: string;
  orderLabel?: string;
  savingLabel?: string;
  onHelpToggle?: () => void;
  onPrimaryAction: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  templateName,
  documentLabel,
  saving,
  helpOpen = false,
  helpLabel,
  orderLabel = 'Заказать',
  savingLabel = 'Готовим...',
  onHelpToggle,
  onPrimaryAction,
}) => (
  <header className="public-design-editor__topbar">
    <div className="public-design-editor__brand">
      <div className="public-design-editor__logo" aria-label="PrintCore">
        <span className="public-design-editor__logo-mark">P</span>
        <span className="public-design-editor__logo-text">PrintCore Studio</span>
      </div>
    </div>
    <div className="public-design-editor__title">
      <span className="public-design-editor__eyebrow">{documentLabel}</span>
      <h1>{templateName}</h1>
    </div>
    <div className="public-design-editor__top-actions">
      {onHelpToggle && (
        <Button variant="secondary" onClick={onHelpToggle}>
          {helpLabel ?? (helpOpen ? 'Скрыть помощь' : 'Помощь')}
        </Button>
      )}
      <Button onClick={onPrimaryAction} disabled={saving}>
        {saving ? savingLabel : orderLabel}
      </Button>
    </div>
  </header>
);
