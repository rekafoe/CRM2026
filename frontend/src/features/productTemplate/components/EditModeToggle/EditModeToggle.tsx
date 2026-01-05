/**
 * Переключатель режима редактирования
 * Позволяет переключаться между просмотром и редактированием
 */

import React from 'react';
import { Button } from '../../../../components/common';

interface EditModeToggleProps {
  isEditMode: boolean;
  onToggle: () => void;
  hasUnsavedChanges?: boolean;
}

export const EditModeToggle: React.FC<EditModeToggleProps> = ({
  isEditMode,
  onToggle,
  hasUnsavedChanges = false,
}) => {
  return (
    <div className="edit-mode-toggle">
      <Button
        variant={isEditMode ? 'primary' : 'secondary'}
        size="sm"
        onClick={onToggle}
        className={hasUnsavedChanges ? 'has-changes' : ''}
      >
        {isEditMode ? (
          <>
            👁️ Режим просмотра
            {hasUnsavedChanges && <span className="unsaved-indicator">●</span>}
          </>
        ) : (
          '✏️ Режим редактирования'
        )}
      </Button>
    </div>
  );
};

