import React from 'react'
import { FormField, Alert } from '../../../components/common'
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
}) => {
  const allowedBaseIds = selected.allowed_base_material_ids ?? []
  const baseMaterialsList = allMaterials.length > 0 ? allMaterials : allMaterialsFromAllPaperTypes
  return (
  <div className="simplified-card">
    <div className="simplified-card__header">
      <div>
        <strong>Материалы (разрешённые)</strong>
        <div className="text-muted text-sm">Выберите тип бумаги, затем конкретные материалы. Цены подтягиваются со склада автоматически.</div>
      </div>
    </div>
    <div className="simplified-card__content">
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
            <div className="text-sm font-medium mb-2">Выберите разрешенные материалы:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {materialsForSelectedPaperType.map(m => {
                const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                  ?.densities?.find(d => d.material_id === Number(m.id))
                const isAllowed = selected.allowed_material_ids.includes(Number(m.id))

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
                          updateSize(selected.id, {
                            allowed_material_ids: [...selected.allowed_material_ids, Number(m.id)]
                          })
                        } else {
                          updateSize(selected.id, {
                            allowed_material_ids: selected.allowed_material_ids.filter(id => id !== Number(m.id))
                          })
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

          {selected.allowed_material_ids.length > 0 && (
            <div className="mt-3" style={{ fontSize: 13 }}>
              <div className="text-muted text-sm mb-2">Цены подтягиваются со склада при расчёте заказа</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {allMaterialsFromAllPaperTypes
                  .filter(m => selected.allowed_material_ids.includes(Number(m.id)))
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
        </>
      )}

      {selectedPaperTypeId && materialsForSelectedPaperType.length === 0 && !loadingLists && (
        <Alert type="info" className="mt-3">Нет материалов для выбранного типа бумаги.</Alert>
      )}

      {/* Материалы-основы (заготовки): футболки, кружки — 1 шт на изделие */}
      <div className="mt-4 pt-4" style={{ borderTop: '1px solid #e5e7eb' }}>
        <div className="text-sm font-medium mb-2">Материалы-основы (заготовки)</div>
        <div className="text-muted text-sm mb-2">Для сувенирки, сублимации: футболки, кружки и т.п. Расход: 1 шт на изделие.</div>
        {baseMaterialsList.length === 0 ? (
          <div className="text-muted text-sm">Нет материалов на складе.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
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
  </div>
  )
}
