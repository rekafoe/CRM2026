import { useState, useEffect, useMemo } from 'react';
import { getPriceTypes } from '../../services/pricing';

export interface PriceTypeLabel {
  name: string;
  multiplier: number;
  /** Отображаемая строка: "Срочно (+50%)" или "Онлайн (−15%)" */
  displayLabel: string;
}

/**
 * Хук загружает типы цен из API и возвращает карту key -> { name, multiplier, displayLabel }.
 * Используется для отображения типа цены без хардкода.
 */
export function usePriceTypeLabels(): Record<string, PriceTypeLabel> {
  const [priceTypes, setPriceTypes] = useState<Array<{ key: string; name: string; multiplier: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    getPriceTypes(true)
      .then((list) => {
        if (!cancelled) {
          setPriceTypes(list.map((pt) => ({ key: pt.key, name: pt.name, multiplier: pt.multiplier })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const map: Record<string, PriceTypeLabel> = {};
    for (const pt of priceTypes) {
      const mult = pt.multiplier;
      const pct = mult !== 1 ? ((mult - 1) * 100).toFixed(0) : null;
      const suffix = pct != null
        ? ` (${Number(pct) >= 0 ? '+' : ''}${pct}%)`
        : '';
      map[pt.key] = {
        name: pt.name,
        multiplier: mult,
        displayLabel: `${pt.name}${suffix}`,
      };
    }
    return map;
  }, [priceTypes]);
}
