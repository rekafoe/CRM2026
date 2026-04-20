/**
 * Строка уровня 1 — подтип (дочерняя строка, без цен по диапазонам).
 */
import React, { memo, useCallback, useRef } from 'react';
import { VariantRowActions } from './VariantRowActions';
import { VariantRowLevel1Props } from './ServiceVariantsTable.types';

const VariantRowLevel1Inner: React.FC<VariantRowLevel1Props> = ({
  variant,
  typeName,
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
  const l2Ref = useRef(level2Variants);
  l2Ref.current = level2Variants;

  const hasChildren = level2Variants.length > 0;

  const handleParamsEditStart = useCallback(() => {
    onParamsEditStart(variant.id, variant.parameters?.type || '');
  }, [variant.id, variant.parameters?.type, onParamsEditStart]);

  const handleParamsSave = useCallback(() => {
    onParamsSave(variant.id);
  }, [variant.id, onParamsSave]);

  const handleCreateChild = useCallback(() => {
    onCreateChild(typeName, variant.id);
  }, [typeName, variant.id, onCreateChild]);

  const handleCreateSibling = useCallback(() => {
    onCreateSibling(typeName);
  }, [typeName, onCreateSibling]);

  const handleDelete = useCallback(() => {
    onDelete(variant.id, (l2Ref.current ?? []).map((v) => v.id));
  }, [variant.id, onDelete]);

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
          <div
            style={{
              width: hasChildren ? 'calc(100% - 44px)' : 'calc(100% - 20px)',
              marginLeft: hasChildren ? '5px' : '8px',
              display: 'inline-block',
            }}
          >
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
                  value={variant.parameters?.type || 'Вариант'}
                  onClick={handleParamsEditStart}
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
      <VariantRowActions
        layout="branch"
        onAddChild={handleCreateChild}
        onAddSibling={handleCreateSibling}
        onDelete={handleDelete}
      />
    </tr>
  );
};

export const VariantRowLevel1 = memo(VariantRowLevel1Inner);
VariantRowLevel1.displayName = 'VariantRowLevel1';
