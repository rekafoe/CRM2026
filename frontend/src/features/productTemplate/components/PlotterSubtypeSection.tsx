import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/common'
import type { SimplifiedConfig, SimplifiedTypeConfig, ProductTypeId } from '../hooks/useProductTemplate'
import './PlotterSubtypeSection.css'

const updateTypeConfig = (
  value: SimplifiedConfig,
  typeId: ProductTypeId,
  patch: Partial<SimplifiedTypeConfig>
): SimplifiedConfig => {
  const key = String(typeId)
  const base = value.typeConfigs ?? {}
  const prev = base[key] ?? { sizes: [] }
  return {
    ...value,
    typeConfigs: { ...base, [key]: { ...prev, ...patch } },
  }
}

export type PlotterMaterialOption = { id: number; name?: string }

export interface PlotterSubtypeSectionProps {
  value: SimplifiedConfig
  typeId: ProductTypeId
  onChange: (next: SimplifiedConfig) => void
  materials?: PlotterMaterialOption[]
  materialDriven?: boolean
}

/** Режим резки подтипа и материалы. Ставки живут в админке «Плоттерная резка». */
export const PlotterSubtypeSection: React.FC<PlotterSubtypeSectionProps> = ({
  value,
  typeId,
  onChange,
  materials = [],
  materialDriven = false,
}) => {
  const navigate = useNavigate()
  const [materialQuery, setMaterialQuery] = useState('')
  const cfg = value.typeConfigs?.[String(typeId)]
  const plotter = cfg?.plotter ?? {}
  const mode = plotter.mode ?? 'roll'
  const selectedIds = Array.isArray(plotter.roll_allowed_material_ids) ? plotter.roll_allowed_material_ids : []
  const showAuto = materialDriven || mode === 'auto'

  const patchPlotter = (patch: Partial<NonNullable<SimplifiedTypeConfig['plotter']>>) => {
    const nextPlotter = { ...plotter, ...patch }
    const cleaned: Record<string, unknown> = {}
    const isEmptyPatchValue = (val: unknown): boolean =>
      val === undefined || (typeof val === 'string' && val.length === 0)

    for (const [k, v] of Object.entries(nextPlotter)) {
      if (isEmptyPatchValue(v)) continue
      cleaned[k] = v
    }
    onChange(
      updateTypeConfig(value, typeId, {
        plotter: Object.keys(cleaned).length ? (cleaned as SimplifiedTypeConfig['plotter']) : undefined,
      })
    )
  }

  const toggleMaterial = (id: number, checked: boolean) => {
    const next = checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id)
    patchPlotter({ roll_allowed_material_ids: next.length ? Array.from(new Set(next)) : undefined })
  }

  const visibleMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase()
    const list = [...materials].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
    if (!q) return list
    return list.filter((m) => String(m.name || '').toLowerCase().includes(q) || String(m.id).includes(q))
  }, [materials, materialQuery])

  return (
    <div className="subtype-edit-panel__body plotter-subtype">
      <div className="plotter-subtype__toolbar">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate('/adminpanel/plotter-cutting')}
        >
          Ставки резки
        </Button>
        <p className="plotter-subtype__toolbar-hint">
          Цена метра, выборка и накатка задаются в разделе «Плоттерная резка». Здесь — рулон или лист и какие материалы
          можно выбрать.
        </p>
      </div>
      <div className="plotter-subtype__toggle">
        <label className="simplified-template__type-checkbox-label">
          <input
            type="checkbox"
            checked={plotter.enabled === true}
            onChange={(e) => patchPlotter({ enabled: e.target.checked })}
          />
          <span>Включить плоттерную резку для этого подтипа</span>
        </label>
      </div>

      {plotter.enabled === true && (
        <div className="plotter-subtype__content">
          <div className="plotter-subtype__section">
            <div className="simplified-template__type-website-title">Как режем</div>
            <div className="plotter-mode-cards" role="radiogroup" aria-label="Режим плоттера">
              <button
                type="button"
                className={mode === 'roll' ? 'plotter-mode-card is-active' : 'plotter-mode-card'}
                aria-pressed={mode === 'roll'}
                onClick={() => patchPlotter({ mode: 'roll' })}
              >
                <strong>Рулон</strong>
                <span>Плёнка с рулона. Можно добавить выборку и накатку.</span>
              </button>
              <button
                type="button"
                className={mode === 'sheet' ? 'plotter-mode-card is-active' : 'plotter-mode-card'}
                aria-pressed={mode === 'sheet'}
                onClick={() => patchPlotter({ mode: 'sheet' })}
              >
                <strong>Лист</strong>
                <span>Режем лист материала. Если формат не задан — SRA3, 320×450 мм.</span>
              </button>
              {showAuto && (
                <button
                  type="button"
                  className={mode === 'auto' ? 'plotter-mode-card is-active' : 'plotter-mode-card'}
                  aria-pressed={mode === 'auto'}
                  onClick={() => patchPlotter({ mode: 'auto' })}
                >
                  <strong>Авто</strong>
                  <span>Рулон или лист по виду выбранного материала.</span>
                </button>
              )}
            </div>
          </div>

          <div className="plotter-subtype__section">
            <div className="simplified-template__type-website-title">Материалы рулона</div>
            <p className="plotter-subtype__hint">
              Отмеченные можно выбрать в рулонном режиме. Если ничего не отмечено, подходят все материалы размера.
            </p>
            {materials.length > 8 && (
              <input
                className="form-input"
                value={materialQuery}
                onChange={(e) => setMaterialQuery(e.target.value)}
                placeholder="Найти материал"
                aria-label="Найти материал"
              />
            )}
            {materials.length === 0 ? (
              <p className="plotter-subtype__hint">Список материалов ещё не загружен.</p>
            ) : (
              <ul className="plotter-material-list">
                {visibleMaterials.map((material) => {
                  const checked = selectedIds.includes(material.id)
                  return (
                    <li key={material.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleMaterial(material.id, e.target.checked)}
                        />
                        <span>{material.name || `Материал ${material.id}`}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="plotter-subtype__section">
            <div className="simplified-template__type-website-title">Монтажная плёнка</div>
            <p className="plotter-subtype__hint">
              Когда в калькуляторе включена накатка, этот материал списывается в метрах подачи.
            </p>
            <select
              className="form-input"
              value={plotter.mounting_film_material_id ?? ''}
              onChange={(e) =>
                patchPlotter({
                  mounting_film_material_id: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            >
              <option value="">Не списывать отдельно</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name || `Материал ${material.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
