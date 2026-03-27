import React, { useState } from 'react'
import { FormField, Alert, Button } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type { PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'

interface MaterialsCardProps {
  selected: SimplifiedSizeConfig
  loadingLists: boolean
  selectedPaperTypeId: string | null
  setSelectedPaperTypeId: (id: string | null) => void
  paperTypes: PaperTypeForCalculator[]
  materialsForSelectedPaperType: CalculatorMaterial[]
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
  selectedPaperTypeId,
  setSelectedPaperTypeId,
  paperTypes,
  materialsForSelectedPaperType,
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

  return (
  <div className="simplified-card">
    <div className="simplified-card__header">
      <div>
        {titleWithHint(
          'Материалы (разрешённые)',
          'Выберите тип бумаги, затем конкретные материалы. Цены подтягиваются со склада автоматически.',
        )}
      </div>
    </div>
    <div className="simplified-card__content">
      {hasCommonMaterialsFeature && setUseOwnMaterials && (
        <div className="mb-3" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '10px 12px', backgroundColor: '#fafafa' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useOwnMaterials}
              onChange={(e) => {
                hasUserInteractedWithMaterialsRef.current = true
                setUseOwnMaterials(e.target.checked)
              }}
              style={{ cursor: 'pointer' }}
            />
            <span className="text-sm">У этого размера свои материалы (иначе — общие для типа)</span>
          </label>
        </div>
      )}

      <div style={{ maxWidth: '200px', width: 'fit-content', alignSelf: 'flex-start', flexShrink: 0 }}>
        <FormField label="Тип бумаги">
          <select
            className="form-select form-select--compact"
            style={{ width: 'auto', maxWidth: '180px' }}
            value={selectedPaperTypeId || ''}
            onChange={(e) => setSelectedPaperTypeId(e.target.value || null)}
            disabled={loadingLists || paperTypes.length === 0}
          >
            {paperTypes.length === 0 ? (
              <option value="">Загрузка...</option>
            ) : (
              <>
                <option value="">-- Выберите тип бумаги --</option>
                {paperTypes.map(pt => (
                  <option key={pt.id} value={pt.id}>{pt.display_name || pt.name}</option>
                ))}
              </>
            )}
          </select>
        </FormField>
      </div>

      {selectedPaperTypeId && materialsForSelectedPaperType.length > 0 && (
        <>
          <div className="mt-3 mb-3" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '12px' }}>
            <div className="text-sm font-medium mb-2">
              {hasCommonMaterialsFeature && !useOwnMaterials ? (
                <span className="simplified-label-with-hint">
                  <span>Общие материалы типа (отметьте разрешённые):</span>
                  <span
                    className="simplified-label-hint"
                    title="Список ниже — общий для всех размеров этого типа. Добавляйте и снимайте галочки — изменения применятся ко всем размерам, у которых не включены «свои материалы»."
                  >
                    ?
                  </span>
                </span>
              ) : (
                'Выберите разрешенные материалы:'
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {materialsForSelectedPaperType.map(m => {
                const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                  ?.densities?.find(d => d.material_id === Number(m.id))
                const isAllowed = effectiveIds.includes(Number(m.id))

                return (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: isAllowed ? '#f0f9ff' : 'transparent',
                      border: isAllowed ? '1px solid #3b82f6' : '1px solid #e5e7eb'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      onChange={(e) => {
                        hasUserInteractedWithMaterialsRef.current = true
                        const checked = e.target.checked
                        if (checked) {
                          setEffectiveIds([...effectiveIds, Number(m.id)])
                        } else {
                          setEffectiveIds(effectiveIds.filter(id => id !== Number(m.id)))
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>
                      {m.name}{densityInfo ? ` (${densityInfo.value} г/м²)` : ''}
                      {densityInfo?.price != null && (
                        <span className="text-muted" style={{ marginLeft: 6 }}>
                          {densityInfo.price.toFixed(2)} ₽/лист
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {effectiveIds.length > 0 && (
            <div className="mt-3" style={{ fontSize: 13 }}>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {allMaterialsFromAllPaperTypes
                  .filter(m => effectiveIds.includes(Number(m.id)))
                  .map(m => {
                    const pt = paperTypes.find(p => p.densities?.some(d => d.material_id === Number(m.id)))
                    const density = pt?.densities?.find(d => d.material_id === Number(m.id))
                    return (
                      <li key={m.id} style={{ marginBottom: 4 }}>
                        {m.name}
                        {density ? ` (${density.value} г/м²)` : ''}
                        {pt && ` [${pt.display_name || pt.name}]`}
                        {density?.price != null && (
                          <span className="text-muted" style={{ marginLeft: 6 }}>
                            — {density.price.toFixed(2)} ₽/лист
                          </span>
                        )}
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}

          {effectiveIds.length === 0 && (
            <Alert type="info" className="mt-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>Материалы ещё не выбраны для этого размера.</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const first = materialsForSelectedPaperType[0]
                    if (!first) return
                    hasUserInteractedWithMaterialsRef.current = true
                    if (!effectiveIds.includes(Number(first.id))) {
                      setEffectiveIds([...effectiveIds, Number(first.id)])
                    }
                  }}
                >
                  Выбрать материал
                </Button>
              </div>
            </Alert>
          )}
        </>
      )}

      {selectedPaperTypeId && materialsForSelectedPaperType.length === 0 && !loadingLists && (
        <Alert type="info" className="mt-3">Нет материалов для выбранного типа бумаги.</Alert>
      )}

      {/* Материалы-основы (заготовки): футболки, кружки — 1 шт на изделие */}
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
    <div className={`simplified-subsection simplified-subsection--collapsible mt-4 pt-4 ${!expanded ? 'simplified-subsection--collapsed' : ''}`} style={{ borderTop: '1px solid #e5e7eb' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: 8 }}>
            {baseMaterialsList.map(m => {
              const isAllowed = allowedBaseIds.includes(Number(m.id))
              return (
                <label
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: isAllowed ? '#f0fdf4' : 'transparent',
                    border: isAllowed ? '1px solid #22c55e' : '1px solid #e5e7eb'
                  }}
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
                    style={{ cursor: 'pointer' }}
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
