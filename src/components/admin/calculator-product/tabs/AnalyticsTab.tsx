import React from 'react';
import { EmptyState } from '../../../common';

export const AnalyticsTab: React.FC = React.memo(() => {
  return (
    <div className="test-form-section">
      <EmptyState
        icon="📊"
        title="Аналитика продуктов"
        description="Раздел аналитики будет добавлен в следующих версиях системы"
      />
    </div>
  );
});


