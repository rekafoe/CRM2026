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
  materials?: Array<{ id: number; name: string; sheet_width?: number | null }>;
  priceUnit?: string;
  onUpdateMaterial?: (
    variantId: number,
    patch: {
      material_id: number | null;
      qty_per_item: number;
      consumption_mode?: 'fixed' | 'roll_feed';
      meter_basis?: 'knife_path' | 'feed';
    }
  ) => void;
  isBindService?: boolean;
  onUpdateBindingPages?: (
    variantId: number,
    params: Record<string, unknown>,
  ) => void | Promise<void>;
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
  materials = [],
  priceUnit,
  onUpdateMaterial,
  isBindService,
  onUpdateBindingPages,
}) => {
  const actions = useVariantGridStableActions(localChanges, editing, setError, getNextTypeName);
  const noPriceColumns = commonRangesAsPriceRanges.length === 0;

  return (
    <div className="table-container service-variants-scroll">
      {noPriceColumns && (
        <div className="service-variants-ranges-hint">
          Столбцы с ценами появятся после добавления диапазона тиража. Нажмите <strong>«Диапазон»</strong> над
          таблицей (например, граница <strong>1</strong>). Кнопки ↘ / ↓ / × закреплены слева и не уезжают за
          диапазоны. Цены и материал — в конечных строках.
        </div>
      )}
      <div className="el-table el-table--fit el-table--border el-table--enable-row-hover el-table--enable-row-transition el-table--small service-variants-grid">
        <table cellSpacing="0" cellPadding="0" border={0} className="el-table__header service-variants-unified-table">
          <colgroup>
            <col className="variant-name-col" />
            <col className="actions-col" />
            {commonRangesAsPriceRanges.map((range) => (
              <col key={`range-${range.minQty}`} className="range-col" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="variant-name-cell" style={{ padding: 0 }}>
                <div className="cell">
                  <div className="variant-name-header">
                    <div className="variant-name-header__title" title={serviceName}>
                      {serviceName}
                    </div>
                  </div>
                </div>
              </th>
              <th className="variant-actions-th">
                <div className="cell">
                  <div className="active-panel variant-actions-header">
                    <span className="variant-actions-label">Действия</span>
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
            </tr>
          </thead>
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
                      onPriceChange={actions.level2PriceChange}
                      materials={materials}
                      priceUnit={priceUnit}
                      onUpdateMaterial={onUpdateMaterial}
                      isBindService={isBindService}
                      onUpdateBindingPages={onUpdateBindingPages}
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
                              onPriceChange={actions.level2PriceChange}
                              materials={materials}
                              priceUnit={priceUnit}
                              onUpdateMaterial={onUpdateMaterial}
                              isBindService={isBindService}
                              onUpdateBindingPages={onUpdateBindingPages}
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
                                materials={materials}
                                priceUnit={priceUnit}
                                onUpdateMaterial={onUpdateMaterial}
                                isBindService={isBindService}
                                onUpdateBindingPages={onUpdateBindingPages}
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
  );
};
