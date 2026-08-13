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

  const commit = useCallback(() => {
    const min = positiveInteger(minPages);
    const max = positiveInteger(maxPages);
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
    <div className="variant-binding-pages">
      <span className="variant-binding-pages__label">Страницы</span>
      <div className="variant-binding-pages__controls">
        <label>
          <span>от</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={minPages}
            placeholder="мин."
            aria-label="Минимум страниц для этого варианта переплёта"
            onChange={(event) => setMinPages(event.target.value)}
            onBlur={commit}
            onKeyDown={handleEnter}
          />
        </label>
        <label>
          <span>до</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={maxPages}
            placeholder="макс."
            aria-label="Максимум страниц для этого варианта переплёта"
            onChange={(event) => setMaxPages(event.target.value)}
            onBlur={commit}
            onKeyDown={handleEnter}
          />
        </label>
      </div>
    </div>
  );
};
