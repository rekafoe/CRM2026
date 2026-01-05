import React from 'react';

interface CalculatorHeaderProps {
  title: string;
  onClose: () => void;
}

export const CalculatorHeader: React.FC<CalculatorHeaderProps> = ({
  title,
  onClose
}) => {
  return (
    <div className="calculator-header">
      <h2>{title}</h2>
      <button className="calculator-close-btn" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

