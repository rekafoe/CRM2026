import React, { useMemo } from 'react'
import { FormField, Alert } from '../common'
import type { CoverMaterialOption } from '../../services/calculatorMaterialService'
import { resolveCoverMaterialsForAllowed } from '../../utils/multipageCoverMaterials'
import { PaperTypeDensitiesAllowedEditor } from './PaperTypeDensitiesAllowedEditor'

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
  const allowedMaterials = useMemo(
    () => resolveCoverMaterialsForAllowed(allowedIds, allMaterials, paperTypes),
    [allowedIds, allMaterials, paperTypes],
  )

  const selectValue =
    defaultMaterialId != null && Number.isFinite(Number(defaultMaterialId))
      ? String(defaultMaterialId)
      : ''

  const handleAllowedChange = (ids: number[]) => {
    onAllowedChange(ids)
    if (
      defaultMaterialId != null &&
      !ids.includes(Number(defaultMaterialId))
    ) {
      onDefaultMaterialChange?.(ids[0])
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
      <PaperTypeDensitiesAllowedEditor
        allowedIds={allowedIds}
        onAllowedChange={handleAllowedChange}
        paperTypes={paperTypes}
        title="Типы бумаги и плотности обложки"
        emptyHint="Нет типов бумаги со склада. Заполните справочник «Типы бумаги»."
      />

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
        <Alert type="info">Отметьте хотя бы одну плотность обложки (например 250–300 г/м²).</Alert>
      )}
    </div>
  )
}
