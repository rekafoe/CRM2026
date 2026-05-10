import React from 'react';
import { DecimalNumberInput } from '../../../components/common/DecimalNumberInput';

export const PriceCell: React.FC<{
  value: number;
  onChange: (v: number) => void;
  className?: string;
}> = ({ value, onChange, className }) => (
  <DecimalNumberInput
    value={value}
    onChange={(v) => onChange(v ?? 0)}
    emptyFallback={0}
    className={className}
  />
);
