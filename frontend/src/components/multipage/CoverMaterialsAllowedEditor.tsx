import React, { useMemo, useState } from 'react'
import { FormField, Alert } from '../common'
import { MoneyAmount } from '../ui'
import type { CoverMaterialOption } from '../../services/calculatorMaterialService'
import { resolveCoverMaterialsForAllowed } from '../../utils/multipageCoverMaterials'

function materialLabel(m: CoverMaterialOption): string {
  const density = (m as { density?: number | string }).density
  const extra = density != null && density !== '' ? ` · ${density} г/м²` : ''
  const cat = m.category_name ? `${m.category_name} · ` : ''
  return `${cat}${m.name}${extra}`
}

type Props = {
  allowedIds: number[]
  onAllowedChange: (ids: number[]) => void
  allMaterials: CoverMaterialOption[]
  paperTypes: Array<{
    id: number | string
    name: string
    display_name?: string
    densities?: Array<{ material_id?: number; value?: number; price?: number }>
  }>
  /** Материал по умолчанию в калькуляторе (из шаблона) */
  defaultMaterialId?: number
  onDefaultMaterialChange?: (id: number | undefined) => void
  /** false — только выбор одного материала (калькулятор) */
  allowEditAllowedList?: boolean
}

export const CoverMaterialsAllowedEditor: React.FC<Props> = ({
  allowedIds,
  onAllowedChange,
  allMaterials,
  paperTypes,
  defaultMaterialId,
  onDefaultMaterialChange,
  allowEditAllowedList = true,
}) => {
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string | null>(null)

  const materialsForPaperType = useMemo(() => {
    if (!selectedPaperTypeId) return []
    const pt = paperTypes.find((p) => String(p.id) === String(selectedPaperTypeId))
    const ids = new Set(
      (pt?.densities ?? [])
        .map((d) => Number(d.material_id))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
    return allMaterials.filter((m) => ids.has(Number(m.id)))
  }, [allMaterials, paperTypes, selectedPaperTypeId])

  const allowedMaterials = useMemo(
    () => resolveCoverMaterialsForAllowed(allowedIds, allMaterials, paperTypes),
    [allowedIds, allMaterials, paperTypes],
  )

  const selectValue =
    defaultMaterialId != null && Number.isFinite(Number(defaultMaterialId))
      ? String(defaultMaterialId)
      : ''

  const toggleAllowed = (materialId: number, checked: boolean) => {
    const id = Number(materialId)
    if (checked) {
      if (!allowedIds.includes(id)) onAllowedChange([...allowedIds, id])
    } else {
      const next = allowedIds.filter((x) => x !== id)
      onAllowedChange(next)
      if (defaultMaterialId === id) {
        onDefaultMaterialChange?.(next[0])
      }
    }
  }

  if (!allowEditAllowedList) {
    if (allowedIds.length === 0) {
      return (
        <Alert type="info">
          В шаблоне не заданы разрешённые материалы обложки. Откройте вкладку «Сборка» в шаблоне продукта.
        </Alert>
      )
    }
    return (
      <FormField label="Бумага обложки" help="Выбор из списка, заданного в шаблоне продукта.">
        <select
          className="form-select"
          value={selectValue}
          onChange={(e) => {
            const raw = e.target.value
            if (!raw) {
              onDefaultMaterialChange?.(undefined)
              return
            }
            const id = Number(raw)
            if (Number.isFinite(id) && id > 0) onDefaultMaterialChange?.(id)
          }}
        >
          <option value="">— Выберите бумагу обложки —</option>
          {allowedMaterials.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {materialLabel(m)}
            </option>
          ))}
        </select>
      </FormField>
    )
  }

  return (
    <div className="cover-materials-allowed-editor">
      <div style={{ maxWidth: 220, marginBottom: 12 }}>
        <FormField label="Тип бумаги (фильтр)">
          <select
            className="form-select form-select--compact"
            value={selectedPaperTypeId || ''}
            onChange={(e) => setSelectedPaperTypeId(e.target.value || null)}
          >
            <option value="">— Все типы —</option>
            {paperTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.display_name || pt.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {selectedPaperTypeId && materialsForPaperType.length > 0 && (
        <div className="mb-3" style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 12 }}>
          <div className="text-sm font-medium mb-2">Разрешённые материалы обложки:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {materialsForPaperType.map((m) => {
              const isAllowed = allowedIds.includes(Number(m.id))
              const densityInfo = paperTypes
                .find((pt) => String(pt.id) === String(selectedPaperTypeId))
                ?.densities?.find((d) => Number(d.material_id) === Number(m.id))
              return (
                <label
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 4,
                    backgroundColor: isAllowed ? '#f0f9ff' : 'transparent',
                    border: isAllowed ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAllowed}
                    onChange={(e) => toggleAllowed(Number(m.id), e.target.checked)}
                  />
                  <span>
                    {m.name}
                    {densityInfo ? ` (${densityInfo.value} г/м²)` : ''}
                    {densityInfo?.price != null && (
                      <span className="text-muted" style={{ marginLeft: 6 }}>
                        <MoneyAmount value={densityInfo.price} />/лист
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {allowedIds.length > 0 && onDefaultMaterialChange && (
        <FormField
          label="Материал по умолчанию в калькуляторе"
          help="Подставится при открытии калькулятора, если клиент ещё не выбрал обложку."
        >
          <select
            className="form-select"
            value={defaultMaterialId ?? ''}
            onChange={(e) =>
              onDefaultMaterialChange(
                e.target.value ? Number(e.target.value) : undefined
              )
            }
          >
            <option value="">— Первый из разрешённых —</option>
            {allowedMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {materialLabel(m)}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {allowedIds.length === 0 && (
        <Alert type="info">Отметьте хотя бы один материал обложки (например плотная 250–300 г/м²).</Alert>
      )}
    </div>
  )
}
