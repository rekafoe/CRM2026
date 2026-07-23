import React, { useMemo } from 'react'
import { MoneyAmount } from '../ui'
import {
  densitiesWithMaterialId,
  paperTypeLabel,
  summarizeAllowedPaperTypeDensities,
  toggleMaterialIdInAllowed,
  type PaperTypeDensitiesLike,
} from '../../utils/paperTypeDensitiesAllowed'
import './PaperTypeDensitiesAllowedEditor.css'

type Props = {
  allowedIds: number[]
  onAllowedChange: (ids: number[]) => void
  paperTypes: PaperTypeDensitiesLike[]
  loading?: boolean
  /** Подпись блока (по умолчанию — «Разрешённые типы и плотности») */
  title?: string
  emptyHint?: string
}

export const PaperTypeDensitiesAllowedEditor: React.FC<Props> = ({
  allowedIds,
  onAllowedChange,
  paperTypes,
  loading = false,
  title = 'Разрешённые типы и плотности',
  emptyHint = 'Нет типов бумаги со склада. Заполните справочник «Типы бумаги».',
}) => {
  const allowedSet = useMemo(
    () => new Set(allowedIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)),
    [allowedIds]
  )

  const summary = useMemo(
    () => summarizeAllowedPaperTypeDensities(paperTypes, allowedIds),
    [paperTypes, allowedIds]
  )

  const typesWithDensities = useMemo(
    () =>
      paperTypes
        .map((pt) => ({ pt, dens: densitiesWithMaterialId(pt) }))
        .filter((row) => row.dens.length > 0),
    [paperTypes]
  )

  const toggle = (materialId: number, checked: boolean) => {
    onAllowedChange(toggleMaterialIdInAllowed(allowedIds, materialId, checked))
  }

  if (loading) {
    return <div className="paper-type-densities-editor__empty">Загрузка типов бумаги…</div>
  }

  if (typesWithDensities.length === 0) {
    return <div className="paper-type-densities-editor__empty">{emptyHint}</div>
  }

  return (
    <div className="paper-type-densities-editor">
      <div className="text-sm font-medium">{title}</div>
      {summary ? (
        <div className="paper-type-densities-editor__summary">
          <span className="paper-type-densities-editor__summary-label">Выбрано:</span>
          {summary}
        </div>
      ) : null}
      <div className="paper-type-densities-editor__list">
        {typesWithDensities.map(({ pt, dens }) => {
          const selectedCount = dens.filter((d) => allowedSet.has(d.materialId)).length
          const active = selectedCount > 0
          return (
            <div
              key={String(pt.id ?? pt.name)}
              className={`paper-type-densities-editor__type${active ? ' paper-type-densities-editor__type--active' : ''}`}
            >
              <div className="paper-type-densities-editor__type-title">
                {paperTypeLabel(pt)}
                {active ? ` (${selectedCount})` : ''}
              </div>
              <div className="paper-type-densities-editor__densities">
                {dens.map((d) => {
                  const checked = allowedSet.has(d.materialId)
                  return (
                    <label
                      key={d.materialId}
                      className={`paper-type-densities-editor__density${checked ? ' paper-type-densities-editor__density--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggle(d.materialId, e.target.checked)}
                      />
                      <span>
                        {d.value} г/м²
                        {d.price != null ? (
                          <span className="paper-type-densities-editor__price">
                            {' '}
                            · <MoneyAmount value={d.price} />/лист
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
