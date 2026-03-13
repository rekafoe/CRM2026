/**
 * Строка уровня 2 — подтип с ценами по диапазонам.
 */
import React from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowLevel2Props } from './ServiceVariantsTable.types';

export const VariantRowLevel2: React.FC<VariantRowLevel2Props> = ({
  variant,
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
}) => (
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
                <button
                  type="button"
                  className="el-button el-button--primary el-button--mini"
                  onClick={onParamsSave}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="el-button el-button--text el-button--mini"
                  onClick={onParamsEditCancel}
                >
                  ×
                </button>
              </div>
            ) : (
              <input
                type="text"
                className="el-input__inner"
                value={variant.parameters?.subType || 'Подвариант'}
                onClick={onParamsEditStart}
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
      onPriceChange={onPriceChange}
      editable={true}
      hoveredRangeIndex={hoveredRangeIndex}
      onRangeHover={onRangeHover}
    />
    <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
      <div className="cell">
        <div className="active-panel" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <button
            type="button"
            className="el-button el-button--success el-button--small"
            onClick={onCreateSibling}
            title="Добавить строку на том же уровне"
          >
            <span style={{ fontSize: '14px' }}>↓</span>
          </button>
          <button
            type="button"
            className="el-button el-button--danger el-button--small"
            onClick={onDelete}
            title="Удалить строку"
          >
            <span style={{ fontSize: '14px' }}>×</span>
          </button>
        </div>
      </div>
    </td>
  </tr>
);
