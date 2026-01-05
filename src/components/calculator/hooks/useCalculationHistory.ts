import { useCallback, useState } from 'react';
import { CalculationResult } from '../types/calculator.types';

const HISTORY_STORAGE_KEY = 'printing-calculator-history';

interface UseCalculationHistoryParams {
  logger: { info: Function; error: Function };
  storageKey?: string;
}

interface UseCalculationHistoryReturn {
  calculationHistory: CalculationResult[];
  loadCalculationHistory: () => void;
  saveCalculationToHistory: (calculation: CalculationResult) => void;
}

export function useCalculationHistory({
  logger,
  storageKey = HISTORY_STORAGE_KEY,
}: UseCalculationHistoryParams): UseCalculationHistoryReturn {
  const [calculationHistory, setCalculationHistory] = useState<CalculationResult[]>([]);

  const loadCalculationHistory = useCallback(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (saved) {
        const parsed = JSON.parse(saved) as CalculationResult[];
        setCalculationHistory(parsed);
        logger.info('История расчетов загружена', { count: parsed.length });
      }
    } catch (error) {
      logger.error('Ошибка загрузки истории расчетов', error);
    }
  }, [logger, storageKey]);

  const saveCalculationToHistory = useCallback(
    (calculation: CalculationResult) => {
      try {
        setCalculationHistory((prev) => {
          const next = [calculation, ...prev].slice(0, 10);
          if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(next));
          }
          logger.info('Расчет сохранен в историю');
          return next;
        });
      } catch (error) {
        logger.error('Ошибка сохранения в историю', error);
      }
    },
    [logger, storageKey],
  );

  return {
    calculationHistory,
    loadCalculationHistory,
    saveCalculationToHistory,
  };
}

