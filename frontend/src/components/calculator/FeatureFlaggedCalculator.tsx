import React from 'react';
import { ImprovedPrintingCalculatorModal } from './ImprovedPrintingCalculatorModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddToOrder: (item: any) => void;
  initialProductType?: string;
  initialProductId?: number | null;
  editContext?: Parameters<typeof ImprovedPrintingCalculatorModal>[0]['editContext'];
  onSubmitExisting?: Parameters<typeof ImprovedPrintingCalculatorModal>[0]['onSubmitExisting'];
}

export const FeatureFlaggedCalculator: React.FC<Props> = (props) => {
  const useNew = true;

  return <ImprovedPrintingCalculatorModal {...props} />;
};

export default FeatureFlaggedCalculator;


