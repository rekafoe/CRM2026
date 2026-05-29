import React from 'react';
import { Alert } from '../../components/common';

interface PublicDesignEditorAlertsProps {
  status: string | null;
  error: string | null;
  textHint?: string | null;
  onStatusClose: () => void;
  onErrorClose: () => void;
  onTextHintClose?: () => void;
}

export const PublicDesignEditorAlerts: React.FC<PublicDesignEditorAlertsProps> = ({
  status,
  error,
  textHint,
  onStatusClose,
  onErrorClose,
  onTextHintClose,
}) => {
  if (!status && !error && !textHint) return null;

  return (
    <div className="public-design-editor__alerts">
      {textHint && (
        <Alert type="warning" onClose={onTextHintClose}>
          {textHint}
        </Alert>
      )}
      {status && <Alert type="success" onClose={onStatusClose}>{status}</Alert>}
      {error && <Alert type="error" onClose={onErrorClose}>{error}</Alert>}
    </div>
  );
};
