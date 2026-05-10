import React from 'react'
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

export interface PlotterSubtypeSectionProps {
  value: SimplifiedConfig
  typeId: ProductTypeId
  onChange: (next: SimplifiedConfig) => void
}

/** Редактор блока plotter в подтипе: режим резки и ограничения; ставки выборки/накатки — в «Плоттерная резка». */
export const PlotterSubtypeSection: React.FC<PlotterSubtypeSectionProps> = ({
  value,
  typeId,
  onChange,
}) => {
  const navigate = useNavigate()
  const cfg = value.typeConfigs?.[String(typeId)]
  const plotter = cfg?.plotter ?? {}
  const rollIdsText = Array.isArray(plotter.roll_allowed_material_ids)
    ? plotter.roll_allowed_material_ids.join('\n')
    : ''

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

  const parseIds = (text: string): number[] =>
    text
      .split(/[\n,]+/)
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isFinite(n) && n > 0)

  return (
    <div className="subtype-edit-panel__body plotter-subtype">
      <div className="plotter-subtype__toolbar">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate('/adminpanel/plotter-cutting')}
        >
          Тарифы и услуги плоттера
        </Button>
        <p className="plotter-subtype__toolbar-hint">
          Базовые тарифы и доптарифы (выборка/накатка) настраиваются в админке в разделе «Плоттерная резка». Здесь —
          только режим подтипа и ограничения по материалам.
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
            <div className="simplified-template__type-website-title">Режим резки</div>
            <p className="plotter-subtype__hint">
              Цена за п.м. для основной резки и доптарифы выборки/накатки берутся из глобальных тарифов в админке.
            </p>
            <div className="simplified-template__type-website-field">
              <label htmlFor={`plotter-mode-${String(typeId)}`}>Режим плоттера</label>
              <select
                id={`plotter-mode-${String(typeId)}`}
                className="form-input"
                value={plotter.mode ?? 'roll'}
                onChange={(e) =>
                  patchPlotter({ mode: e.target.value === 'sheet' ? 'sheet' : 'roll' })
                }
              >
                <option value="roll">Рулонный плоттер</option>
                <option value="sheet">Листовой плоттер</option>
              </select>
            </div>
            {plotter.mode === 'sheet' && (
              <p className="plotter-subtype__hint plotter-subtype__hint--sheet">
                Листовой плоттер: типовой носитель <strong>SRA3</strong> (320×450 мм). В калькуляторе берутся размеры листа у
                материала; если не заданы — для оценки пробега ножа подставляется SRA3 (с предупреждением в расчёте).
              </p>
            )}
          </div>

          <div className="plotter-subtype__section">
            <div className="simplified-template__type-website-title">Материалы рулона</div>
            <p className="plotter-subtype__hint">
              Если список не пустой, для рулонного режима можно выбрать только эти материалы. Пусто — любой
              материал, разрешённый для размера.
            </p>
            <div className="simplified-template__type-website-field">
              <label htmlFor={`plotter-roll-ids-${String(typeId)}`}>
                Разрешённые ID материалов (по одному в строке или через запятую)
              </label>
              <textarea
                id={`plotter-roll-ids-${String(typeId)}`}
                className="form-input"
                rows={3}
                value={rollIdsText}
                onChange={(e) =>
                  patchPlotter({
                    roll_allowed_material_ids:
                      e.target.value.trim() === '' ? undefined : parseIds(e.target.value),
                  })
                }
                placeholder="Например: 12"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="plotter-subtype__section">
            <div className="simplified-template__type-website-title">Дополнительно в калькуляторе</div>
            <p className="plotter-subtype__hint">
              Для монтажки можно задать материал списания в п.м. При флаге <code>plotter_mounting</code> этот материал
              будет учтён в расходе.
            </p>
            <div className="plotter-subtype__grid-2">
              <div className="simplified-template__type-website-field">
                <label htmlFor={`plotter-mount-mat-${String(typeId)}`}>Монтажная плёнка (материал, п.м.)</label>
                <input
                  id={`plotter-mount-mat-${String(typeId)}`}
                  type="number"
                  className="form-input"
                  min={1}
                  value={plotter.mounting_film_material_id ?? ''}
                  onChange={(e) =>
                    patchPlotter({
                      mounting_film_material_id: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
