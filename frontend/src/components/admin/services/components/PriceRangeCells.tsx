/**
 * Компонент для рендеринга ячеек диапазонов цен
 * Используется внутри существующей таблицы ServiceVariantsTable
 * Сохраняет стили Element UI и интегрируется с текущей структурой
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { PriceRange, PriceRangeUtils } from '../../../../hooks/usePriceRanges';
import { ServiceVolumeTier } from '../../../../types/pricing';

export interface PriceRangeCellsProps {
  /**
   * Диапазоны цен для текущего варианта
   */
  tiers: ServiceVolumeTier[];
  
  /**
   * Общие диапазоны для всех вариантов
   */
  commonRanges: PriceRange[];
  
  /**
   * Callback при изменении цены
   */
  onPriceChange: (minQty: number, newPrice: number) => void;
  
  /**
   * Флаг редактирования
   */
  editable?: boolean;

  /**
   * Индекс диапазона, на который наведен курсор
   */
  hoveredRangeIndex?: number | null;

  /**
   * Callback для управления подсветкой столбца
   */
  onRangeHover?: (index: number | null) => void;

  /**
   * Применить цену из первого диапазона ко всем
   */
  onCopyFirstRange?: () => void;

  /**
   * Применить цену из выбранного диапазона ко всем
   */
  onCopySelectedRange?: () => void;
}

/**
 * Компонент для рендеринга ячеек диапазонов в таблице
 * Использует те же стили Element UI, что и существующая таблица
 */
export const PriceRangeCells = React.memo(({
  tiers,
  commonRanges,
  onPriceChange,
  editable = true,
  hoveredRangeIndex = null,
  onRangeHover,
}: PriceRangeCellsProps) => {
  // Создаем Map для быстрого поиска tiers по minQuantity
  const tiersMap = useMemo(() => {
    return new Map(tiers.map(t => [t.minQuantity, t]));
  }, [tiers]);

  // Состояние для отслеживания фокуса и локального значения ввода
  const [focusedInput, setFocusedInput] = useState<number | null>(null);
  const [localValues, setLocalValues] = useState<Map<number, string>>(new Map());
  const debounceTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      debounceTimersRef.current.forEach((timer) => clearTimeout(timer));
      debounceTimersRef.current.clear();
    };
  }, []);

  const handlePriceChange = useCallback((minQty: number, value: string) => {
    // Обновляем локальное значение
    setLocalValues(prev => {
      const newMap = new Map(prev);
      newMap.set(minQty, value);
      return newMap;
    });

    // Разрешаем пустую строку для промежуточного ввода
    if (value === '' || value === '.') {
      return;
    }
    
    // Парсим дробные числа (поддерживаем запятую и точку как разделитель)
    const normalizedValue = value.replace(',', '.');
    const newPrice = parseFloat(normalizedValue);
    
    if (!isNaN(newPrice) && isFinite(newPrice) && onPriceChange) {
      const existing = debounceTimersRef.current.get(minQty);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        onPriceChange(minQty, newPrice);
      }, 300);
      debounceTimersRef.current.set(minQty, timer);
    }
  }, [onPriceChange]);

  const handleFocus = useCallback((minQty: number, currentValue: number | null | undefined, rangeIndex: number) => {
    setFocusedInput(minQty);
    onRangeHover?.(rangeIndex);
    // Если значение равно 0, очищаем поле
    if (currentValue === 0 || currentValue === null || currentValue === undefined) {
      setLocalValues(prev => {
        const newMap = new Map(prev);
        newMap.set(minQty, '');
        return newMap;
      });
    }
  }, [onRangeHover]);

  const handleBlur = useCallback((minQty: number, currentInputValue: string) => {
    setFocusedInput(null);
    onRangeHover?.(null);
    
    // Если поле пустое при потере фокуса, устанавливаем 0
    if (currentInputValue === '' || currentInputValue === '.') {
      if (onPriceChange) {
        onPriceChange(minQty, 0);
      }
    } else {
      const normalizedValue = currentInputValue.replace(',', '.');
      const newPrice = parseFloat(normalizedValue);
      if (!isNaN(newPrice) && isFinite(newPrice) && onPriceChange) {
        const existing = debounceTimersRef.current.get(minQty);
        if (existing) {
          clearTimeout(existing);
          debounceTimersRef.current.delete(minQty);
        }
        onPriceChange(minQty, newPrice);
      }
    }
    
    // Очищаем локальное значение при потере фокуса, чтобы вернуться к реальному значению
    setLocalValues(prev => {
      const newMap = new Map(prev);
      newMap.delete(minQty);
      return newMap;
    });
  }, [onPriceChange, onRangeHover]);

  return (
    <>
      {commonRanges.map((range, rangeIndex) => {
        const tier = tiersMap.get(range.minQty);
        const isFocused = focusedInput === range.minQty;
        const localValue = localValues.get(range.minQty);
        const isHovered = hoveredRangeIndex === rangeIndex;
        
        // Если поле в фокусе и есть локальное значение, используем его
        // Иначе используем реальное значение из tier, но если оно 0 и поле не в фокусе, показываем пустую строку
        const displayValue = isFocused && localValue !== undefined
          ? localValue
          : (tier?.rate !== undefined && tier.rate !== 0 ? tier.rate : '');

        return (
          <td
            key={range.minQty}
            className={`range-cell${isHovered ? ' range-cell--active' : ''}`}
            onMouseEnter={() => onRangeHover?.(rangeIndex)}
            onMouseLeave={() => onRangeHover?.(null)}
          >
            <div className="cell range-cell-content">
              <div className="el-input el-input--small range-input-wrapper">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="el-input__inner range-input"
                  value={displayValue}
                  onChange={(e) => handlePriceChange(range.minQty, e.target.value)}
                  onFocus={() => handleFocus(range.minQty, tier?.rate, rangeIndex)}
                  onBlur={(e) => handleBlur(range.minQty, e.target.value)}
                  disabled={!editable}
                  aria-label={`Цена для диапазона от ${range.minQty}`}
                />
              </div>
            </div>
          </td>
        );
      })}
    </>
  );
});

