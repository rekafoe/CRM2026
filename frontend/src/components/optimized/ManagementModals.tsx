import React from 'react';
import { CalculatorModal } from '../calculator/components/CalculatorModal';

interface ManagementModalsProps {
  // Modal states
  showPrintingCalculator: boolean;
  
  // Data
  currentUser: { id: number; name: string; role: string } | null;
  
  // Handlers
  onClosePrintingCalculator: () => void;
  onAddToOrder: (item: any) => void;
}

export const ManagementModals: React.FC<ManagementModalsProps> = ({
  showPrintingCalculator,
  currentUser,
  onClosePrintingCalculator,
  onAddToOrder,
}) => {
  return (
    <>
      {/* Калькулятор типографии */}
      <CalculatorModal
        isOpen={showPrintingCalculator}
        onClose={onClosePrintingCalculator}
        onAddToOrder={onAddToOrder}
      />
    </>
  );
};
