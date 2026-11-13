/**
 * Строка уровня 1 — тип/вариант.
 * Без дочерних подтипов — лист: можно вводить цены (Матовое / Глянцевое и т.п.).
 */
import React, { memo, useCallback, useRef } from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowActions } from './VariantRowActions';
import { VariantMaterialSelect } from './VariantMaterialSelect';
import { VariantBindingPagesLimits } from './VariantBindingPagesLimits';
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
  onPriceChange,
  materials = [],
  priceUnit,
  onUpdateMaterial,
  isBindService,
  onUpdateBindingPages,
}) => {
  const l2Ref = useRef(level2Variants);
  l2Ref.current = level2Variants;

  const hasChildren = level2Variants.length > 0;
  const isLeaf = !hasChildren;
  const rawType = variant.parameters?.type || '';
  const shownType = isBindService && (rawType === 'Новый тип' || rawType === 'Вариант' || !rawType.trim())
    ? ''
    : (rawType || (isBindService ? '' : 'Вариант'));

  const handleParamsEditStart = useCallback(() => {
    onParamsEditStart(variant.id, isBindService ? shownType : (variant.parameters?.type || ''));
  }, [isBindService, onParamsEditStart, shownType, variant.id, variant.parameters?.type]);

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

  const handlePriceChange = useCallback(
    (minQty: number, newPrice: number) => {
      onPriceChange?.(variant.id, minQty, newPrice);
    },
    [variant.id, onPriceChange]
  );

  return (
    <tr className="el-table__row el-table__row--level-1">
      <td className="variant-name-cell" style={{ padding: 0 }}>
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
                    placeholder={isBindService ? 'Тип, например: металл' : 'Тип (например: глянец, мат)'}
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
                  placeholder={isBindService ? 'Тип, например: металл' : undefined}
                  value={isBindService ? shownType : (variant.parameters?.type || 'Вариант')}
                  onClick={handleParamsEditStart}
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
              )}
            </div>
            {isBindService && <span className="variant-kind">{isLeaf ? 'лист' : 'группа'}</span>}
            {isBindService && variant.isActive === false && <span className="variant-kind variant-kind--off">выключен</span>}
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
        layout="branch"
        bindingLabels={Boolean(isBindService)}
        onAddChild={handleCreateChild}
        onAddSibling={handleCreateSibling}
        onDelete={handleDelete}
      />
      {isBindService && !isLeaf ? (
        commonRangesAsPriceRanges.map((range) => (
          <td key={range.minQty} style={{ padding: '8px', textAlign: 'center' }}>
            <span className="variant-price-on-leaf">на листе</span>
          </td>
        ))
      ) : isLeaf ? (
        <PriceRangeCells
          tiers={variant.tiers}
          commonRanges={commonRangesAsPriceRanges}
          onPriceChange={handlePriceChange}
          editable={Boolean(onPriceChange)}
        />
      ) : (
        commonRangesAsPriceRanges.map((range) => (
          <td key={range.minQty} style={{ padding: '8px', textAlign: 'center' }}>
            <span style={{ color: '#999', fontSize: '12px' }}>—</span>
          </td>
        ))
      )}
    </tr>
  );
};

export const VariantRowLevel1 = memo(VariantRowLevel1Inner);
VariantRowLevel1.displayName = 'VariantRowLevel1';
