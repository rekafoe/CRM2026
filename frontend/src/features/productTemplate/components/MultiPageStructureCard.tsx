import React, { useMemo, useState } from 'react'
import { FormField } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type {
  MultiPageStructureConfig,
  SimplifiedSizeConfig,
} from '../hooks/useProductTemplate'
import type { BindingServiceRow } from './SimplifiedTemplateSection'

type PrintTechRow = { code: string; name: string; supports_duplex?: number | boolean }

type Props = {
  structure: MultiPageStructureConfig
  onChange: (patch: Partial<MultiPageStructureConfig>) => void
  pagesHint?: { pages: number; singleSheets: number; duplexSheets: number } | null
  allMaterials: CalculatorMaterial[]
  /** Материалы, разрешённые для текущего типа/размера — приоритет в списке обложки */
  preferredMaterialIds?: number[]
  printTechs: PrintTechRow[]
  bindingServices: BindingServiceRow[]
  /** Текущий размер — для кнопки «как у блока» */
  selectedSize?: SimplifiedSizeConfig | null
}

function materialLabel(m: CalculatorMaterial): string {
  const density = (m as { density?: number | string }).density
  const extra = density != null && density !== '' ? ` · ${density} г/м²` : ''
  const cat = m.category_name ? `${m.category_name} · ` : ''
  return `${cat}${m.name}${extra}`
}

