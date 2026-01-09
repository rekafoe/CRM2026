import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Button, FormField, Alert, Modal } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean }
type PaperTypeRow = PaperTypeForCalculator
type ServiceRow = { id: number; name: string; operationType?: string; operation_type?: string; priceUnit?: string; price_unit?: string }

interface Props {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  onSave: () => void
  saving: boolean
  allMaterials: CalculatorMaterial[]
}

const uid = () => `sz_${Date.now()}_${Math.random().toString(16).slice(2)}`

// По умолчанию: диапазоны как в существующей системе
const defaultTiers = () => [
  { min_qty: 1, max_qty: 24, unit_price: 0 },
  { min_qty: 24, max_qty: 48, unit_price: 0 },
  { min_qty: 48, max_qty: 72, unit_price: 0 },
  { min_qty: 72, max_qty: 96, unit_price: 0 },
  { min_qty: 96, max_qty: 1000, unit_price: 0 },
  { min_qty: 1000, max_qty: undefined, unit_price: 0 }
]

type TierRangeModalState = {
  type: 'print' | 'material' | 'finishing'
  printIdx?: number
  materialIdx?: number
  finishingIdx?: number
  tierIdx?: number // для редактирования существующего диапазона
  isOpen: boolean
  minQty: string
  maxQty: string
}

