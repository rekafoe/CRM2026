import React from 'react';
import { Button } from '../../components/common';

interface EditorTopBarProps {
  templateName: string;
  documentLabel: string;
  saving: boolean;
  saveState?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  actionBar?: React.ReactNode;
  hideIdleSaveChip?: boolean;
  helpOpen?: boolean;
  helpLabel?: string;
  orderLabel?: string;
  savingLabel?: string;
  /** Компактная шапка для телефона: имя шаблона в бренде, без центра и кнопки «Помощь». */
  compact?: boolean;
  onSaveRetry?: () => void;
  onHelpToggle?: () => void;
  onPrimaryAction?: () => void;
}

const SAVE_STATE_COPY: Record<NonNullable<EditorTopBarProps['saveState']>, string> = {
  idle: 'Готов к работе',
  dirty: 'Есть изменения',
  saving: 'Сохраняем...',
  saved: 'Сохранено',
  error: 'Ошибка сохранения',
};

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  templateName,
  documentLabel,
  saving,
  saveState = saving ? 'saving' : 'idle',
  actionBar,
  hideIdleSaveChip = false,
  helpOpen = false,
  helpLabel,
  orderLabel = 'Заказать',
  savingLabel = 'Готовим...',
  compact = false,
  onSaveRetry,
  onHelpToggle,
  onPrimaryAction,
}) => {
  const showSaveChip = !(hideIdleSaveChip && saveState === 'idle');
  const saveChipNearTitle = Boolean(actionBar);

  const saveChip = showSaveChip ? (
    <span className={`public-design-editor__save-chip public-design-editor__save-chip--${saveState}`}>
      {SAVE_STATE_COPY[saveState]}
    </span>
  ) : null;

  return (
    <header
      className={[
        'public-design-editor__topbar',
        compact ? 'public-design-editor__topbar--compact' : '',
        actionBar ? 'public-design-editor__topbar--client-actions' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="public-design-editor__brand">
        <div className="public-design-editor__logo" aria-label="PrintCore">
          <span className="public-design-editor__logo-mark">P</span>
          <span className="public-design-editor__logo-text">PrintCore Studio</span>
        </div>
        {compact && (
          <div className="public-design-editor__brand-copy">
            <span className="public-design-editor__eyebrow">{documentLabel}</span>
            <div className="public-design-editor__title-main">
              <h1>{templateName}</h1>
              {saveChipNearTitle ? saveChip : null}
            </div>
          </div>
        )}
      </div>
      {!compact && (
        <div className="public-design-editor__title">
          <div className="public-design-editor__title-main">
            <span className="public-design-editor__eyebrow">{documentLabel}</span>
            <h1>{templateName}</h1>
            {saveChipNearTitle ? saveChip : null}
          </div>
        </div>
      )}
      <div className="public-design-editor__top-actions">
        {!saveChipNearTitle && saveChip}
        {saveState === 'error' && onSaveRetry && (
          <Button variant="secondary" onClick={onSaveRetry} disabled={saving}>
            Повторить
          </Button>
        )}
        {onHelpToggle && !compact && (
          <Button variant="secondary" onClick={onHelpToggle}>
            {helpLabel ?? (helpOpen ? 'Скрыть помощь' : 'Помощь')}
          </Button>
        )}
        {onPrimaryAction && (
          <Button onClick={onPrimaryAction} disabled={saving}>
            {saving ? savingLabel : orderLabel}
          </Button>
        )}
        {actionBar}
      </div>
    </header>
  );
};