/**
 * Компонент для рендеринга заголовков диапазонов
 */
export interface PriceRangeHeadersProps {
  /**
   * Общие диапазоны
   */
  commonRanges: PriceRange[];

  /**
   * Callback при клике на заголовок (для редактирования)
   */
  onEditRange?: (rangeIndex: number, minQty: number) => void;

  /**
   * Callback при удалении диапазона
   */
  onRemoveRange?: (rangeIndex: number) => void;

  /**
   * Callback при добавлении диапазона
   */
  onAddRange?: () => void;

  /**
   * Ref для кнопки добавления диапазона
   */
  addRangeButtonRef?: React.RefObject<HTMLButtonElement>;

  /**
   * Callback для массового применения цены
   */
  onApplyAllPrices?: (price: number) => void;

  /**
   * Индекс диапазона, на который наведен курсор
   */
  hoveredRangeIndex?: number | null;

  /**
   * Callback для управления подсветкой столбца
   */
  onRangeHover?: (index: number | null) => void;

  /**
   * Применить цену из первого диапазона ко всем
   */
  onCopyFirstRange?: () => void;

  /**
   * Применить цену из выбранного диапазона ко всем
   */
  onCopySelectedRange?: () => void;
}

export const PriceRangeHeaders: React.FC<PriceRangeHeadersProps> = ({
  commonRanges,
  onEditRange,
  onRemoveRange,
  onAddRange,
  addRangeButtonRef,
  onApplyAllPrices,
  hoveredRangeIndex = null,
  onRangeHover,
  onCopyFirstRange,
  onCopySelectedRange,
}) => {
  const [bulkPrice, setBulkPrice] = useState('');
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const removeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatRangeLabel = useCallback((range: PriceRange): string => {
    if (range.maxQty === undefined) {
      return `${range.minQty} - ∞`;
    }
    if (range.minQty === range.maxQty) {
      return String(range.minQty);
    }
    return `${range.minQty} - ${range.maxQty}`;
  }, []);

  useEffect(() => {
    return () => {
      if (removeTimeoutRef.current) {
        clearTimeout(removeTimeoutRef.current);
        removeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <>
      {commonRanges.map((range, idx) => {
        const rangeLabel = formatRangeLabel(range);
        const isHovered = hoveredRangeIndex === idx;
        const isPendingRemove = pendingRemoveIndex === idx;
        return (
          <th
            key={idx}
            className={`is-center range-header-cell${isHovered ? ' range-header-cell--active' : ''}`}
            onMouseEnter={() => onRangeHover?.(idx)}
            onMouseLeave={() => onRangeHover?.(null)}
          >
            <div className="cell range-header-content">
              <span
                className="range-header-label"
                onClick={() => onEditRange?.(idx, range.minQty)}
                title={rangeLabel}
              >
                {rangeLabel}
              </span>
              {onRemoveRange && (
                <button
                  type="button"
                  className={`el-button el-button--text el-button--mini range-remove-btn${isPendingRemove ? ' range-remove-btn--pending' : ''}`}
                  aria-label={isPendingRemove ? `Подтвердить удаление диапазона ${rangeLabel}` : `Удалить диапазон ${rangeLabel}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isPendingRemove) {
                      setPendingRemoveIndex(null);
                      onRemoveRange(idx);
                      return;
                    }
                    setPendingRemoveIndex(idx);
                    if (removeTimeoutRef.current) {
                      clearTimeout(removeTimeoutRef.current);
                    }
                    removeTimeoutRef.current = setTimeout(() => {
                      setPendingRemoveIndex(null);
                      removeTimeoutRef.current = null;
                    }, 2000);
                  }}
                >
                  {isPendingRemove ? 'Подтвердить' : '×'}
                </button>
              )}
            </div>
          </th>
        );
      })}
      {onAddRange && (
        <th style={{ padding: 0 }}>
          <div className="cell range-actions-cell">
            <div className="active-panel active-panel-with-popover range-actions-panel">
              <div className="range-bulk-input">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="el-input__inner"
                  placeholder="Цена для всех"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                  aria-label="Цена для всех диапазонов"
                />
                <button
                  type="button"
                  className="el-button el-button--primary el-button--mini"
                  onClick={() => {
                    const normalized = bulkPrice.replace(',', '.');
                    const value = parseFloat(normalized);
                    if (!isNaN(value) && isFinite(value) && onApplyAllPrices) {
                      onApplyAllPrices(value);
                    }
                  }}
                >
                  Применить
                </button>
              </div>
              <button
                type="button"
                className="el-button el-button--text el-button--mini range-copy-btn"
                onClick={() => onCopyFirstRange?.()}
              >
                Скопировать из 1-го
              </button>
              <button
                type="button"
                className="el-button el-button--text el-button--mini range-copy-btn"
                onClick={() => onCopySelectedRange?.()}
              >
                Скопировать из выбранного
              </button>
              <span>
                <button
                  ref={addRangeButtonRef}
                  type="button"
                  className="el-button el-button--info el-button--mini is-plain"
                  style={{ width: '100%', marginLeft: '0px' }}
                  onClick={onAddRange}
                >
                  <i className="el-icon-plus"></i>
                  <span>Диапазон</span>
                </button>
              </span>
            </div>
          </div>
        </th>
      )}
    </>
  );
};
