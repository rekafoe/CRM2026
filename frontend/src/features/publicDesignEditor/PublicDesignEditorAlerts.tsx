import React from 'react';
import { Alert } from '../../components/common';

interface PublicDesignEditorAlertsProps {
  status: string | null;
  error: string | null;
  onStatusClose: () => void;
  onErrorClose: () => void;
}

export const PublicDesignEditorAlerts: React.FC<PublicDesignEditorAlertsProps> = ({
  status,
  error,
  onStatusClose,
  onErrorClose,
}) => {
  if (!status && !error) return null;

  return (
    <div className="public-design-editor__alerts">
      {status && <Alert type="success" onClose={onStatusClose}>{status}</Alert>}
      {error && <Alert type="error" onClose={onErrorClose}>{error}</Alert>}
    </div>
  );
};