export const SimplifiedTemplateSection: React.FC<Props> = ({ value, onChange, onSave, saving, allMaterials }) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(value.sizes[0]?.id ?? null)
  const [paperTypes, setPaperTypes] = useState<PaperTypeRow[]>([])
  const [printTechs, setPrintTechs] = useState<PrintTechRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSize, setNewSize] = useState<{ label: string; width_mm: string; height_mm: string }>({ label: '', width_mm: '', height_mm: '' })
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string | null>(null)
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'print',
    isOpen: false,
    minQty: '1',
    maxQty: '',
  })
  const [isMobile, setIsMobile] = useState(false)

  const selected = useMemo(
    () => value.sizes.find(s => s.id === selectedSizeId) || null,
    [value.sizes, selectedSizeId],
  )

  const updateSize = useCallback((id: string, patch: Partial<SimplifiedSizeConfig>) => {
    onChange({
      ...value,
      sizes: value.sizes.map(s => (s.id === id ? { ...s, ...patch } : s)),
    })
  }, [onChange, value])

  const removeSize = useCallback((id: string) => {
    const nextSizes = value.sizes.filter(s => s.id !== id)
    onChange({ ...value, sizes: nextSizes })
    if (selectedSizeId === id) setSelectedSizeId(nextSizes[0]?.id ?? null)
  }, [onChange, selectedSizeId, value.sizes, value])

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [pt, techResp, svcResp] = await Promise.all([
        getPaperTypesFromWarehouse(),
        getPrintTechnologies().then(r => (Array.isArray(r.data) ? r.data : [])),
        api.get('/pricing/services').then(r => (Array.isArray(r.data) ? r.data : [])),
      ])
      setPaperTypes(pt || [])
      setPrintTechs((techResp || []).filter((t: any) => t && t.code))
      const allowedOps = new Set(['cut', 'score', 'fold', 'laminate'])
      setServices((svcResp || []).filter((s: any) => allowedOps.has(String(s.operation_type ?? s.operationType ?? '').toLowerCase())))
      // Автоматически выбираем первый тип бумаги, если он есть
      if (pt && pt.length > 0 && !selectedPaperTypeId) {
        setSelectedPaperTypeId(pt[0].id)
      }
    } finally {
      setLoadingLists(false)
    }
  }, [selectedPaperTypeId])

  // Загружаем списки при монтировании компонента
  useEffect(() => {
    if (paperTypes.length === 0 && printTechs.length === 0 && services.length === 0 && !loadingLists) {
      void loadLists()
    }
  }, [])

  // Закрытие модалки при клике вне её
  const tierModalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!tierModal.isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!tierModalRef.current) return

      const target = e.target as HTMLElement

      // Проверяем, что клик был действительно вне модалки
      if (tierModalRef.current.contains(target)) {
        return // Клик внутри модалки - не закрываем
      }

      // Проверяем, что клик не на кнопке открытия модалки
      const button = target.closest('button')
      if (button) {
        const buttonText = button.textContent || ''
        if (buttonText.includes('Диапазон')) {
          return // Клик на кнопке открытия - не закрываем
        }
      }

      // Закрываем модалку только если клик действительно вне её
      setTierModal((prev) => ({ ...prev, isOpen: false, tierIdx: undefined }))
    }

    // Используем небольшую задержку, чтобы событие от кнопки открытия не закрывало модалку
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [tierModal.isOpen])

  // Отслеживание размера экрана для мобильной адаптации
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const openAddSize = useCallback(() => {
    setShowAddSize(true)
    if (paperTypes.length === 0 && printTechs.length === 0 && services.length === 0 && !loadingLists) {
      void loadLists()
    }
  }, [loadLists, loadingLists, paperTypes.length, printTechs.length, services.length])

  const commitAddSize = useCallback(() => {
    const w = Number(newSize.width_mm)
    const h = Number(newSize.height_mm)
    if (!newSize.label.trim() || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return
    }
    const size: SimplifiedSizeConfig = {
      id: uid(),
      label: newSize.label.trim(),
      width_mm: w,
      height_mm: h,
      default_print: undefined,
      print_prices: [],
      allowed_material_ids: [],
      material_prices: [],
      finishing: [],
    }
    const next = { ...value, sizes: [...value.sizes, size] }
    onChange(next)
    setSelectedSizeId(size.id)
    setShowAddSize(false)
    setNewSize({ label: '', width_mm: '', height_mm: '' })
  }, [newSize.height_mm, newSize.label, newSize.width_mm, onChange, value])

  const techName = useCallback((code: string) => printTechs.find(t => t.code === code)?.name || code, [printTechs])
  const svcName = useCallback((id: number) => services.find(s => Number(s.id) === Number(id))?.name || `#${id}`, [services])
  const materialName = useCallback((id: number) => allMaterials.find(m => Number(m.id) === Number(id))?.name || `#${id}`, [allMaterials])

  // Материалы выбранного типа бумаги
  const materialsForSelectedPaperType = useMemo(() => {
    if (!selectedPaperTypeId || !paperTypes.length) return []
    const paperType = paperTypes.find(pt => pt.id === selectedPaperTypeId)
    if (!paperType) return []
    
    // Получаем все material_id из плотностей этого типа бумаги
    const materialIds = new Set(
      paperType.densities?.map(d => d.material_id).filter(id => id && id > 0) || []
    )
    
    // Если есть материалы в allMaterials, используем их
    if (allMaterials && allMaterials.length > 0) {
      return allMaterials.filter(m => materialIds.has(Number(m.id)))
        .sort((a, b) => {
          // Сортируем по плотности, если она есть
          const aDensity = paperType.densities?.find(d => d.material_id === Number(a.id))?.value || 0
          const bDensity = paperType.densities?.find(d => d.material_id === Number(b.id))?.value || 0
          return aDensity - bDensity || String(a.name).localeCompare(String(b.name))
        })
    }
    
    // Если материалов нет в allMaterials, создаём на основе плотностей из типа бумаги
    return paperType.densities
      ?.filter(d => d.material_id && d.material_id > 0)
      .map(d => ({
        id: d.material_id,
        name: `${paperType.display_name || paperType.name} ${d.value} г/м²`,
        price: d.price || 0,
        unit: 'лист',
        quantity: d.available_quantity || 0,
        is_active: d.is_available ? 1 : 0,
        category_name: paperType.display_name || paperType.name,
      } as any as CalculatorMaterial))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))) || []
  }, [selectedPaperTypeId, paperTypes, allMaterials])

  return (
    <div className="simplified-template">
      <div className="simplified-template__header">
        <div>
          <h3>Упрощённый калькулятор</h3>
          <p className="text-muted text-sm">Настройка цен по размерам: печать (за изделие), материалы (за изделие) и отделка (за рез/биг/фальц).</p>
        </div>
        <div className="simplified-template__header-actions">
          <Button variant="secondary" onClick={openAddSize}>Добавить размер</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>Сохранить</Button>
        </div>
      </div>

      {value.sizes.length === 0 ? (
        <Alert type="info">Добавьте хотя бы один размер (обрезной формат), чтобы начать настройку.</Alert>
      ) : (
        <div className="simplified-template__grid">
          <div className="simplified-template__sizes">
            <div className="simplified-template__sizes-title">Обрезные форматы</div>
            {value.sizes.map(s => (
              <button
                key={s.id}
                type="button"
                className={`simplified-size ${selectedSizeId === s.id ? 'simplified-size--active' : ''}`}
                onClick={() => setSelectedSizeId(s.id)}
              >
                <div className="simplified-size__label">{s.label}</div>
                <div className="simplified-size__meta">{s.width_mm}×{s.height_mm}</div>
              </button>
            ))}
          </div>

          <div className="simplified-template__editor">
            {!selected ? (
              <Alert type="warning">Выберите размер слева.</Alert>
            ) : (
              <>
                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Размер</strong>
                      <div className="text-muted text-sm">Название и габариты (мм)</div>
                    </div>
                    <Button variant="error" size="sm" onClick={() => removeSize(selected.id)}>Удалить</Button>
                  </div>
                  <div className="simplified-card__content simplified-form-grid">
                    <FormField label="Название">
                      <input
                        className="form-input"
                        value={selected.label}
                        onChange={(e) => updateSize(selected.id, { label: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Ширина, мм">
                      <input
                        className="form-input form-input--compact"
                        value={String(selected.width_mm)}
                        onChange={(e) => updateSize(selected.id, { width_mm: Number(e.target.value) || 0 })}
                      />
                    </FormField>
                    <FormField label="Высота, мм">
                      <input
                        className="form-input form-input--compact"
                        value={String(selected.height_mm)}
                        onChange={(e) => updateSize(selected.id, { height_mm: Number(e.target.value) || 0 })}
                      />
                    </FormField>
                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Печать (цена за изделие)</strong>
                      <div className="text-muted text-sm">Выберите технологию печати, и система автоматически покажет все доступные вариации с диапазонами цен.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          // Открываем модалку для добавления диапазона к первой цене печати
                          setTierModal({
                            type: 'print',
                            printIdx: 0, // Первая цена печати
                            tierIdx: undefined,
                            isOpen: true,
                            minQty: '1',
                            maxQty: '',
                          })
                        }}
                      >
                        Добавить диапазон
                      </Button>
                    </div>
                    {tierModal.isOpen && tierModal.type === 'print' && tierModal.printIdx === 0 && (
                      <div
                        ref={tierModalRef}
                        className="simplified-tier-modal"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="simplified-tier-modal__content" onClick={(e) => e.stopPropagation()}>
                          <div className="simplified-tier-modal__header">
                            <strong>Добавить диапазон</strong>
                            <button
                              type="button"
                              className="simplified-tier-modal__close"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                setTierModal({ type: 'print', isOpen: false, minQty: '1', maxQty: '' })
                              }}
                              title="Закрыть"
                            >
                              ×
                            </button>
                          </div>
                          <div className="simplified-tier-modal__body">
                            <FormField label="От">
                              <input
                                className="form-input form-input--compact"
                                type="number"
                                min="1"
                                step="1"
                                value={tierModal.minQty}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTierModal({ ...tierModal, minQty: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.stopPropagation()}
                              />
                            </FormField>
                            <FormField label="До (оставьте пустым для ∞)">
                              <input
                                className="form-input form-input--compact"
                                type="number"
                                min="1"
                                step="1"
                                placeholder="∞"
                                value={tierModal.maxQty}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTierModal({ ...tierModal, maxQty: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.stopPropagation()}
                              />
                            </FormField>
                            <div className="simplified-tier-modal__actions" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e?.stopPropagation()
                                  setTierModal({ type: 'print', isOpen: false, minQty: '1', maxQty: '' })
                                }}
                              >
                                Отмена
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={(e) => {
                                  e?.stopPropagation()
                                  const minQty = Number(tierModal.minQty) || 1
                                  const maxQty = tierModal.maxQty === '' ? undefined : (Number(tierModal.maxQty) || undefined)
                                  const next = selected.print_prices.map((r, i) => {
                                    if (i === 0) {
                                      return { ...r, tiers: [...r.tiers, { min_qty: minQty, max_qty: maxQty, unit_price: 0 }] }
                                    }
                                    return r
                                  })
                                  updateSize(selected.id, { print_prices: next })
                                  setTierModal({ type: 'print', isOpen: false, minQty: '1', maxQty: '' })
                                }}
                              >
                                Добавить
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="simplified-card__content">
                    <div className="simplified-form-grid mb-3">
                      <FormField label="Технология печати">
                        <select
                          className="form-select form-select--compact"
                          value={selected.default_print?.technology_code || ''}
                          onChange={(e) => {
                            const techCode = e.target.value
                            if (!techCode) {
                              updateSize(selected.id, { default_print: undefined, print_prices: [] })
                              return
                            }

                            // Создаем все вариации для выбранной технологии
                            const variations = [
                              // Полноцветные
                              { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: defaultTiers() },
                              { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: defaultTiers() },
                              // Ч/б
                              { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'single' as const, tiers: defaultTiers() },
                              { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'duplex' as const, tiers: defaultTiers() },
                            ]

                            updateSize(selected.id, {
                              default_print: { technology_code: techCode },
                              print_prices: variations
                            })
                          }}
                          disabled={loadingLists}
                        >
                          <option value="">-- Выберите технологию --</option>
                          {printTechs.map(t => (
                            <option key={t.code} value={t.code}>{t.name}</option>
                          ))}
                        </select>
                      </FormField>
                    </div>

                    {selected.print_prices.length === 0 ? (
                      <div className="text-muted">Выберите технологию печати, чтобы увидеть доступные вариации.</div>
                    ) : (
                      <div className="simplified-print-variations">
                        {/* Полноцветные вариации */}
                        <div className="simplified-print-group">
                          <div className="simplified-print-group__title">Общий класс полноцвет</div>
                          <div className="simplified-print-group__items">
                            {selected.print_prices
                              .filter(p => p.color_mode === 'color')
                              .map((row, idx) => {
                                const actualIdx = selected.print_prices.findIndex(p =>
                                  p.technology_code === row.technology_code &&
                                  p.color_mode === row.color_mode &&
                                  p.sides_mode === row.sides_mode
                                )
                                return (
                                  <div key={`${row.color_mode}_${row.sides_mode}`} className="simplified-row">
                                    <div className="simplified-row__head">
                                      <div className="simplified-row__title">
                                        {row.sides_mode === 'single' ? 'односторонняя' : 'двухсторонняя'}
                                      </div>
                                    </div>

                                    {row.tiers.length > 0 && (
                                      <div className="simplified-tiers-table">
                                        <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                          <thead>
                                            <tr>
                                              <th>Параметры печати</th>
                                              {row.tiers.map((t, ti) => {
                                                const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : `${t.min_qty}-${t.max_qty}`
                                                return (
                                                  <th key={ti} className="simplified-table__range-cell">
                                                    {rangeLabel}
                                                    <Button
                                                      variant="error"
                                                      size="sm"
                                                      onClick={() => {
                                                        const next = selected.print_prices.map((r, i) => {
                                                          if (i !== actualIdx) return r
                                                          return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                                        })
                                                        updateSize(selected.id, { print_prices: next })
                                                      }}
                                                    >
                                                      Удалить
                                                    </Button>
                                                  </th>
                                                )
                                              })}
                                              <th></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td className="simplified-table__price-label">Цена за изделие</td>
                                              {row.tiers.map((t, ti) => (
                                                <td key={ti}>
                                                  <input
                                                    className="form-input form-input--compact-table"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={String(t.unit_price || 0)}
                                                    onChange={(e) => {
                                                      const v = Number(e.target.value) || 0
                                                      const next = selected.print_prices.map((r, i) => {
                                                        if (i !== actualIdx) return r
                                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, unit_price: v } : tt)) }
                                                      })
                                                      updateSize(selected.id, { print_prices: next })
                                                    }}
                                                  />
                                                </td>
                                              ))}
                                              <td></td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                        </div>

                        {/* Ч/б вариации */}
                        <div className="simplified-print-group">
                          <div className="simplified-print-group__title">Чёрно-белая печать</div>
                          <div className="simplified-print-group__items">
                            {selected.print_prices
                              .filter(p => p.color_mode === 'bw')
                              .map((row, idx) => {
                                const actualIdx = selected.print_prices.findIndex(p =>
                                  p.technology_code === row.technology_code &&
                                  p.color_mode === row.color_mode &&
                                  p.sides_mode === row.sides_mode
                                )
                                return (
                                  <div key={`${row.color_mode}_${row.sides_mode}`} className="simplified-row">
                                    <div className="simplified-row__head">
                                      <div className="simplified-row__title">
                                        {row.sides_mode === 'single' ? 'односторонняя' : 'двухсторонняя'}
                                      </div>
                                    </div>

                                    {row.tiers.length > 0 && (
                                      <div className="simplified-tiers-table">
                                        <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                          <thead>
                                            <tr>
                                              <th>Параметры печати</th>
                                              {row.tiers.map((t, ti) => {
                                                const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : `${t.min_qty}-${t.max_qty}`
                                                return (
                                                  <th key={ti} className="simplified-table__range-cell">
                                                    {rangeLabel}
                                                    <Button
                                                      variant="error"
                                                      size="sm"
                                                      onClick={() => {
                                                        const next = selected.print_prices.map((r, i) => {
                                                          if (i !== actualIdx) return r
                                                          return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                                        })
                                                        updateSize(selected.id, { print_prices: next })
                                                      }}
                                                    >
                                                      Удалить
                                                    </Button>
                                                  </th>
                                                )
                                              })}
                                              <th></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td className="simplified-table__price-label">Цена за изделие</td>
                                              {row.tiers.map((t, ti) => (
                                                <td key={ti}>
                                                  <input
                                                    className="form-input form-input--compact-table"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={String(t.unit_price || 0)}
                                                    onChange={(e) => {
                                                      const v = Number(e.target.value) || 0
                                                      const next = selected.print_prices.map((r, i) => {
                                                        if (i !== actualIdx) return r
                                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, unit_price: v } : tt)) }
                                                      })
                                                      updateSize(selected.id, { print_prices: next })
                                                    }}
                                                  />
                                                </td>
                                              ))}
                                              <td></td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Материалы (разрешённые)</strong>
                      <div className="text-muted text-sm">Выберите тип бумаги, затем конкретные материалы с чекбоксами. Для каждого можно задать цену "за изделие" по диапазонам.</div>
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
                      <div className="simplified-materials mt-3">
                        <div className="simplified-materials__group-title mb-2">Материалы ({materialsForSelectedPaperType.length})</div>
                        <div className="simplified-materials__list">
                          {materialsForSelectedPaperType.map(m => {
                            const hasPricing = selected.material_prices.some(mp => mp.material_id === Number(m.id))
                            const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                              ?.densities?.find(d => d.material_id === Number(m.id))

                            // Автоматически добавляем материал в allowed_material_ids и создаем pricing, если его нет
                            if (!selected.allowed_material_ids.includes(Number(m.id))) {
                              const nextAllowed = [...selected.allowed_material_ids, Number(m.id)]
                              const nextMaterialPrices = [...selected.material_prices, {
                                material_id: Number(m.id),
                                tiers: defaultTiers()
                              }]
                              updateSize(selected.id, {
                                allowed_material_ids: nextAllowed,
                                material_prices: nextMaterialPrices
                              })
                            }

                            return (
                              <div key={m.id} className="simplified-material-item">
                                <div className="simplified-material-item__header">
                                  <div className="simplified-material-item__title">
                                    {m.name}
                                    {densityInfo && <span className="text-muted text-sm"> ({densityInfo.value} г/м²)</span>}
                                  </div>
                                </div>

                                {selected.material_prices.find(mp => mp.material_id === Number(m.id)) && (
                                  <div className="simplified-material-item__pricing">
                                    <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                      <thead>
                                        <tr>
                                          <th>Цена за 1 ед.</th>
                                          {selected.material_prices.find(mp => mp.material_id === Number(m.id))!.tiers.map((t, ti) => {
                                            const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : `${t.min_qty}-${t.max_qty}`
                                            const actualIdx = selected.material_prices.findIndex(mp => mp.material_id === Number(m.id))
                                            return (
                                              <th key={ti} className="simplified-table__range-cell">
                                                {rangeLabel}
                                                <Button
                                                  variant="error"
                                                  size="sm"
                                                  onClick={() => {
                                                    const next = selected.material_prices.map((r, i) => {
                                                      if (i !== actualIdx) return r
                                                      return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                                    })
                                                    updateSize(selected.id, { material_prices: next })
                                                  }}
                                                >
                                                  Удалить
                                                </Button>
                                              </th>
                                            )
                                          })}
                                          <th></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr>
                                          <td className="simplified-table__price-label">Цена</td>
                                          {selected.material_prices.find(mp => mp.material_id === Number(m.id))!.tiers.map((t, ti) => {
                                            const actualIdx = selected.material_prices.findIndex(mp => mp.material_id === Number(m.id))
                                            return (
                                              <td key={ti}>
                                                <input
                                                  className="form-input form-input--compact-table"
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={String(t.unit_price || 0)}
                                                  onChange={(e) => {
                                                    const v = Number(e.target.value) || 0
                                                    const next = selected.material_prices.map((r, i) => {
                                                      if (i !== actualIdx) return r
                                                      return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, unit_price: v } : tt)) }
                                                    })
                                                    updateSize(selected.id, { material_prices: next })
                                                  }}
                                                />
                                              </td>
                                            )
                                          })}
                                          <td></td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {selectedPaperTypeId && materialsForSelectedPaperType.length === 0 && !loadingLists && (
                      <Alert type="info" className="mt-3">Нет материалов для выбранного типа бумаги.</Alert>
                    )}


                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Отделка (послепечатные услуги)</strong>
                      <div className="text-muted text-sm">Резка/биговка/фальцовка/ламинация. Цена задаётся "за рез/биг/фальц" или "за изделие".</div>
                    </div>
                  </div>
                  <div className="simplified-card__content">
                    {services.length === 0 ? (
                      <div className="text-muted">Загрузка услуг отделки...</div>
                    ) : (
                      <div className="simplified-finishing-list">
                        {services.map((service, idx) => {
                          const hasFinishing = selected.finishing.some(f => f.service_id === Number(service.id))

                          // Автоматически добавляем услугу, если её нет
                          if (!hasFinishing) {
                            const nextFinishing = [...selected.finishing, {
                              service_id: Number(service.id),
                              price_unit: 'per_cut' as const,
                              units_per_item: 1,
                              tiers: defaultTiers()
                            }]
                            updateSize(selected.id, { finishing: nextFinishing })
                          }

                          const finishing = selected.finishing.find(f => f.service_id === Number(service.id))
                          if (!finishing) return null

                          const actualIdx = selected.finishing.findIndex(f => f.service_id === Number(service.id))

                          return (
                            <div key={service.id} className="simplified-finishing-item">
                              <div className="simplified-finishing-item__header">
                                <div className="simplified-finishing-item__title">{service.name}</div>
                              </div>

                              <div className="simplified-finishing-item__controls">
                                <FormField label="Единица">
                                  <select
                                    className="form-select form-select--compact"
                                    value={finishing.price_unit}
                                    onChange={(e) => {
                                      const v = e.target.value as any
                                      const next = selected.finishing.map((r, i) => (i === actualIdx ? { ...r, price_unit: v } : r))
                                      updateSize(selected.id, { finishing: next })
                                    }}
                                  >
                                    <option value="per_cut">за рез/биг/фальц</option>
                                    <option value="per_item">за изделие</option>
                                  </select>
                                </FormField>
                                <FormField label="Ед. на изделие">
                                  <input
                                    className="form-input form-input--compact"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={String(finishing.units_per_item)}
                                    onChange={(e) => {
                                      const v = Number(e.target.value) || 0
                                      const next = selected.finishing.map((r, i) => (i === actualIdx ? { ...r, units_per_item: v } : r))
                                      updateSize(selected.id, { finishing: next })
                                    }}
                                  />
                                </FormField>
                              </div>

                              {finishing.tiers.length > 0 && (
                                <div className="simplified-finishing-item__pricing">
                                  <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                    <thead>
                                      <tr>
                                        <th>Цена за 1 ед.</th>
                                        {finishing.tiers.map((t, ti) => {
                                          const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : `${t.min_qty}-${t.max_qty}`
                                          return (
                                            <th key={ti} className="simplified-table__range-cell">
                                              {rangeLabel}
                                              <Button
                                                variant="error"
                                                size="sm"
                                                onClick={() => {
                                                  const next = selected.finishing.map((r, i) => {
                                                    if (i !== actualIdx) return r
                                                    return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                                  })
                                                  updateSize(selected.id, { finishing: next })
                                                }}
                                              >
                                                Удалить
                                              </Button>
                                            </th>
                                          )
                                        })}
                                        <th></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td className="simplified-table__price-label">Цена</td>
                                        {finishing.tiers.map((t, ti) => (
                                          <td key={ti}>
                                            <input
                                              className="form-input form-input--compact-table"
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={String(t.unit_price || 0)}
                                              onChange={(e) => {
                                                const v = Number(e.target.value) || 0
                                                const next = selected.finishing.map((r, i) => {
                                                  if (i !== actualIdx) return r
                                                  return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, unit_price: v } : tt)) }
                                                })
                                                updateSize(selected.id, { finishing: next })
                                              }}
                                            />
                                          </td>
                                        ))}
                                        <td></td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={showAddSize} onClose={() => setShowAddSize(false)} title="Добавить размер" size="md">
        <div className="simplified-add-size">
          <FormField label="Название" required>
            <input className="form-input" value={newSize.label} onChange={(e) => setNewSize({ ...newSize, label: e.target.value })} placeholder="Например: A4" />
          </FormField>
          <div className="simplified-form-grid">
            <FormField label="Ширина, мм" required>
              <input className="form-input form-input--compact" value={newSize.width_mm} onChange={(e) => setNewSize({ ...newSize, width_mm: e.target.value })} placeholder="210" />
            </FormField>
            <FormField label="Высота, мм" required>
              <input className="form-input form-input--compact" value={newSize.height_mm} onChange={(e) => setNewSize({ ...newSize, height_mm: e.target.value })} placeholder="297" />
            </FormField>
          </div>
          <div className="simplified-add-size__actions">
            <Button variant="secondary" onClick={() => setShowAddSize(false)}>Отмена</Button>
            <Button variant="primary" onClick={commitAddSize} disabled={!newSize.label.trim()}>Добавить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


