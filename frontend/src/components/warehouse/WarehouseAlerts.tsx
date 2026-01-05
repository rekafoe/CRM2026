import React from 'react';
import { LowStockAlerts } from './LowStockAlerts';

interface WarehouseAlertsProps {
  onClose: () => void;
}

export const WarehouseAlerts: React.FC<WarehouseAlertsProps> = ({ onClose }) => {
  return (
    <div className="warehouse-alerts">
      <div className="alerts-header">
        <h2>🚨 Алерты склада</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>
      <LowStockAlerts />
    </div>
  );
};