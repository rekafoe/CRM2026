/**
 * Строка уровня 1 — подтип (дочерняя строка, без цен по диапазонам).
 */
import React from 'react';
import { VariantRowLevel1Props } from './ServiceVariantsTable.types';

export const VariantRowLevel1: React.FC<VariantRowLevel1Props> = ({
  variant,
  level2Variants,
  commonRangesAsPriceRanges,
  isEditingParams,
  editingParamsValue,
  onParamsChange,
  onParamsEditStart,
  onParamsEditCancel,
  onParamsSave,
  onCreateChild,
  onCreateSibling,
  onDelete,
}) => {
  const hasChildren = level2Variants.length > 0;
  return (
    <tr className="el-table__row el-table__row--level-1">
      <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
        <div className="cell">
          <span className="el-table__indent" style={{ paddingLeft: '16px' }}></span>
          {hasChildren && (
            <div className="el-table__expand-icon el-table__expand-icon--expanded">
              <i className="el-icon-arrow-right"></i>
            </div>
          )}
          {!hasChildren && <span className="el-table__placeholder"></span>}
          <div style={{ width: hasChildren ? 'calc(100% - 44px)' : 'calc(100% - 20px)', marginLeft: hasChildren ? '5px' : '8px', display: 'inline-block' }}>
            <div className="el-input el-input--small">
              {isEditingParams ? (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="el-input__inner"
                    placeholder="Тип (например: глянец, мат)"
                    value={editingParamsValue.type || ''}
                    onChange={(e) => onParamsChange('type', e.target.value)}
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
                  value={variant.parameters?.type || 'Вариант'}
                  onClick={onParamsEditStart}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
              )}
            </div>
          </div>
        </div>
      </td>
      {commonRangesAsPriceRanges.map((range) => (
        <td key={range.minQty} style={{ padding: '8px', textAlign: 'center' }}>
          <span style={{ color: '#999', fontSize: '12px' }}>—</span>
        </td>
      ))}
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
              className="el-button el-button--success el-button--small is-plain"
              onClick={onCreateChild}
              title="Добавить дочернюю строку (уровень 2)"
            >
              <span style={{ fontSize: '14px' }}>↘</span>
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
};
