import React, { useState } from 'react';

/** Допускает ввод «3,05» / «0» по blur; совместимо с PriceCell / PrintPriceEditPage */
const DECIMAL_TYPING = /^\d*[.,]?\d*$/;

export interface DecimalNumberInputProps {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  /** Пустая строка при blur → null */
  nullable?: boolean;
  /** Если не nullable и blur на пустоту */
  emptyFallback?: number;
  /** После парсинга: Math.max(n, minClamp) */
  minClamp?: number;
  /** Округление при blur */
  fractionDigits?: number;
}

/**
 * Текстовое поле для десятичных чисел (запятая/точка), значение фиксируется по blur — как в шаблонах цен и печати.
 */
export const DecimalNumberInput: React.FC<DecimalNumberInputProps> = ({
  value,
  onChange,
  className,
  placeholder,
  'aria-label': ariaLabel,
  nullable = false,
  emptyFallback = 0,
  minClamp,
  fractionDigits,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const displayWhenBlurred =
    nullable && (value === null || value === undefined) ? '' : String(value ?? emptyFallback);
  const displayValue = isFocused ? inputValue : displayWhenBlurred;

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={displayValue}
      onFocus={() => {
        setInputValue(value === null || value === undefined ? '' : String(value));
        setIsFocused(true);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '' || DECIMAL_TYPING.test(raw)) setInputValue(raw);
      }}
      onBlur={() => {
        const normalized = inputValue.replace(',', '.').trim();
        if (normalized === '') {
          if (nullable) onChange(null);
          else onChange(emptyFallback);
          setIsFocused(false);
          return;
        }
        let num = parseFloat(normalized);
        if (Number.isNaN(num)) {
          if (nullable) onChange(null);
          else onChange(emptyFallback);
          setIsFocused(false);
          return;
        }
        if (minClamp !== undefined) num = Math.max(num, minClamp);
        if (fractionDigits !== undefined) {
          const p = 10 ** fractionDigits;
          num = Math.round(num * p) / p;
        }
        onChange(num);
        setIsFocused(false);
      }}
    />
  );
};
