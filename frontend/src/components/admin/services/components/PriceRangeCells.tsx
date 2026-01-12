/**
 * Компонент для рендеринга ячеек диапазонов цен
 * Используется внутри существующей таблицы ServiceVariantsTable
 * Сохраняет стили Element UI и интегрируется с текущей структурой
 */

import React, { useMemo, useCallback } from 'react';
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
}

/**
 * Компонент для рендеринга ячеек диапазонов в таблице
 * Использует те же стили Element UI, что и существующая таблица
 */
export const PriceRangeCells: React.FC<PriceRangeCellsProps> = ({
  tiers,
  commonRanges,
  onPriceChange,
  editable = true,
}) => {
  // Создаем Map для быстрого поиска tiers по minQuantity
  const tiersMap = useMemo(() => {
    return new Map(tiers.map(t => [t.minQuantity, t]));
  }, [tiers]);

  const handlePriceChange = useCallback((minQty: number, value: string) => {
    const newPrice = Number(value);
    if (!isNaN(newPrice) && onPriceChange) {
      onPriceChange(minQty, newPrice);
    }
  }, [onPriceChange]);

  return (
    <>
      {commonRanges.map((range) => {
        const tier = tiersMap.get(range.minQty);
        return (
          <td key={range.minQty}>
            <div className="cell">
              <div className="el-input el-input--small">
                <input
                  type="text"
                  className="el-input__inner"
                  value={String(tier?.rate || 0)}
                  onChange={(e) => handlePriceChange(range.minQty, e.target.value)}
                  disabled={!editable}
                />
              </div>
            </div>
          </td>
        );
      })}
    </>
  );
};

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
}

export const PriceRangeHeaders: React.FC<PriceRangeHeadersProps> = ({
  commonRanges,
  onEditRange,
  onRemoveRange,
  onAddRange,
  addRangeButtonRef,
}) => {
  const formatRangeLabel = useCallback((range: PriceRange): string => {
    if (range.maxQty === undefined) {
      return `${range.minQty} - ∞`;
    }
    if (range.minQty === range.maxQty) {
      return String(range.minQty);
    }
    return `${range.minQty} - ${range.maxQty}`;
  }, []);

  return (
    <>
      {commonRanges.map((range, idx) => {
        const rangeLabel = formatRangeLabel(range);
        return (
          <th key={idx} className="is-center">
            <div className="cell">
              <span
                style={{ cursor: onEditRange ? 'pointer' : 'default' }}
                onClick={() => onEditRange?.(idx, range.minQty)}
              >
                {rangeLabel}
              </span>
              {onRemoveRange && (
                <span>
                  <button
                    type="button"
                    className="el-button el-button--text el-button--mini"
                    style={{ color: 'red', marginLeft: '4px' }}
                    onClick={() => onRemoveRange(idx)}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          </th>
        );
      })}
      {onAddRange && (
        <th>
          <div className="cell">
            <div className="active-panel active-panel-with-popover">
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
