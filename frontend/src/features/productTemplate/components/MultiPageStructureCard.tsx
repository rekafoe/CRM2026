import React, { useEffect, useMemo, useState } from 'react'
import { FormField } from '../../../components/common'
import { CoverMaterialsAllowedEditor } from '../../../components/multipage/CoverMaterialsAllowedEditor'
import { WarehouseMaterialsAllowedEditor } from './WarehouseMaterialsAllowedEditor'
import {
  listBindingLeafPaths,
  type BindingVariantOption,
} from '../../../components/calculator/components/BindingVariantSelector'
import { readBindingPagesLimits } from '../../../utils/multipageBinding'
import {
  bindingUnitNote,
  bindingUnitShortLabel,
  isBindingPerItemUnit,
} from '../../../components/admin/services/utils/bindingCopy'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import type {
  MultiPageStructureConfig,
  SimplifiedSizeConfig,
} from '../hooks/useProductTemplate'
import type { BindingServiceRow, BindingServiceVariant, ServiceRow } from './SimplifiedTemplateSection'
import { getServiceVariants } from '../../../services/pricing/api'
import { finishingLeafOptions } from '../finishingVariantTree'
import type { ServiceVariant } from '../../../types/pricing'
import {
  applyReadyCover,
  applySheetBlock,
  coverChoiceOf,
  sidesToCoverPrintChoice,
  springSheetsOf,
  usesBlockSheets,
  type BoundStructure,
} from '../../../utils/boundProductPreset'

type PrintTechRow = { code: string; name: string; supports_duplex?: number | boolean }

function bindingVariantActive(variant: BindingServiceVariant): boolean {
  if (variant.isActive === false) return false
  if (variant.is_active === false || variant.is_active === 0) return false
  return true
}

function toBindingOptions(variants: BindingServiceVariant[] | undefined): BindingVariantOption[] {
  return (variants ?? []).map((variant) => ({
    id: Number(variant.id),
    variantName: variant.variantName || variant.variant_name,
    parentVariantId: variant.parentVariantId ?? variant.parent_variant_id ?? null,
    isActive: bindingVariantActive(variant),
    parameters: variant.parameters,
  }))
}

function bindingTemplatePagesLine(parameters: unknown): string {
  const { minPages, maxPages } = readBindingPagesLimits(parameters)
  if (minPages != null && maxPages != null) {
    return `Страницы изделия: от ${minPages} до ${maxPages}, с обложкой`
  }
  if (minPages != null) return `Страницы изделия: от ${minPages}, с обложкой`
  if (maxPages != null) return `Страницы изделия: до ${maxPages}, с обложкой`
  return 'лимит страниц не задан'
}

function bindingTemplateUnitLine(unit: string | null | undefined): string {
  if (isBindingPerItemUnit(unit)) return 'Единица: за изделие'
  const note = bindingUnitNote(unit)
  const label = bindingUnitShortLabel(unit)
  return note ? `единица ${label}, ${note}` : `единица ${label}`
}

