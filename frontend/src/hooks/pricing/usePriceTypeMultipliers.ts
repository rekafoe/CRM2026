import { useState, useEffect, useMemo } from 'react';
import { getPriceTypes } from '../../services/pricing';

/**
 * Хук загружает типы цен из API и возвращает карту key -> multiplier.
 * Используется в калькуляторе для расчёта цены по выбранному типу.
 */
export function usePriceTypeMultipliers(): Record<string, number> {
  const [priceTypes, setPriceTypes] = useState<Array<{ key: string; multiplier: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    getPriceTypes(true)
      .then((list) => {
        if (!cancelled) {
          setPriceTypes(list.map((pt) => ({ key: pt.key, multiplier: pt.multiplier })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const map: Record<string, number> = {};
    for (const pt of priceTypes) {
      map[pt.key] = pt.multiplier;
    }
    return map;
  }, [priceTypes]);
}
