import React from 'react';
import { BynSymbol } from './BynSymbol';

type MoneyAmountProps = {
  value: number | string | null | undefined;
  decimals?: number;
  signed?: boolean;
  className?: string;
};

const formatMoneyValue = (value: number | string, decimals: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);

  return numericValue.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const MoneyAmount: React.FC<MoneyAmountProps> = ({
  value,
  decimals = 2,
  signed = false,
  className = '',
}) => {
  if (value == null || value === '') return <>—</>;

  const numericValue = Number(value);
  const sign = signed && Number.isFinite(numericValue) && numericValue > 0 ? '+' : '';

  return (
    <span className={['money-amount', className].filter(Boolean).join(' ')}>
      {sign}
      {formatMoneyValue(value, decimals)} <BynSymbol />
    </span>
  );
};
