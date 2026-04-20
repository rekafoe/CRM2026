/**
 * Строка уровня 2 — подтип с ценами по диапазонам.
 */
import React, { memo, useCallback } from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowActions } from './VariantRowActions';
import { getParentVariantId } from '../../../../utils/serviceVariantParent';
import { VariantRowLevel2Props } from './ServiceVariantsTable.types';

const VariantRowLevel2Inner: React.FC<VariantRowLevel2Props> = ({
  variant,
  typeName,
  commonRangesAsPriceRanges,
  isEditingParams,
  editingParamsValue,
  onParamsChange,
  onParamsEditStart,
  onParamsEditCancel,
  onParamsSave,
  onPriceChange,
  onCreateSibling,
  onDelete,
  hoveredRangeIndex,
  onRangeHover,
}) => {
  const handleParamsEditStart = useCallback(() => {
    onParamsEditStart(variant.id, variant.parameters?.subType || '');
  }, [variant.id, variant.parameters?.subType, onParamsEditStart]);

  const handleParamsSave = useCallback(() => {
    onParamsSave(variant.id);
  }, [variant.id, onParamsSave]);

  const handlePriceChange = useCallback(
    (minQty: number, newPrice: number) => {
      onPriceChange(variant.id, minQty, newPrice);
    },
    [variant.id, onPriceChange]
  );

  const handleCreateSibling = useCallback(() => {
    onCreateSibling(typeName ?? '', getParentVariantId(variant) ?? undefined);
  }, [typeName, variant.id, variant.parentVariantId, variant.parameters?.parentVariantId, onCreateSibling]);

  const handleDelete = useCallback(() => {
    onDelete(variant.id);
  }, [variant.id, onDelete]);

  return (
    <tr className="el-table__row el-table__row--level-2">
      <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
        <div className="cell">
          <span className="el-table__indent" style={{ paddingLeft: '32px' }}></span>
          <span className="el-table__placeholder"></span>
          <div style={{ width: 'calc(100% - 60px)', marginLeft: '8px', display: 'inline-block' }}>
            <div className="el-input el-input--small">
              {isEditingParams ? (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="el-input__inner"
                    placeholder="Подтип"
                    value={editingParamsValue.subType || ''}
                    onChange={(e) => onParamsChange('subType', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="el-button el-button--primary el-button--mini" onClick={handleParamsSave}>
                    ✓
                  </button>
                  <button type="button" className="el-button el-button--text el-button--mini" onClick={onParamsEditCancel}>
                    ×
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  className="el-input__inner"
                  value={variant.parameters?.subType || 'Подвариант'}
                  onClick={handleParamsEditStart}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
              )}
            </div>
          </div>
        </div>
      </td>
      <PriceRangeCells
        tiers={variant.tiers}
        commonRanges={commonRangesAsPriceRanges}
        onPriceChange={handlePriceChange}
        editable={true}
        hoveredRangeIndex={hoveredRangeIndex}
        onRangeHover={onRangeHover}
      />
      <VariantRowActions layout="leaf" onAddSibling={handleCreateSibling} onDelete={handleDelete} />
    </tr>
  );
};

export const VariantRowLevel2 = memo(VariantRowLevel2Inner);
VariantRowLevel2.displayName = 'VariantRowLevel2';
