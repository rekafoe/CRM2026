import React from 'react';
import { PriceRange } from '../../../../hooks/usePriceRanges';
import { PriceRangeHeaders } from './PriceRangeCells';
import { variantParentMapKey } from './ServiceVariantsTable.utils';
import { VariantsByType, VariantWithTiers } from './ServiceVariantsTable.types';
import { VariantRowLevel0 } from './VariantRowLevel0';
import { VariantRowLevel1 } from './VariantRowLevel1';
import { VariantRowLevel2 } from './VariantRowLevel2';
import { useLocalRangeChanges } from './hooks/useLocalRangeChanges';
import { useVariantEditing } from './hooks/useVariantEditing';
import { useVariantGridStableActions } from './hooks/useVariantGridStableActions';

type LocalChangesApi = ReturnType<typeof useLocalRangeChanges>;
type VariantEditingApi = ReturnType<typeof useVariantEditing>;

export interface ServiceVariantsGridProps {
  serviceName: string;
  commonRangesAsPriceRanges: PriceRange[];
  groupedVariants: VariantsByType;
  typeNames: string[];
  getNextTypeName: () => string;
  setError: (msg: string | null) => void;
  localChanges: LocalChangesApi;
  editing: VariantEditingApi;
  onEditRange: (rangeIndex: number, minQty: number) => void;
  hoveredRangeIndex: number | null;
  onRangeHover: (index: number | null) => void;
}

export const ServiceVariantsGrid: React.FC<ServiceVariantsGridProps> = ({
  serviceName,
  commonRangesAsPriceRanges,
  groupedVariants,
  typeNames,
  getNextTypeName,
  setError,
  localChanges,
  editing,
  onEditRange,
  hoveredRangeIndex,
  onRangeHover,
}) => {
  const actions = useVariantGridStableActions(localChanges, editing, setError, getNextTypeName);
  const noPriceColumns = commonRangesAsPriceRanges.length === 0;

  return (
    <div className="table-container">
      {noPriceColumns && (
        <div className="service-variants-ranges-hint">
          Столбцы с ценами появятся после того, как у услуги появятся диапазоны тиража. Нажмите{' '}
          <strong>«Диапазон»</strong> справа от заголовка блока (или задайте диапазоны через кнопку «Диапазоны» в
          списке услуг). Цены вводятся в строках <strong>подтипа</strong> (самый нижний уровень в дереве), не в
          корне типа.
        </div>
      )}
      <div className="el-table el-table--fit el-table--border el-table--enable-row-hover el-table--enable-row-transition el-table--small service-variants-grid">
        <div className="el-table__header-wrapper">
          <table cellSpacing="0" cellPadding="0" border={0} className="el-table__header" style={{ width: '100%' }}>
            <colgroup>
              <col className="variant-name-col" />
              {commonRangesAsPriceRanges.map((range) => (
                <col key={`range-${range.minQty}`} className="range-col" />
              ))}
              <col className="actions-col" />
            </colgroup>
            <thead>
              <tr>
                <th
                  className="variant-name-cell"
                  style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}
                >
                  <div className="cell">
                    <div className="variant-name-header">
                      <div className="variant-name-header__title" title={serviceName}>
                        {serviceName}
                      </div>
                    </div>
                  </div>
                </th>
                <PriceRangeHeaders
                  commonRanges={commonRangesAsPriceRanges}
                  onEditRange={onEditRange}
                  onRemoveRange={actions.removeRange}
                  hoveredRangeIndex={hoveredRangeIndex}
                  onRangeHover={onRangeHover}
                />
                <th style={{ width: '132px', minWidth: '132px', maxWidth: '132px', padding: 0 }}>
                  <div className="cell">
                    <div className="active-panel variant-actions-header">
                      <span className="variant-actions-label">Действия</span>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
          </table>
        </div>
        <div className="el-table__body-wrapper is-scrolling-none">
          <table cellSpacing="0" cellPadding="0" border={0} className="el-table__body" style={{ width: '100%' }}>
            <colgroup>
              <col className="variant-name-col" />
              {commonRangesAsPriceRanges.map((range) => (
                <col key={`body-range-${range.minQty}`} className="range-col" />
              ))}
              <col className="actions-col" />
            </colgroup>
            <tbody>
              {typeNames.map((typeName) => {
                const typeGroup = groupedVariants[typeName];
                const firstVariant = typeGroup.level0[0];
                if (!firstVariant) return null;

                const allTypeVariants: VariantWithTiers[] = [
                  ...typeGroup.level0,
                  ...Array.from(typeGroup.level1.values()).flat(),
                  ...Array.from(typeGroup.level2.values()).flat(),
                ];

                return (
                  <React.Fragment key={typeName}>
                    <VariantRowLevel0
                      variant={firstVariant}
                      typeName={typeName}
                      allTypeVariants={allTypeVariants}
                      commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                      isEditingName={editing.editingVariantName === firstVariant.id}
                      editingNameValue={editing.editingVariantNameValue}
                      onNameChange={editing.setEditingVariantNameValue}
                      onNameEditStart={actions.level0NameEditStart}
                      onNameEditCancel={editing.cancelEditingName}
                      onNameSave={actions.level0NameSave}
                      onCreateChild={actions.level0CreateChild}
                      onCreateSibling={actions.level0CreateSibling}
                      onDelete={actions.level0Delete}
                    />

                    {Array.from(typeGroup.level1.entries()).map(([, level1Variants]) =>
                      level1Variants.map((variant) => {
                        const level2Variants = typeGroup.level2.get(variantParentMapKey(variant.id)) || [];
                        return (
                          <React.Fragment key={variant.id}>
                            <VariantRowLevel1
                              variant={variant}
                              typeName={typeName}
                              level2Variants={level2Variants}
                              commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                              isEditingParams={editing.editingVariantParams === variant.id}
                              editingParamsValue={editing.editingVariantParamsValue}
                              onParamsChange={actions.onParamsChange}
                              onParamsEditStart={actions.level1ParamsEditStart}
                              onParamsEditCancel={editing.cancelEditingParams}
                              onParamsSave={actions.level1ParamsSave}
                              onCreateChild={actions.level1CreateChild}
                              onCreateSibling={actions.level1CreateSibling}
                              onDelete={actions.level1Delete}
                            />

                            {level2Variants.map((level2Variant) => (
                              <VariantRowLevel2
                                key={level2Variant.id}
                                variant={level2Variant}
                                typeName={typeName}
                                commonRangesAsPriceRanges={commonRangesAsPriceRanges}
                                isEditingParams={editing.editingVariantParams === level2Variant.id}
                                editingParamsValue={editing.editingVariantParamsValue}
                                onParamsChange={actions.onParamsChange}
                                onParamsEditStart={actions.level2ParamsEditStart}
                                onParamsEditCancel={editing.cancelEditingParams}
                                onParamsSave={actions.level2ParamsSave}
                                onPriceChange={actions.level2PriceChange}
                                onCreateSibling={actions.level2CreateSibling}
                                onDelete={actions.level2Delete}
                                hoveredRangeIndex={hoveredRangeIndex}
                                onRangeHover={onRangeHover}
                              />
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
