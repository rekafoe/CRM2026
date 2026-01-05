import React from 'react';
import { CostCalculation } from './CostCalculation';

interface WarehouseCostCalculationProps {
  onClose: () => void;
}

export const WarehouseCostCalculation: React.FC<WarehouseCostCalculationProps> = ({ onClose }) => {
  return (
    <div className="warehouse-cost-calculation">
      <div className="cost-calculation-header">
        <h2>💰 Расчет себестоимости</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>
      <CostCalculation />
    </div>
  );
};
