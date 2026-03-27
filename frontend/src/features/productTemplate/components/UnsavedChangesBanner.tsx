import React from 'react';
import { Button } from '../../../components/common';

interface UnsavedChangesBannerProps {
  visible: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
}

export const UnsavedChangesBanner: React.FC<UnsavedChangesBannerProps> = ({
  visible,
  saving,
  onSave,
}) => {
  if (!visible) return null;

  return (
    <div className="unsaved-changes-banner">
      <div className="unsaved-changes-banner__content">
        <span className="unsaved-changes-banner__text">Появились несохраненные изменения</span>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
};

