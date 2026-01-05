import React from 'react';
import { ComparisonModal } from '../ComparisonModal';
import { AIDashboard } from '../AIDashboard';

interface Props {
  showComparison: boolean;
  showAIDashboard: boolean;
  showDynamicPricingManager: boolean;
  onCloseComparison: () => void;
  onCloseAI: () => void;
  onCloseDynamicPricing: () => void;
  onSelectVariant: (variant: any) => void;
  comparisonItems: any[];
}

export const AuxiliaryModals: React.FC<Props> = ({
  showComparison,
  showAIDashboard,
  showDynamicPricingManager,
  onCloseComparison,
  onCloseAI,
  onCloseDynamicPricing,
  onSelectVariant,
  comparisonItems
}) => {
  return (
    <>
      {showComparison && (
        <ComparisonModal
          isOpen={showComparison}
          onClose={onCloseComparison}
          onSelectVariant={onSelectVariant}
          initialItems={comparisonItems}
        />
      )}

      {showAIDashboard && (
        <AIDashboard
          isOpen={showAIDashboard}
          onClose={onCloseAI}
          onApplyRecommendation={(rec) => onSelectVariant(rec as any)}
        />
      )}

    </>
  );
};


