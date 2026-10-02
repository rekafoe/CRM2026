import React from 'react';
import { MaterialsAnalytics } from './MaterialsAnalytics';

interface WarehouseAnalyticsProps {
  onClose: () => void;
}

export const WarehouseAnalytics: React.FC<WarehouseAnalyticsProps> = ({ onClose }) => {
  return (
    <div className="warehouse-analytics">
      <div className="analytics-header">
        <h2>Аналитика склада</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>
      <MaterialsAnalytics />
    </div>
  );
};
