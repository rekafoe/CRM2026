import React from 'react';

interface WarehouseSettingsProps {
  onRefresh: () => void;
}

export const WarehouseSettings: React.FC<WarehouseSettingsProps> = ({ onRefresh }) => {
  return (
    <div className="warehouse-settings">
      <div className="coming-soon">
        <div className="coming-soon-content">
          <div className="coming-soon-icon">⚙️</div>
          <h3>Настройки склада</h3>
          <p>Функционал в разработке</p>
          <p>Здесь будет конфигурация складских процессов</p>
        </div>
      </div>
    </div>
  );
};