function bindingTemplateRunLine(minRaw: unknown, maxRaw: unknown): string | null {
  const min = minRaw != null && minRaw !== '' && Number.isFinite(Number(minRaw)) ? Number(minRaw) : 1
  const max = maxRaw != null && maxRaw !== '' && Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : null
  if (min <= 1 && max == null) return null
  return max != null ? `тираж заказа ${min}–${max}` : `тираж заказа от ${min}`
}

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
  /** Услуги справочника — для ламинации только обложки */
  services?: ServiceRow[]
  /** Текущий размер — для кнопки «как у блока» */
  selectedSize?: SimplifiedSizeConfig | null
  /** Листы и пресет страниц одним обновлением, чтобы use_sheets не затирался. */
  onApplySheetNotebook?: (applied: BoundStructure) => void
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
  services = [],
  selectedSize,
  onApplySheetNotebook,
}) => {
  const innerBlock = structure.innerBlock || { pagesSource: 'parameter' as const }
  const cover = structure.cover || { mode: 'none' as const }
  const binding = structure.binding || {}
  const coverPrint = cover.print || {}
  const coverLamination = cover.lamination || {}
  const [laminationLeaves, setLaminationLeaves] = useState<ReturnType<typeof finishingLeafOptions>>([])

  useEffect(() => {
    const serviceId = Number(coverLamination.service_id)
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      setLaminationLeaves([])
      return
    }
    let cancelled = false
    getServiceVariants(serviceId)
      .then((list) => {
        if (!cancelled) setLaminationLeaves(finishingLeafOptions(Array.isArray(list) ? list as ServiceVariant[] : []))
      })
      .catch(() => {
        if (!cancelled) setLaminationLeaves([])
      })
    return () => {
      cancelled = true
    }
  }, [coverLamination.service_id])

  const laminationServices = useMemo(() => {
    return services.filter((service) => {
      const operation = String(service.operation_type ?? service.operationType ?? service.type ?? '').toLowerCase()
      const name = String(service.name ?? service.service_name ?? '').toLowerCase()
      if (operation === 'bind' || operation === 'print' || operation === 'printing') return false
      return operation === 'laminate' || operation === 'lamination' || name.includes('ламин') || name.includes('laminat')
    })
  }, [services])

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

  const coverChoice = coverChoiceOf(structure as BoundStructure)
  const useSheets = usesBlockSheets(structure as BoundStructure)
  const springSheets = springSheetsOf(structure as BoundStructure)
  const setCoverChoice = (next: 'printed' | 'ready') => {
    if (next === 'ready') {
      onChange(applyReadyCover(structure as BoundStructure))
      return
    }
    onChange({ ...structure, coverChoice: 'printed' })
  }
  const setUseSheets = (enabled: boolean) => {
    if (!enabled) {
      onChange({
        notebook: { ...(structure.notebook ?? {}), use_sheets: false },
      })
      return
    }
    const applied = applySheetBlock(structure as BoundStructure, springSheets)
    if (onApplySheetNotebook) onApplySheetNotebook(applied)
    else onChange(applied)
  }
  const setSpringSheets = (sheets: number) => {
    const applied = applySheetBlock(structure as BoundStructure, sheets)
    if (onApplySheetNotebook) onApplySheetNotebook(applied)
    else onChange(applied)
  }

  const bindingService = bindingServices.find((b) => b.id === binding.service_id)
  const bindingOptions = toBindingOptions(bindingService?.variants)
  const bindingLeafChoices = listBindingLeafPaths(bindingOptions)
  const selectedLeaf = bindingLeafChoices.find((leaf) => leaf.id === binding.variant_id)
  const savedBindingVariant = bindingOptions.find((variant) => variant.id === binding.variant_id)
  const bindingLeafMessage = (() => {
    if (!binding.service_id || bindingLeafChoices.length === 0) return null
    if (selectedLeaf) return null
    if (savedBindingVariant && savedBindingVariant.isActive === false) return 'Лист выключен'
    if (savedBindingVariant) {
      const name = savedBindingVariant.variantName || 'группа'
      return `Сейчас выбрана группа „${name}“. Нужен лист.`
    }
    return 'Выберите лист'
  })()
  const bindingLeafInvalid = bindingLeafMessage != null
  const selectedLeafVariant = selectedLeaf
    ? bindingService?.variants?.find((variant) => Number(variant.id) === selectedLeaf.id)
    : undefined
  const bindingLeafSummary = selectedLeafVariant
    ? [
        bindingTemplatePagesLine(selectedLeafVariant.parameters),
        selectedLeafVariant.material_id != null
          ? `Материал: ${allMaterials.find((material) => material.id === Number(selectedLeafVariant.material_id))?.name || 'материал'}`
          : 'материал услуги',
        bindingTemplateUnitLine(bindingService?.price_unit ?? bindingService?.priceUnit),
        bindingTemplateRunLine(
          bindingService?.min_quantity ?? bindingService?.minQuantity,
          bindingService?.max_quantity ?? bindingService?.maxQuantity,
        ),
      ].filter(Boolean).join(' · ')
    : ''

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
        <h4 className="multipage-structure__title">Обложка</h4>
        <div className="simplified-form-grid">
          <FormField
            label="Обложка"
            help="Печатная — пружина, 7БЦ, винты и любой другой переплёт. Готовая крышка — клиент выбирает заготовку, канал подставляется по толщине."
          >
            <select
              className="form-select"
              value={coverChoice}
              onChange={(e) => setCoverChoice(e.target.value === 'ready' ? 'ready' : 'printed')}
            >
              <option value="printed">Обложка печатается</option>
              <option value="ready">Крышка готовая</option>
            </select>
          </FormField>
        </div>
        {coverChoice === 'printed' && (
          <label className="text-sm">
            <input
              type="checkbox"
              checked={useSheets}
              onChange={(e) => setUseSheets(e.target.checked)}
            />
            {' '}
            Оператор вводит листы блока, не итог страниц
          </label>
        )}
        {useSheets && (
          <>
            <div className="simplified-form-grid">
              <FormField label="Листов блока" help="50 листов с двух сторон — 100 страниц блока и 2 картона. В калькулятор уходит 102, руками его не вводят.">
                <input
                  className="form-input form-input--compact"
                  type="number"
                  min={1}
                  value={springSheets}
                  onChange={(e) => setSpringSheets(Number(e.target.value))}
                />
              </FormField>
            </div>
            <div className="simplified-form-grid">
              <FormField label="Бумага «белая»" help="Оператор выбирает белую или клетку. Оба материала уже должны быть на складе.">
                <select
                  className="form-select"
                  value={structure.notebook?.white_material_id ?? ''}
                  onChange={(e) =>
                    onChange({
                      notebook: {
                        ...(structure.notebook ?? {}),
                        use_sheets: true,
                        white_material_id: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                >
                  <option value="">— Материал —</option>
                  {allMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Бумага «в клетку»">
                <select
                  className="form-select"
                  value={structure.notebook?.grid_material_id ?? ''}
                  onChange={(e) =>
                    onChange({
                      notebook: {
                        ...(structure.notebook ?? {}),
                        use_sheets: true,
                        grid_material_id: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                >
                  <option value="">— Материал —</option>
                  {allMaterials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </>
        )}
        {coverChoice === 'ready' && (
          <>
            <p className="text-muted text-sm">
              Клиент выбирает только крышку: цвет и формат в названии, например «Обложка metalbind чёрная A4».
              Канал — другая позиция склада, подставляется по толщине блока. Списание: 2 крышки и 1 канал.
              Печать, страницы обложки и ламинация в калькуляторе скрыты. УФ по крышке сюда не входит:
              его можно включить позже в этом же шаблоне, продукт заново не создаётся.
            </p>
            <FormField
              label="Печать блока"
              help="Оператор её не видит. Двухсторонняя: два страницы на лист, когда толщина считается из страниц."
            >
              <select
                className="form-select"
                value={innerBlock.print?.sides_mode === 'single' ? 'single' : 'duplex'}
                onChange={(e) =>
                  onChange({
                    innerBlock: {
                      ...innerBlock,
                      print: {
                        ...(innerBlock.print ?? {}),
                        sides_mode: e.target.value === 'single' ? 'single' : 'duplex',
                      },
                    },
                  })
                }
              >
                <option value="duplex">Двухсторонняя</option>
                <option value="single">Односторонняя</option>
              </select>
            </FormField>
            <WarehouseMaterialsAllowedEditor
              materials={allMaterials}
              allowedIds={structure.readyLid?.cover_material_ids ?? []}
              onAllowedChange={(ids) =>
                onChange({
                  readyLid: {
                    ...(structure.readyLid ?? {}),
                    cover_material_ids: ids,
                  },
                })
              }
              title="Крышки, которые выбирает клиент"
              emptyMessage="Отметьте готовые крышки. Канал здесь не отмечается."
            />
            <WarehouseMaterialsAllowedEditor
              materials={allMaterials}
              allowedIds={structure.readyLid?.channel_material_ids ?? []}
              onAllowedChange={(ids) =>
                onChange({
                  readyLid: {
                    ...(structure.readyLid ?? {}),
                    channel_material_ids: ids,
                  },
                })
              }
              title="Каналы по диапазону толщины"
              emptyMessage="Отметьте каналы. На карточке канала нужен диапазон «от–до», мм."
            />
          </>
        )}
      </section>

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

      {coverChoice === 'printed' && (
      <section className="multipage-structure__section">
        <h4 className="multipage-structure__title">Печать обложки</h4>
        <div className="simplified-form-grid">
          <FormField label="Режим обложки">
            <select
              className="form-select"
              value={cover.mode || 'none'}
              onChange={(e) => {
                const mode = e.target.value as 'none' | 'self' | 'separate'
                if (useSheets && mode !== 'separate') {
                  onChange({
                    notebook: { ...(structure.notebook ?? {}), use_sheets: false },
                    cover: { ...cover, mode },
                  })
                  return
                }
                patchCover({ mode })
              }}
            >
              <option value="none">Без отдельной обложки</option>
              <option value="self">Та же бумага и печать, что у блока</option>
              <option value="separate">Своя бумага и печать</option>
            </select>
          </FormField>
          {cover.mode !== 'none' && !useSheets && (
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
          )}
          {useSheets && (
            <FormField label="Страниц обложки" help="Два картона, перед и зад. Оператор это число не вводит.">
              <input className="form-input form-input--compact" value="2" readOnly />
            </FormField>
          )}
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

              <FormField
                label={useSheets ? 'Печать обложки по умолчанию' : 'Стороны обложки'}
                help={
                  useSheets
                    ? 'Оператор в калькуляторе выбирает «только снаружи» или «с двух сторон». Здесь — значение, с которого калькулятор открывается.'
                    : 'Односторонняя: печать с одной стороны листа, оборот без печати и без второй плёнки.'
                }
              >
                <select
                  className="form-select"
                  value={
                    useSheets
                      ? sidesToCoverPrintChoice(coverPrint.sides_mode)
                      : (coverPrint.sides_mode || 'single')
                  }
                  disabled={!coverPrint.technology_code}
                  onChange={(e) =>
                    patchCoverPrint({
                      sides_mode: (useSheets
                        ? (e.target.value === 'both' ? 'duplex' : 'single')
                        : e.target.value) as 'single' | 'duplex' | 'duplex_bw_back',
                    })
                  }
                >
                  {useSheets ? (
                    <>
                      <option value="outside">Только снаружи</option>
                      <option value="both">С двух сторон</option>
                    </>
                  ) : (
                    <>
                      <option value="single">Односторонняя</option>
                      {supportsDuplex && <option value="duplex">Двусторонняя</option>}
                      {supportsDuplex && (
                        <option value="duplex_bw_back">Двусторонняя (Ч/Б сзади)</option>
                      )}
                    </>
                  )}
                </select>
              </FormField>
            </div>

            {cover.mode === 'separate' && (
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={cover.wrap === true}
                  onChange={(e) => patchCover({ wrap: e.target.checked || undefined })}
                />
                {' '}
                Бумага кашируется на картон
              </label>
            )}
            <p className="text-muted text-sm">
              {cover.wrap
                ? 'Печатная обложка: печать и ламинация бумаги, 2 картона по отпускной цене. Отдельной ставки кашировки нет, наклейка внутри ставки bind. Лист обложки не режется раскладкой блока.'
                : 'Без каширования обложка режется так же, как лист блока. Картон не списывается.'}
            </p>
            {cover.wrap && (
              <WarehouseMaterialsAllowedEditor
                materials={allMaterials}
                allowedIds={cover.board_material_ids ?? []}
                onAllowedChange={(ids) =>
                  patchCover({
                    board_material_ids: ids,
                    board_material_id:
                      cover.board_material_id != null && ids.includes(Number(cover.board_material_id))
                        ? cover.board_material_id
                        : ids[0],
                  })
                }
                title="Переплётный картон"
                emptyMessage="Отметьте картон. Бумага выше — это то, что печатается."
              />
            )}

            <div className="simplified-form-grid">
              <FormField
                label="Ламинация обложки"
                help="Только листы обложки, одна плёнка на лист. Блок этой услугой не ламинируется."
              >
                <select
                  className="form-select"
                  value={coverLamination.service_id ?? ''}
                  onChange={(e) =>
                    patchCover({
                      lamination: {
                        service_id: e.target.value ? Number(e.target.value) : undefined,
                        variant_id: undefined,
                      },
                    })
                  }
                >
                  <option value="">— Без ламинации —</option>
                  {laminationServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name || service.service_name || `Услуга #${service.id}`}
                    </option>
                  ))}
                </select>
              </FormField>
              {coverLamination.service_id != null && laminationLeaves.length > 0 && (
                <FormField label="Плёнка">
                  <select
                    className="form-select"
                    value={coverLamination.variant_id ?? ''}
                    onChange={(e) =>
                      patchCover({
                        lamination: {
                          ...coverLamination,
                          variant_id: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                  >
                    <option value="">— Лист —</option>
                    {laminationLeaves.map((leaf) => (
                      <option key={leaf.id} value={leaf.id}>
                        {leaf.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>
          </div>
        )}
      </section>
      )}

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
              help="Любая услуга bind. Винты — ещё одна такая услуга, не отдельный тип. Норма списания пружины — «Норма на изделие» у услуги или «Норма» у листа, не число креплений."
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

            {binding.service_id != null && bindingLeafChoices.length > 0 && (
              <FormField label="Лист">
                <select
                  className={`form-select${bindingLeafInvalid ? ' multipage-structure__binding-select--invalid' : ''}`}
                  value={selectedLeaf ? binding.variant_id ?? '' : ''}
                  aria-invalid={bindingLeafInvalid || undefined}
                  onChange={(e) =>
                    patchBinding({
                      variant_id: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">— Лист —</option>
                  {bindingLeafChoices.map((leaf) => (
                    <option key={leaf.id} value={leaf.id}>
                      {leaf.path}
                    </option>
                  ))}
                </select>
                {bindingLeafMessage && (
                  <p className="multipage-structure__binding-error">{bindingLeafMessage}</p>
                )}
              </FormField>
            )}
            {binding.service_id != null && bindingLeafChoices.length === 0 && (
              <p className="multipage-structure__binding-note">
                У услуги нет дерева, считается её базовая цена.
              </p>
            )}
            {selectedLeaf && (
              <p className="multipage-structure__binding-summary">{bindingLeafSummary}</p>
            )}

          </div>
        )}
      </section>
    </div>
  )
}
