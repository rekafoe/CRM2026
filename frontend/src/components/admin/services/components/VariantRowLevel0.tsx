/**
 * Строка уровня 0 — тип (родительская строка дерева вариантов).
 */
import React, { memo, useCallback, useRef } from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowActions } from './VariantRowActions';
import { VariantRowLevel0Props } from './ServiceVariantsTable.types';

const NOOP_PRICE = (_minQty: number, _newPrice: number) => {};

const VariantRowLevel0Inner: React.FC<VariantRowLevel0Props> = ({
  variant,
  typeName,
  allTypeVariants,
  commonRangesAsPriceRanges,
  isEditingName,
  editingNameValue,
  onNameChange,
  onNameEditStart,
  onNameEditCancel,
  onNameSave,
  onCreateChild,
  onCreateSibling,
  onDelete,
}) => {
  const allRef = useRef(allTypeVariants);
  allRef.current = allTypeVariants;

  const handleNameEditStart = useCallback(() => {
    onNameEditStart(variant.id, typeName);
  }, [variant.id, typeName, onNameEditStart]);

  const handleNameSave = useCallback(() => {
    onNameSave(variant.id);
  }, [variant.id, onNameSave]);

  const handleCreateChild = useCallback(() => {
    onCreateChild(typeName);
  }, [typeName, onCreateChild]);

  const handleDelete = useCallback(() => {
    onDelete(typeName, (allRef.current ?? []).map((v) => v.id));
  }, [typeName, onDelete]);

  return (
    <tr className="el-table__row expanded">
      <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
        <div className="cell">
          <div className="variant-name-row">
            <div className="el-input el-input--small" style={{ flex: 1, marginRight: '8px', minWidth: 0 }}>
              {isEditingName ? (
                <input
                  type="text"
                  className="el-input__inner"
                  value={editingNameValue}
                  onChange={(e) => onNameChange(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleNameSave();
                    } else if (e.key === 'Escape') {
                      onNameEditCancel();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  className="el-input__inner"
                  value={typeName}
                  onClick={handleNameEditStart}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
              )}
            </div>
          </div>
        </div>
      </td>
      <PriceRangeCells
        tiers={[]}
        commonRanges={commonRangesAsPriceRanges}
        onPriceChange={NOOP_PRICE}
        editable={false}
      />
      <VariantRowActions
        layout="root"
        onAddChild={handleCreateChild}
        onAddSibling={onCreateSibling}
        onDelete={handleDelete}
      />
    </tr>
  );
};

export const VariantRowLevel0 = memo(VariantRowLevel0Inner);
VariantRowLevel0.displayName = 'VariantRowLevel0';
