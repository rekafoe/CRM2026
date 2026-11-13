/**
 * Лимиты страниц переплёта — прямо в листовой строке варианта,
 * рядом с материалом списания и ценой.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { VariantWithTiers } from './ServiceVariantsTable.types';
import { readBindingPagesLimits } from '../../../../utils/multipageBinding';

export interface VariantBindingPagesLimitsProps {
  variant: VariantWithTiers;
  onUpdate: (variantId: number, params: Record<string, unknown>) => void | Promise<void>;
}

function inputValue(value: number | null): string {
  return value != null ? String(value) : '';
}

function positiveInteger(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const VariantBindingPagesLimits: React.FC<VariantBindingPagesLimitsProps> = ({
  variant,
  onUpdate,
}) => {
  const limits = useMemo(
    () => readBindingPagesLimits(variant.parameters),
    [variant.parameters],
  );
  const [minPages, setMinPages] = useState(() => inputValue(limits.minPages));
  const [maxPages, setMaxPages] = useState(() => inputValue(limits.maxPages));

  useEffect(() => {
    setMinPages(inputValue(limits.minPages));
    setMaxPages(inputValue(limits.maxPages));
  }, [limits.minPages, limits.maxPages]);

  const minValue = positiveInteger(minPages);
  const maxValue = positiveInteger(maxPages);
  const rangeInvalid = minValue != null && maxValue != null && minValue > maxValue;

  const commit = useCallback(() => {
    const min = positiveInteger(minPages);
    const max = positiveInteger(maxPages);
    if (min != null && max != null && min > max) return;
    const nextParams: Record<string, unknown> = { ...(variant.parameters || {}) };
    delete nextParams.minPages;
    delete nextParams.maxPages;
    if (min != null) nextParams.min_pages = min;
    else delete nextParams.min_pages;
    if (max != null) nextParams.max_pages = max;
    else delete nextParams.max_pages;
    void onUpdate(variant.id, nextParams);
  }, [maxPages, minPages, onUpdate, variant.id, variant.parameters]);

  const handleEnter = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }, []);

  return (
    <div className={`variant-binding-pages${rangeInvalid ? ' variant-binding-pages--invalid' : ''}`}>
      <span className="variant-binding-pages__label">Страницы изделия</span>
      <div className="variant-binding-pages__controls">
        <label>
          <span>от</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={minPages}
            placeholder="от"
            aria-invalid={rangeInvalid || undefined}
            aria-label="Страницы изделия, от"
            onChange={(event) => setMinPages(event.target.value)}
            onBlur={commit}
            onKeyDown={handleEnter}
          />
          <span className="variant-binding-pages__suffix">стр.</span>
        </label>
        <label>
          <span>до</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={maxPages}
            placeholder="до"
            aria-invalid={rangeInvalid || undefined}
            aria-label="Страницы изделия, до"
            onChange={(event) => setMaxPages(event.target.value)}
            onBlur={commit}
            onKeyDown={handleEnter}
          />
          <span className="variant-binding-pages__suffix">стр.</span>
        </label>
      </div>
      <p className="variant-binding-pages__hint">
        {rangeInvalid
          ? '„от“ больше „до“'
          : 'Общее число страниц изделия, вместе с обложкой. Не число печатных листов. Пусто — без лимита.'}
      </p>
    </div>
  );
};
