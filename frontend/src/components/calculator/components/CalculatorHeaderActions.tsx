import React from 'react';

interface CalculatorHeaderActionsProps {
  onClose: () => void;
}

export const CalculatorHeaderActions: React.FC<CalculatorHeaderActionsProps> = ({
  onClose
}) => {
  return (
    <div className="header-actions">
      <button className="close-btn" onClick={onClose}>×</button>
    </div>
  );
};


