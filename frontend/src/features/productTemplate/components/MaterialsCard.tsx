import React, { useState } from 'react'
import { Alert } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type { PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import { PaperTypeDensitiesAllowedEditor } from '../../../components/multipage/PaperTypeDensitiesAllowedEditor'

interface MaterialsCardProps {
  selected: SimplifiedSizeConfig
  loadingLists: boolean
  paperTypes: PaperTypeForCalculator[]
  allMaterialsFromAllPaperTypes: CalculatorMaterial[]
  /** Все материалы (для выбора материалов-основ: заготовки, футболки, кружки) */
  allMaterials?: CalculatorMaterial[]
  hasUserInteractedWithMaterialsRef: React.MutableRefObject<boolean>
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
  /** Есть типы продуктов: показываем общие материалы типа и флаг «свои материалы» у размера */
  hasCommonMaterialsFeature?: boolean
  useOwnMaterials?: boolean
  effectiveAllowedMaterialIds?: number[]
  updateEffectiveMaterials?: (ids: number[]) => void
  setUseOwnMaterials?: (v: boolean) => void
}

export const MaterialsCard: React.FC<MaterialsCardProps> = ({
  selected,
  loadingLists,
  paperTypes,
  allMaterialsFromAllPaperTypes,
  allMaterials = [],
  hasUserInteractedWithMaterialsRef,
  updateSize,
  hasCommonMaterialsFeature = false,
  useOwnMaterials = true,
  effectiveAllowedMaterialIds,
  updateEffectiveMaterials,
  setUseOwnMaterials,
}) => {
  const titleWithHint = (label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <strong>{label}</strong>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  )

  const allowedBaseIds = selected.allowed_base_material_ids ?? []
  const baseMaterialsList = allMaterials.length > 0 ? allMaterials : allMaterialsFromAllPaperTypes
  const effectiveIds = effectiveAllowedMaterialIds ?? selected.allowed_material_ids ?? []
  const setEffectiveIds = updateEffectiveMaterials ?? ((ids: number[]) => updateSize(selected.id, { allowed_material_ids: ids }))

  const onAllowedChange = (ids: number[]) => {
    hasUserInteractedWithMaterialsRef.current = true
    setEffectiveIds(ids)
  }

  return (
  <div className="simplified-card">
    <div className="simplified-card__header">
      <div>
        {titleWithHint(
          'Материалы (разрешённые)',
          'Отметьте типы бумаги и плотности. В калькуляторе клиент выберет тип и плотность из этого списка. Цены — со склада.',
        )}
      </div>
    </div>
    <div className="simplified-card__content">
      {hasCommonMaterialsFeature && setUseOwnMaterials && (
        <div className="materials-card__own-toggle">
          <label className="materials-card__own-toggle-label">
            <input
              type="checkbox"
              checked={useOwnMaterials}
              onChange={(e) => {
                hasUserInteractedWithMaterialsRef.current = true
                setUseOwnMaterials(e.target.checked)
              }}
            />
            <span className="text-sm">У этого размера свои материалы (иначе — общие для типа)</span>
          </label>
        </div>
      )}

      <PaperTypeDensitiesAllowedEditor
        allowedIds={effectiveIds}
        onAllowedChange={onAllowedChange}
        paperTypes={paperTypes}
        loading={loadingLists}
        title={
          hasCommonMaterialsFeature && !useOwnMaterials
            ? 'Общие типы и плотности для типа продукта'
            : 'Типы бумаги и плотности'
        }
      />

      {effectiveIds.length === 0 && !loadingLists && (
        <Alert type="info" className="mt-3">
          Отметьте хотя бы одну плотность — иначе в калькуляторе не будет бумаги.
        </Alert>
      )}

      <BaseMaterialsCollapsible
        baseMaterialsList={baseMaterialsList}
        allowedBaseIds={allowedBaseIds}
        selected={selected}
        updateSize={updateSize}
      />
    </div>
  </div>
  )
}

const BaseMaterialsCollapsible: React.FC<{
  baseMaterialsList: CalculatorMaterial[]
  allowedBaseIds: number[]
  selected: SimplifiedSizeConfig
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
}> = ({ baseMaterialsList, allowedBaseIds, selected, updateSize }) => {
  const titleWithHint = (label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <span>{label}</span>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  )

  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`simplified-subsection simplified-subsection--collapsible mt-4 pt-4 materials-card__base ${!expanded ? 'simplified-subsection--collapsed' : ''}`}>
      <div className="simplified-subsection__header" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}>
        <div>
          <div className="text-sm font-medium">
            {titleWithHint(
              'Материалы-основы (заготовки)',
              'Для сувенирки, сублимации: футболки, кружки и т.п. Расход: 1 шт на изделие.',
            )}
          </div>
        </div>
        <span className="simplified-subsection__header-toggle">{expanded ? 'Свернуть' : 'Развернуть'}</span>
      </div>
      <div className="simplified-subsection__content">
        {baseMaterialsList.length === 0 ? (
          <div className="text-muted text-sm">Нет материалов на складе.</div>
        ) : (
          <div className="materials-card__base-list">
            {baseMaterialsList.map(m => {
              const isAllowed = allowedBaseIds.includes(Number(m.id))
              return (
                <label
                  key={m.id}
                  className={`materials-card__base-item${isAllowed ? ' materials-card__base-item--checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isAllowed}
                    onChange={(e) => {
                      const checked = e.target.checked
                      updateSize(selected.id, {
                        allowed_base_material_ids: checked
                          ? [...allowedBaseIds, Number(m.id)]
                          : allowedBaseIds.filter(id => id !== Number(m.id))
                      })
                    }}
                  />
                  <span>{m.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
