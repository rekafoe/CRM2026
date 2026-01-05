import React from 'react';
import '../../styles/utilities.css';

interface PriceIndicatorProps {
  percent: number;
  showIcon?: boolean;
  className?: string;
}

export const PriceIndicator: React.FC<PriceIndicatorProps> = ({ 
  percent, 
  showIcon = true,
  className = '' 
}) => {
  const getColorClass = (percent: number) => {
    if (percent > 0) return 'text-price-increase';
    if (percent < 0) return 'text-price-decrease';
    return 'text-price-neutral';
  };

  const getIcon = (percent: number) => {
    if (percent > 0) return '📈';
    if (percent < 0) return '📉';
    return '➡️';
  };

  const formatPercent = (percent: number) => `${percent.toFixed(2)}%`;

  return (
    <span className={`${getColorClass(percent)} font-semibold ${className}`}>
      {showIcon && getIcon(percent)} {formatPercent(percent)}
    </span>
  );
};
