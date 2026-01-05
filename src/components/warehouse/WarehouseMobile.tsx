import React from 'react';
import { MobileWarehouse } from './MobileWarehouse';

interface WarehouseMobileProps {
  onClose: () => void;
}

export const WarehouseMobile: React.FC<WarehouseMobileProps> = ({ onClose }) => {
  return (
    <div className="warehouse-mobile">
      <MobileWarehouse onClose={onClose} />
    </div>
  );
};
