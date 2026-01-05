/**
 * Компонент для управления несколькими размерами изделия
 */

import React from 'react';
import { Button, FormField } from '../../../common';

export interface TrimSize {
  id: string;
  width: string;
  height: string;
  label?: string;
}

interface MultiSizeManagerProps {
  sizes: TrimSize[];
  onAdd: () => void;
  onUpdate: (id: string, size: Partial<TrimSize>) => void;
  onRemove: (id: string) => void;
  productType?: string;
}

export const MultiSizeManager: React.FC<MultiSizeManagerProps> = ({
  sizes,
  onAdd,
  onUpdate,
  onRemove,
  productType,
}) => {
  // Стандартные форматы для быстрого выбора
  const standardFormats: Record<string, { width: string; height: string; label: string }> = {
    A4: { width: '210', height: '297', label: 'A4 (210×297 мм)' },
    A5: { width: '148', height: '210', label: 'A5 (148×210 мм)' },
    A6: { width: '105', height: '148', label: 'A6 (105×148 мм)' },
    A3: { width: '297', height: '420', label: 'A3 (297×420 мм)' },
    DL: { width: '99', height: '210', label: 'DL (99×210 мм)' },
  };

  const applyStandardFormat = (sizeId: string, formatKey: string) => {
    const format = standardFormats[formatKey];
    if (format) {
      onUpdate(sizeId, {
        width: format.width,
        height: format.height,
        label: format.label,
      });
    }
  };

  return (
    <div className="multi-size-manager flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h5 className="text-base font-semibold text-primary">
          Размеры изделия {sizes.length > 1 ? `(${sizes.length})` : ''}
        </h5>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          + Добавить размер
        </Button>
      </div>

      {sizes.length === 0 && (
        <div className="text-secondary text-sm p-4 border border-dashed rounded">
          Размеры не заданы. Добавьте хотя бы один размер.
        </div>
      )}

      {sizes.map((size, index) => (
        <div key={size.id} className="size-item p-4 border rounded-lg bg-secondary/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-primary">
              Размер #{index + 1} {size.label && `(${size.label})`}
            </span>
            {sizes.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onRemove(size.id)}
              >
                ✕ Удалить
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <FormField label="Ширина (мм)" className="flex-1 min-w-[150px]">
              <input
                className="form-input"
                type="number"
                value={size.width}
                onChange={(e) => onUpdate(size.id, { width: e.target.value })}
                placeholder="210"
              />
            </FormField>
            <FormField label="Высота (мм)" className="flex-1 min-w-[150px]">
              <input
                className="form-input"
                type="number"
                value={size.height}
                onChange={(e) => onUpdate(size.id, { height: e.target.value })}
                placeholder="297"
              />
            </FormField>
            <FormField label="Название (опционально)" className="flex-1 min-w-[200px]">
              <input
                className="form-input"
                value={size.label || ''}
                onChange={(e) => onUpdate(size.id, { label: e.target.value })}
                placeholder="Например: A4"
              />
            </FormField>
          </div>

          {/* Быстрый выбор стандартных форматов */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-secondary self-center">Быстрый выбор:</span>
            {Object.entries(standardFormats).map(([key, format]) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyStandardFormat(size.id, key)}
                className="text-xs"
              >
                {key}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {productType === 'multi_page' && sizes.length > 0 && (
        <div className="text-xs text-secondary p-3 bg-info/10 rounded border border-info/20">
          💡 Для многостраничных изделий все размеры будут доступны при выборе параметра "format"
        </div>
      )}
    </div>
  );
};

