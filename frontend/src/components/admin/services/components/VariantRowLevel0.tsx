/**
 * Строка уровня 0 — тип (родительская строка дерева вариантов).
 * Если детей нет — это лист: можно вводить цены сразу.
 */
import React, { memo, useCallback, useRef } from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowActions } from './VariantRowActions';
import { VariantMaterialSelect } from './VariantMaterialSelect';
import { VariantBindingPagesLimits } from './VariantBindingPagesLimits';
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
  onPriceChange,
  materials = [],
  priceUnit,
  onUpdateMaterial,
  isBindService,
  onUpdateBindingPages,
}) => {
  const allRef = useRef(allTypeVariants);
  allRef.current = allTypeVariants;

  // Только сам корень — лист, цены вводим здесь; иначе цены у дочерних строк
  const isLeaf = (allTypeVariants?.length ?? 1) <= 1;
  const shownName = isBindService && (typeName === 'Новый тип' || !typeName.trim()) ? '' : typeName;

  const handleNameSave = useCallback(() => {
    onNameSave(variant.id);
  }, [variant.id, onNameSave]);

  const handleCreateChild = useCallback(() => {
    onCreateChild(typeName);
  }, [typeName, onCreateChild]);

  const handleDelete = useCallback(() => {
    onDelete(typeName, (allRef.current ?? []).map((v) => v.id));
  }, [typeName, onDelete]);

  const handlePriceChange = useCallback(
    (minQty: number, newPrice: number) => {
      onPriceChange?.(variant.id, minQty, newPrice);
    },
    [variant.id, onPriceChange]
  );

  return (
    <tr className="el-table__row expanded">
      <td className="variant-name-cell" style={{ padding: 0 }}>
        <div className="cell">
          <div className="variant-name-stack">
            <div className="variant-name-row">
              {isBindService && <span className="variant-kind">{isLeaf ? 'лист' : 'группа'}</span>}
              <div className="el-input el-input--small" style={{ flex: 1, marginRight: '8px', minWidth: 0 }}>
                {isEditingName ? (
                  <input
                    type="text"
                    className="el-input__inner"
                    placeholder={isBindService ? 'Вид, например: пружина' : undefined}
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
                    placeholder={isBindService ? 'Вид, например: пружина' : undefined}
                    value={shownName}
                    onClick={() => onNameEditStart(variant.id, shownName)}
                    readOnly
                    style={{ cursor: 'pointer' }}
                  />
                )}
              </div>
              {isBindService && variant.isActive === false && <span className="variant-kind variant-kind--off">выключен</span>}
            </div>
            {isBindService && !isLeaf && <p className="variant-group-note">Материал и страницы — на листе.</p>}
            {isLeaf && onUpdateMaterial && (materials.length > 0 || isBindService) && (
              <VariantMaterialSelect
                variant={variant}
                materials={materials}
                priceUnit={priceUnit}
                onUpdate={onUpdateMaterial}
                bindingLeaf={Boolean(isBindService)}
              />
            )}
            {isLeaf && isBindService && onUpdateBindingPages && (
              <VariantBindingPagesLimits variant={variant} onUpdate={onUpdateBindingPages} />
            )}
          </div>
        </div>
      </td>
      <VariantRowActions
        layout="root"
        bindingLabels={Boolean(isBindService)}
        onAddChild={handleCreateChild}
        onAddSibling={onCreateSibling}
        onDelete={handleDelete}
      />
      {isBindService && !isLeaf ? (
        commonRangesAsPriceRanges.map((range) => (
          <td key={range.minQty} style={{ padding: '8px', textAlign: 'center' }}>
            <span className="variant-price-on-leaf">на листе</span>
          </td>
        ))
      ) : (
      <PriceRangeCells
        tiers={isLeaf ? variant.tiers : []}
        commonRanges={commonRangesAsPriceRanges}
        onPriceChange={isLeaf && onPriceChange ? handlePriceChange : NOOP_PRICE}
        editable={isLeaf && Boolean(onPriceChange)}
      />
      )}
    </tr>
  );
};

export const VariantRowLevel0 = memo(VariantRowLevel0Inner);
VariantRowLevel0.displayName = 'VariantRowLevel0';
