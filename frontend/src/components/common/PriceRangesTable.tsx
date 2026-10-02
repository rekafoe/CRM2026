import React, { useState, useCallback, useMemo } from 'react';
import { Button, FormField } from './index';
import { PriceRange, PriceRangeUtils, usePriceRanges } from '../../hooks/usePriceRanges';
import './PriceRangesTable.css';

export interface PriceRangesTableProps {
  /**
   * Массив наборов диапазонов (например, для разных вариантов услуги)
   * Каждый набор - это массив диапазонов с ценами
   */
  rangeSets: PriceRange[][];
  
  /**
   * Названия для каждого набора диапазонов (для заголовков колонок)
   */
  rangeSetLabels?: string[];
  
  /**
   * Callback при изменении цены в ячейке
   */
  onPriceChange?: (rangeSetIndex: number, minQty: number, newPrice: number) => void;
  
  /**
   * Callback при добавлении новой границы диапазона
   */
  onAddBoundary?: (boundary: number) => void;
  
  /**
   * Callback при редактировании границы диапазона
   */
  onEditBoundary?: (rangeIndex: number, newBoundary: number) => void;
  
  /**
   * Callback при удалении диапазона
   */
  onRemoveRange?: (rangeIndex: number) => void;
  
  /**
   * Флаг, разрешающий редактирование диапазонов
   */
  editable?: boolean;
  
  /**
   * Единица измерения для отображения
   */
  unit?: string;
}

/**
 * Компонент таблицы диапазонов цен
 * Отображает диапазоны количеств и цены для каждого набора диапазонов
 */
export const PriceRangesTable: React.FC<PriceRangesTableProps> = ({
  rangeSets,
  rangeSetLabels = [],
  onPriceChange,
  onAddBoundary,
  onEditBoundary,
  onRemoveRange,
  editable = true,
  unit = 'шт.',
}) => {
  const [boundaryModal, setBoundaryModal] = useState<{
    isOpen: boolean;
    type: 'add' | 'edit';
    rangeIndex?: number;
    boundary: string;
  }>({
    isOpen: false,
    type: 'add',
    boundary: '',
  });

  // Вычисляем общие диапазоны для всех наборов
  const commonRanges = useMemo(() => {
    return PriceRangeUtils.findCommonRanges(rangeSets);
  }, [rangeSets]);

  // Получаем цену для конкретного набора диапазонов и minQty
  const getPrice = useCallback((rangeSet: PriceRange[], minQty: number): number => {
    const range = rangeSet.find(r => r.minQty === minQty);
    return range?.price ?? 0;
  }, []);

  const handleAddBoundary = useCallback(() => {
    const boundary = Number(boundaryModal.boundary);
    if (boundary > 0 && onAddBoundary) {
      onAddBoundary(boundary);
      setBoundaryModal({ isOpen: false, type: 'add', boundary: '' });
    }
  }, [boundaryModal.boundary, onAddBoundary]);

  const handleEditBoundary = useCallback(() => {
    if (boundaryModal.rangeIndex === undefined) return;
    const boundary = Number(boundaryModal.boundary);
    if (boundary > 0 && onEditBoundary) {
      onEditBoundary(boundaryModal.rangeIndex, boundary);
      setBoundaryModal({ isOpen: false, type: 'add', boundary: '' });
    }
  }, [boundaryModal, onEditBoundary]);

  const handleRemoveRange = useCallback((rangeIndex: number) => {
    if (confirm('Удалить этот диапазон для всех вариантов?') && onRemoveRange) {
      onRemoveRange(rangeIndex);
    }
  }, [onRemoveRange]);

  const formatRangeLabel = useCallback((range: PriceRange): string => {
    if (range.maxQty === undefined) {
      return `${range.minQty}+`;
    }
    if (range.minQty === range.maxQty) {
      return String(range.minQty);
    }
    return `${range.minQty}-${range.maxQty}`;
  }, []);

  return (
    <div className="price-ranges-table">
      <div className="price-ranges-table-header">
        <div className="price-ranges-table-actions">
          {editable && (
            <>
              <Button
                onClick={() => setBoundaryModal({ 
                  isOpen: true, 
                  type: 'add', 
                  boundary: '' 
                })}
                variant="secondary"
                size="sm"
              >
                + Добавить диапазон
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="price-ranges-table-container">
        <table className="price-ranges-table-content">
          <thead>
            <tr>
              <th>Диапазон ({unit})</th>
              {rangeSetLabels.map((label, idx) => (
                <th key={idx}>{label}</th>
              ))}
              {!rangeSetLabels.length && rangeSets.map((_, idx) => (
                <th key={idx}>Вариант {idx + 1}</th>
              ))}
              {editable && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {commonRanges.map((range: PriceRange, rangeIdx: number) => (
              <tr key={rangeIdx}>
                <td className="range-label">
                  {formatRangeLabel(range)}
                </td>
                {rangeSets.map((rangeSet, setIdx) => (
                  <td key={setIdx} className="price-cell">
                    {editable ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={getPrice(rangeSet, range.minQty)}
                        onChange={(e) => {
                          const newPrice = Number(e.target.value);
                          if (onPriceChange) {
                            onPriceChange(setIdx, range.minQty, newPrice);
                          }
                        }}
                        className="price-input"
                      />
                    ) : (
                      <span>{getPrice(rangeSet, range.minQty).toFixed(2)}</span>
                    )}
                  </td>
                ))}
                {editable && (
                  <td className="actions-cell">
                    <Button
                      onClick={() => setBoundaryModal({
                        isOpen: true,
                        type: 'edit',
                        rangeIndex: rangeIdx,
                        boundary: String(range.minQty),
                      })}
                      variant="secondary"
                      size="sm"
                    >
                      Изменить
                    </Button>
                    {commonRanges.length > 1 && (
                      <Button
                        onClick={() => handleRemoveRange(rangeIdx)}
                        variant="secondary"
                        size="sm"
                      >
                        Удалить
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Модальное окно для добавления/редактирования границы */}
      {boundaryModal.isOpen && (
        <div className="modal-overlay" onClick={() =>setBoundaryModal({ isOpen: false, type: 'add', boundary: '' })}>
          <div className="modal-content" onClick={(e) =>e.stopPropagation()}>
            <h3>
              {boundaryModal.type === 'add' ? 'Добавить границу диапазона' : 'Редактировать границу диапазона'}
            </h3>
            <FormField label="Граница (от)">
              <input
                type="number"
                value={boundaryModal.boundary}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBoundaryModal({ ...boundaryModal, boundary: e.target.value })}
                min={1}
                className="px-2 py-1 border rounded w-full"
              />
            </FormField>
            <div className="modal-actions">
              <Button
                onClick={boundaryModal.type === 'add' ? handleAddBoundary : handleEditBoundary}
                variant="primary"
              >
                Сохранить
              </Button>
              <Button
                onClick={() => setBoundaryModal({ isOpen: false, type: 'add', boundary: '' })}
                variant="secondary"
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
