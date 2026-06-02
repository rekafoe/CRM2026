import React, { useMemo } from 'react'
import { FormField } from '../../../components/common'
import { CoverMaterialsAllowedEditor } from '../../../components/multipage/CoverMaterialsAllowedEditor'
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
  pagesHint?: {
    totalPages: number
    coverPages: number
    blockPages: number
    singleSheets: number
    duplexSheets: number
  } | null
  allMaterials: CalculatorMaterial[]
  /** Материалы блока для текущего размера — подсказка при первом включении отдельной обложки */
  preferredMaterialIds?: number[]
  paperTypes: Array<{
    id: number | string
    name: string
    display_name?: string
    densities?: Array<{ material_id?: number; value?: number; price?: number }>
  }>
  printTechs: PrintTechRow[]
  bindingServices: BindingServiceRow[]
  /** Текущий размер — для кнопки «как у блока» */
  selectedSize?: SimplifiedSizeConfig | null
}

export const MultiPageStructureCard: React.FC<Props> = ({
  structure,
  onChange,
  pagesHint,
  allMaterials,
  preferredMaterialIds = [],
  paperTypes,
  printTechs,
  bindingServices,
  selectedSize,
}) => {
  const innerBlock = structure.innerBlock || { pagesSource: 'parameter' as const }
  const cover = structure.cover || { mode: 'none' as const }
  const binding = structure.binding || {}
  const coverPrint = cover.print || {}

  const coverAllowedIds = useMemo(
    () => (cover.allowed_material_ids ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [cover.allowed_material_ids],
  )

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
    const next = { ...cover, ...patch }
    if (patch.mode === 'separate' && !(next.allowed_material_ids?.length)) {
      const pref = preferredMaterialIds
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0)
      if (pref.length > 0) {
        next.allowed_material_ids = [...pref]
      } else if (next.material_id != null) {
        next.allowed_material_ids = [Number(next.material_id)]
      }
    }
    onChange({ cover: next })
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
          Пример: {pagesHint.totalPages} стр. всего
          {pagesHint.coverPages > 0 ? ` (${pagesHint.coverPages} обложка + ${pagesHint.blockPages} блок)` : ''}
          {' — '}
          листов SRA3 на изделие (блок): односторонняя {pagesHint.singleSheets}, двухсторонняя {pagesHint.duplexSheets}.
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
          <FormField
            label="Страниц обложки"
            help="Входят в общее число страниц в калькуляторе. Пример: 28 стр. всего = 4 обложка + 24 блок."
          >
            <input
              className="form-input form-input--compact"
              type="number"
              min={1}
              step={2}
              value={cover.page_count ?? 4}
              onChange={(e) =>
                patchCover({
                  page_count: e.target.value ? Number(e.target.value) : 4,
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
            <CoverMaterialsAllowedEditor
              allowedIds={coverAllowedIds}
              onAllowedChange={(ids) =>
                patchCover({
                  allowed_material_ids: ids,
                  material_id:
                    cover.material_id != null &&
                    ids.includes(Number(cover.material_id))
                      ? cover.material_id
                      : ids[0],
                })
              }
              allMaterials={allMaterials}
              paperTypes={paperTypes}
              defaultMaterialId={cover.material_id}
              onDefaultMaterialChange={(id) => patchCover({ material_id: id })}
              allowEditAllowedList
            />

            <div className="simplified-form-grid">
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

          </div>
        )}
      </section>
    </div>
  )
}
