import React from 'react';
import { EmptyState } from '../common';
import './WarehouseSettings.css';

interface WarehouseSettingsProps {
  onRefresh: () => void;
}

export const WarehouseSettings: React.FC<WarehouseSettingsProps> = () => {
  return (
    <div className="warehouse-settings">
      <EmptyState
        title="Настройки склада"
        description="Раздел в разработке: пороги алертов, склады по умолчанию и правила автозаказа появятся здесь позже."
      />
    </div>
  );
};