export const MultiPageStructureCard: React.FC<Props> = ({
  structure,
  onChange,
  pagesHint,
  allMaterials,
  preferredMaterialIds = [],
  printTechs,
  bindingServices,
  selectedSize,
}) => {
  const innerBlock = structure.innerBlock || { pagesSource: 'parameter' as const }
  const cover = structure.cover || { mode: 'none' as const }
  const binding = structure.binding || {}
  const coverPrint = cover.print || {}

  const [materialFilter, setMaterialFilter] = useState('')

  const coverMaterialOptions = useMemo(() => {
    const preferred = new Set(preferredMaterialIds.map(Number).filter(Number.isFinite))
    const list =
      preferred.size > 0
        ? allMaterials.filter((m) => preferred.has(Number(m.id)))
        : allMaterials
    const selectedId = cover.material_id != null ? Number(cover.material_id) : null
    if (selectedId != null && !list.some((m) => Number(m.id) === selectedId)) {
      const extra = allMaterials.find((m) => Number(m.id) === selectedId)
      if (extra) return [extra, ...list]
    }
    return list
  }, [allMaterials, preferredMaterialIds, cover.material_id])

  const filteredCoverMaterials = useMemo(() => {
    const q = materialFilter.trim().toLowerCase()
    if (!q) return coverMaterialOptions
    return coverMaterialOptions.filter(
      (m) =>
        materialLabel(m).toLowerCase().includes(q) ||
        String(m.id).includes(q),
    )
  }, [coverMaterialOptions, materialFilter])

  const selectedTech = printTechs.find(
    (t) => t.code === coverPrint.technology_code,
  )
  const supportsDuplex =
    selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true

  const applyBlockPrintToCover = () => {
    const dp = selectedSize?.default_print
    if (!dp?.technology_code) return
    onChange({
      cover: {
        ...cover,
        mode: cover.mode === 'none' ? 'separate' : cover.mode,
        print: {
          technology_code: dp.technology_code,
          color_mode: dp.color_mode ?? 'color',
          sides_mode: dp.sides_mode ?? 'single',
        },
      },
    })
  }

  const patchCover = (patch: Partial<typeof cover>) => {
    onChange({ cover: { ...cover, ...patch } })
  }

  const patchCoverPrint = (patch: Partial<typeof coverPrint>) => {
    patchCover({ print: { ...coverPrint, ...patch } })
  }

  const patchBinding = (patch: Partial<typeof binding>) => {
    onChange({ binding: { ...binding, ...patch } })
  }

  const bindingService = bindingServices.find((b) => b.id === binding.service_id)

  return (
    <div className="multipage-structure">
      {pagesHint && (
        <p className="text-muted text-sm multipage-structure__hint">
          Пример на {pagesHint.pages} стр.: односторонняя — {pagesHint.singleSheets} листов на изделие;
          двухсторонняя — {pagesHint.duplexSheets} листов.
        </p>
      )}

      <section className="multipage-structure__section">
        <h4 className="multipage-structure__title">Внутренний блок</h4>
        <div className="simplified-form-grid">
          <FormField label="Откуда брать число страниц">
            <select
              className="form-select"
              value={innerBlock.pagesSource || 'parameter'}
              onChange={(e) =>
                onChange({
                  innerBlock: {
                    ...innerBlock,
                    pagesSource: e.target.value as 'parameter' | 'fixed',
                  },
                })
              }
            >
              <option value="parameter">Из калькулятора (поле «Страницы»)</option>
              <option value="fixed">Всегда фиксированное</option>
            </select>
          </FormField>
          {innerBlock.pagesSource === 'fixed' && (
            <FormField label="Страниц в изделии">
              <input
                className="form-input form-input--compact"
                type="number"
                min={1}
                value={innerBlock.fixedPages ?? ''}
                onChange={(e) =>
                  onChange({
                    innerBlock: {
                      ...innerBlock,
                      fixedPages: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </FormField>
          )}
        </div>
      </section>

      <section className="multipage-structure__section">
        <h4 className="multipage-structure__title">Обложка</h4>
        <div className="simplified-form-grid">
          <FormField label="Режим обложки">
            <select
              className="form-select"
              value={cover.mode || 'none'}
              onChange={(e) =>
                patchCover({ mode: e.target.value as 'none' | 'self' | 'separate' })
              }
            >
              <option value="none">Без отдельной обложки</option>
              <option value="self">Та же бумага и печать, что у блока</option>
              <option value="separate">Своя бумага и печать</option>
            </select>
          </FormField>
          <FormField label="Листов обложки на одно изделие">
            <input
              className="form-input form-input--compact"
              type="number"
              min={1}
              value={cover.qty_per_item ?? 1}
              onChange={(e) =>
                patchCover({
                  qty_per_item: e.target.value ? Number(e.target.value) : 1,
                })
              }
            />
          </FormField>
        </div>

        {cover.mode === 'separate' && (
          <div className="multipage-structure__subsection">
            {selectedSize?.default_print?.technology_code && (
              <button
                type="button"
                className="el-button el-button--mini multipage-structure__copy-btn"
                onClick={applyBlockPrintToCover}
              >
                Скопировать печать с текущего размера
              </button>
            )}
            <div className="simplified-form-grid">
              <FormField
                label="Бумага обложки"
                help={
                  preferredMaterialIds.length > 0
                    ? 'Список из материалов, разрешённых для выбранного размера.'
                    : 'Сначала настройте материалы для размера — или выберите из всего справочника.'
                }
              >
                {coverMaterialOptions.length > 12 && (
                  <input
                    type="search"
                    className="form-input form-input--compact multipage-structure__search"
                    placeholder="Поиск по названию…"
                    value={materialFilter}
                    onChange={(e) => setMaterialFilter(e.target.value)}
                  />
                )}
                <select
                  className="form-select"
                  value={cover.material_id ?? ''}
                  onChange={(e) =>
                    patchCover({
                      material_id: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">— Выберите бумагу —</option>
                  {filteredCoverMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {materialLabel(m)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Технология печати обложки">
                <select
                  className="form-select"
                  value={coverPrint.technology_code || ''}
                  onChange={(e) =>
                    patchCoverPrint({
                      technology_code: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">— Выберите технологию —</option>
                  {printTechs.map((tech) => (
                    <option key={tech.code} value={tech.code}>
                      {tech.name || tech.code}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Цвет обложки">
                <select
                  className="form-select"
                  value={coverPrint.color_mode || 'color'}
                  disabled={!coverPrint.technology_code}
                  onChange={(e) =>
                    patchCoverPrint({
                      color_mode: e.target.value as 'color' | 'bw',
                    })
                  }
                >
                  <option value="color">Цветная</option>
                  <option value="bw">Чёрно-белая</option>
                </select>
              </FormField>

              <FormField label="Стороны обложки">
                <select
                  className="form-select"
                  value={coverPrint.sides_mode || 'single'}
                  disabled={!coverPrint.technology_code}
                  onChange={(e) =>
                    patchCoverPrint({
                      sides_mode: e.target.value as
                        | 'single'
                        | 'duplex'
                        | 'duplex_bw_back',
                    })
                  }
                >
                  <option value="single">Односторонняя</option>
                  {supportsDuplex && <option value="duplex">Двусторонняя</option>}
                  {supportsDuplex && (
                    <option value="duplex_bw_back">Двусторонняя (Ч/Б сзади)</option>
                  )}
                </select>
              </FormField>
            </div>
          </div>
        )}
      </section>

      <section className="multipage-structure__section">
        <h4 className="multipage-structure__title">Переплёт</h4>
        {bindingServices.length === 0 ? (
          <p className="text-muted text-sm">
            В справочнике нет услуг переплёта. Добавьте услугу с типом операции «переплёт» (bind) в разделе
            управления послепечатными услугами.
          </p>
        ) : (
          <div className="simplified-form-grid">
            <FormField
              label="Услуга переплёта"
              help="Например: скоба, пружина, клеевой блок."
            >
              <select
                className="form-select"
                value={binding.service_id ?? ''}
                onChange={(e) => {
                  const nextServiceId = e.target.value ? Number(e.target.value) : undefined
                  patchBinding({
                    service_id: nextServiceId,
                    variant_id: undefined,
                  })
                }}
              >
                <option value="">— Не выбран —</option>
                {bindingServices.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </FormField>

            {binding.service_id != null && (
              <FormField
                label="Вариант"
                help="Лимиты страниц задаются в карточке услуги → таблица вариантов."
              >
                <select
                  className="form-select"
                  value={binding.variant_id ?? ''}
                  onChange={(e) =>
                    patchBinding({
                      variant_id: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">— По умолчанию (без варианта) —</option>
                  {(bindingService?.variants || []).map((variant) => {
                    const label =
                      variant.variantName || variant.variant_name || `Вариант #${variant.id}`
                    return (
                      <option key={variant.id} value={variant.id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              </FormField>
            )}

            <FormField label="Операций переплёта на изделие">
              <input
                className="form-input form-input--compact"
                type="number"
                min={1}
                value={binding.units_per_item ?? 1}
                onChange={(e) =>
                  patchBinding({
                    units_per_item: e.target.value ? Number(e.target.value) : 1,
                  })
                }
              />
            </FormField>
          </div>
        )}
      </section>
    </div>
  )
}
