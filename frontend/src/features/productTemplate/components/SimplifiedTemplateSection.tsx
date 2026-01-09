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

// По умолчанию: один диапазон от 1 до бесконечности
const defaultTiers = () => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 }
]

// Утилитарные функции для работы с диапазонами
type Tier = { min_qty: number; max_qty?: number; unit_price: number }

// Добавление нового диапазона: разбивает существующий диапазон на два
const addRangeBoundary = (tiers: Tier[], newBoundary: number): Tier[] => {
  if (tiers.length === 0) {
    return [{ min_qty: 1, max_qty: newBoundary - 1, unit_price: 0 }, { min_qty: newBoundary, max_qty: undefined, unit_price: 0 }]
  }

  // Проверяем, что граница не совпадает с существующими min_qty
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  const existingBoundary = sortedTiers.find(t => t.min_qty === newBoundary)
  if (existingBoundary) {
    // Если граница уже существует, возвращаем исходный список
    return sortedTiers
  }

  // Найти диапазон, в который попадает новая граница
  // max_qty - это последнее включенное значение, поэтому проверяем <= max_qty + 1
  const targetIndex = sortedTiers.findIndex(t => {
    const max = t.max_qty !== undefined ? t.max_qty + 1 : Infinity
    return newBoundary >= t.min_qty && newBoundary < max
  })

  if (targetIndex === -1) {
    // Если граница больше всех существующих, добавляем в конец
    const lastTier = sortedTiers[sortedTiers.length - 1]
    if (lastTier.max_qty === undefined) {
      // Последний диапазон бесконечный - разбиваем его
      // Устанавливаем max_qty = newBoundary - 1, чтобы после normalizeTiers получилось правильно
      const newTiers = [...sortedTiers]
      newTiers[newTiers.length - 1] = { ...lastTier, max_qty: newBoundary - 1 }
      newTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
      return normalizeTiers(newTiers)
    }
    // Если последний диапазон не бесконечный, добавляем новый после него
    sortedTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
    return normalizeTiers(sortedTiers)
  }

  // Разбиваем найденный диапазон
  const targetTier = sortedTiers[targetIndex]
  
  // Если граница совпадает с началом диапазона, не добавляем
  if (newBoundary === targetTier.min_qty) {
    return sortedTiers
  }
  
  const newTiers = [...sortedTiers]
  
  // Заменяем найденный диапазон на два
  // Устанавливаем max_qty = newBoundary - 1 для первого диапазона
  newTiers[targetIndex] = { ...targetTier, max_qty: newBoundary - 1 }
  newTiers.splice(targetIndex + 1, 0, { min_qty: newBoundary, max_qty: targetTier.max_qty, unit_price: 0 })
  
  return normalizeTiers(newTiers)
}

// Редактирование границы диапазона
const editRangeBoundary = (tiers: Tier[], tierIndex: number, newBoundary: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers

  // Проверяем, что новая граница не совпадает с другим min_qty
  const existingBoundary = sortedTiers.find((t, i) => i !== tierIndex && t.min_qty === newBoundary)
  if (existingBoundary) {
    // Если граница уже существует в другом диапазоне, возвращаем исходный список
    return sortedTiers
  }

  const editedTier = sortedTiers[tierIndex]
  const newTiers = [...sortedTiers]

  // Изменяем min_qty выбранного диапазона
  newTiers[tierIndex] = { ...editedTier, min_qty: newBoundary }

  // Обновляем max_qty предыдущего диапазона
  // max_qty должен быть на 1 меньше нового min_qty
  if (tierIndex > 0) {
    newTiers[tierIndex - 1] = { ...newTiers[tierIndex - 1], max_qty: newBoundary - 1 }
  }

  return normalizeTiers(newTiers)
}

// Удаление диапазона
const removeRange = (tiers: Tier[], tierIndex: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers

  // Не позволяем удалить последний диапазон
  if (sortedTiers.length <= 1) {
    return sortedTiers
  }

  const newTiers = [...sortedTiers]
  const removedTier = newTiers[tierIndex]

  // Если удаляем не последний диапазон, объединяем с предыдущим
  if (tierIndex > 0) {
    const prevTier = newTiers[tierIndex - 1]
    newTiers[tierIndex - 1] = { ...prevTier, max_qty: removedTier.max_qty }
  } else if (tierIndex < newTiers.length - 1) {
    // Если удаляем первый диапазон, следующий становится первым
    const nextTier = newTiers[tierIndex + 1]
    newTiers[tierIndex + 1] = { ...nextTier, min_qty: 1 }
  }

  newTiers.splice(tierIndex, 1)
  return normalizeTiers(newTiers)
}

// Нормализация диапазонов: сортировка и обновление max_qty
const normalizeTiers = (tiers: Tier[]): Tier[] => {
  if (tiers.length === 0) return defaultTiers()

  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  
  // Обновляем max_qty для всех диапазонов (кроме последнего)
  // max_qty должен быть на 1 меньше следующего min_qty
  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i] = { ...sorted[i], max_qty: sorted[i + 1].min_qty - 1 }
  }
  
  // Последний диапазон всегда бесконечный
  if (sorted.length > 0) {
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max_qty: undefined }
  }

  return sorted
}

type TierRangeModalState = {
  type: 'add' | 'edit'
  tierIndex?: number // индекс диапазона для редактирования (индекс в отсортированном списке)
  isOpen: boolean
  boundary: string // граница диапазона (для добавления - новая граница, для редактирования - min_qty)
  anchorElement?: HTMLElement // элемент, рядом с которым показывать модалку
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
    type: 'add',
    isOpen: false,
    boundary: '',
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
  const addRangeButtonRef = useRef<HTMLButtonElement>(null)
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

  // Получить общие диапазоны для размера (из первой вариации печати, материалов или отделки)
  const getSizeRanges = useCallback((size: SimplifiedSizeConfig): Tier[] => {
    if (size.print_prices.length > 0 && size.print_prices[0].tiers.length > 0) {
      return normalizeTiers(size.print_prices[0].tiers)
    }
    if (size.material_prices.length > 0 && size.material_prices[0].tiers.length > 0) {
      return normalizeTiers(size.material_prices[0].tiers)
    }
    if (size.finishing.length > 0 && size.finishing[0].tiers.length > 0) {
      return normalizeTiers(size.finishing[0].tiers)
    }
    return defaultTiers()
  }, [])

  // Обновить диапазоны во всех связанных данных размера
  const updateSizeRanges = useCallback((sizeId: string, newRanges: Tier[]) => {
    const size = value.sizes.find(s => s.id === sizeId)
    if (!size) return

    // Обновляем диапазоны в печати
    const updatedPrintPrices = size.print_prices.map(pp => {
      // Сохраняем цены для существующих диапазонов, добавляем нулевые для новых
      const priceMap = new Map(pp.tiers.map(t => [t.min_qty, t.unit_price]))
      const newTiers = newRanges.map(r => ({
        ...r,
        unit_price: priceMap.get(r.min_qty) ?? 0
      }))
      return { ...pp, tiers: newTiers }
    })

    // Обновляем диапазоны в материалах
    const updatedMaterialPrices = size.material_prices.map(mp => {
      const priceMap = new Map(mp.tiers.map(t => [t.min_qty, t.unit_price]))
      const newTiers = newRanges.map(r => ({
        ...r,
        unit_price: priceMap.get(r.min_qty) ?? 0
      }))
      return { ...mp, tiers: newTiers }
    })

    // Обновляем диапазоны в отделке
    const updatedFinishing = size.finishing.map(f => {
      const priceMap = new Map(f.tiers.map(t => [t.min_qty, t.unit_price]))
      const newTiers = newRanges.map(r => ({
        ...r,
        unit_price: priceMap.get(r.min_qty) ?? 0
      }))
      return { ...f, tiers: newTiers }
    })

    updateSize(sizeId, {
      print_prices: updatedPrintPrices,
      material_prices: updatedMaterialPrices,
      finishing: updatedFinishing
    })
  }, [value.sizes, updateSize])

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

  // Автоматическое добавление материалов при выборе типа бумаги
  useEffect(() => {
    if (!selected || !selectedPaperTypeId || materialsForSelectedPaperType.length === 0) return

    const materialsToAdd = materialsForSelectedPaperType.filter(m => 
      !selected.allowed_material_ids.includes(Number(m.id))
    )
    
    if (materialsToAdd.length > 0) {
      const nextAllowed = [...selected.allowed_material_ids, ...materialsToAdd.map(m => Number(m.id))]
      const commonRanges = getSizeRanges(selected)
      const nextMaterialPrices = [
        ...selected.material_prices,
        ...materialsToAdd.map(m => ({
          material_id: Number(m.id),
          tiers: commonRanges.map(r => ({ ...r, unit_price: 0 }))
        }))
      ]
      updateSize(selected.id, {
        allowed_material_ids: nextAllowed,
        material_prices: nextMaterialPrices
      })
    }
  }, [selectedPaperTypeId, materialsForSelectedPaperType, selected, getSizeRanges, updateSize])

  // Автоматическое добавление услуг отделки
  useEffect(() => {
    if (!selected || services.length === 0) return

    const servicesToAdd = services.filter(s => 
      !selected.finishing.some(f => f.service_id === Number(s.id))
    )
    
    if (servicesToAdd.length > 0) {
      const commonRanges = getSizeRanges(selected)
      const nextFinishing = [
        ...selected.finishing,
        ...servicesToAdd.map(s => ({
          service_id: Number(s.id),
          price_unit: 'per_cut' as const,
          units_per_item: 1,
          tiers: commonRanges.map(r => ({ ...r, unit_price: 0 }))
        }))
      ]
      updateSize(selected.id, { finishing: nextFinishing })
    }
  }, [services, selected, getSizeRanges, updateSize])

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
                            // Используем общие диапазоны, если они уже есть, иначе создаем дефолтные
                            const existingRanges = getSizeRanges(selected)
                            const variations = [
                              // Полноцветные
                              { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                              { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                              // Ч/б
                              { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                              { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
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
                    ) : (() => {
                      const commonRanges = getSizeRanges(selected)
                      const colorRows = selected.print_prices.filter(p => p.color_mode === 'color')
                      const bwRows = selected.print_prices.filter(p => p.color_mode === 'bw')
                      
                      return (
                              <div className="simplified-tiers-table">
                                <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                  <thead>
                                    <tr>
                                <th>Параметры печати (цена за изделие указанного формата и цветности)</th>
                                {commonRanges.map((t, ti) => {
                                  const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : String(t.min_qty)
                                        return (
                                          <th key={ti} className="simplified-table__range-cell">
                                      <div className="cell">
                                        <span
                                          style={{ cursor: 'pointer' }}
                                              onClick={() => {
                                            setTierModal({
                                              type: 'edit',
                                              tierIndex: ti,
                                              isOpen: true,
                                              boundary: String(t.min_qty),
                                              anchorElement: undefined
                                            })
                                          }}
                                        >
                                          {rangeLabel}
                                        </span>
                                        <span>
                                          <button
                                            type="button"
                                            className="el-button remove-range el-button--text el-button--mini"
                                            style={{ color: 'red', marginRight: '-15px' }}
                                            onClick={() => {
                                              const newRanges = removeRange(commonRanges, ti)
                                              updateSizeRanges(selected.id, newRanges)
                                            }}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      </div>
                                          </th>
                                        )
                                      })}
                                <th>
                                  <div className="cell">Ед.изм.</div>
                                </th>
                                <th>
                                  <div className="cell">Вес за ед</div>
                                </th>
                                <th>
                                  <div className="cell">
                                    <div className="simplified-row__add-range-wrapper">
                                      <button
                                        ref={addRangeButtonRef}
                                        type="button"
                                        className="el-button el-button--info el-button--mini is-plain"
                                        style={{ width: '100%', marginLeft: '0px' }}
                                        onClick={(e) => {
                                          const button = e.currentTarget as HTMLElement
                                          setTierModal({
                                            type: 'add',
                                            isOpen: true,
                                            boundary: '',
                                            anchorElement: button
                                          })
                                        }}
                                      >
                                        + Диапазон
                                      </button>
                                    </div>
                                  </div>
                                </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                              {/* Полноцветная - родительская строка */}
                              {colorRows.length > 0 && (
                                <>
                                  <tr className="simplified-table__parent-row">
                                    <td className="simplified-table__parent-cell">
                                      <div className="el-select el-select--small" style={{ width: '100%' }}>
                                        <div className="el-input el-input--small el-input--suffix">
                                          <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value="полноцветная"
                                            style={{ cursor: 'default', backgroundColor: '#f5f7fa' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    {commonRanges.map(() => (
                                      <td key={Math.random()} style={{ backgroundColor: '#f5f7fa' }}></td>
                                    ))}
                                    <td style={{ backgroundColor: '#f5f7fa' }}></td>
                                    <td style={{ backgroundColor: '#f5f7fa' }}></td>
                                    <td style={{ backgroundColor: '#f5f7fa' }}></td>
                                  </tr>
                                  
                                  {/* Односторонняя полноцветная */}
                                  {colorRows.find(r => r.sides_mode === 'single') && (() => {
                                    const row = colorRows.find(r => r.sides_mode === 'single')!
                                    const actualIdx = selected.print_prices.findIndex(p =>
                                      p.technology_code === row.technology_code &&
                                      p.color_mode === row.color_mode &&
                                      p.sides_mode === row.sides_mode
                                    )
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div className="el-select el-select--small" style={{ width: '100%' }}>
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="односторонняя"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                                            </div>
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                        <td key={ti}>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                                value={String(priceTier.unit_price || 0)}
                                            onChange={(e) => {
                                              const v = Number(e.target.value) || 0
                                              const next = selected.print_prices.map((r, i) => {
                                                    if (i !== actualIdx) return r
                                                    const updatedTiers = commonRanges.map((rt, rti) => {
                                                      if (rti === ti) return { ...rt, unit_price: v }
                                                      const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                      return existingTier || rt
                                                    })
                                                    return { ...r, tiers: updatedTiers }
                                              })
                                              updateSize(selected.id, { print_prices: next })
                                            }}
                                          />
                                        </td>
                                          )
                                        })}
                                        <td>
                                          <div className="el-select el-select--small">
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="BLR"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                                            </div>
                                          </div>
                                        </td>
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="text"
                                            placeholder=""
                                          />
                                        </td>
                                      <td></td>
                                    </tr>
                                    )
                                  })()}
                                  
                                  {/* Двухсторонняя полноцветная */}
                                  {colorRows.find(r => r.sides_mode === 'duplex') && (() => {
                                    const row = colorRows.find(r => r.sides_mode === 'duplex')!
                                    const actualIdx = selected.print_prices.findIndex(p =>
                                      p.technology_code === row.technology_code &&
                                      p.color_mode === row.color_mode &&
                                      p.sides_mode === row.sides_mode
                                    )
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div className="el-select el-select--small" style={{ width: '100%' }}>
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="двухсторонняя"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                              </div>
                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <input
                                                className="form-input form-input--compact-table"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={String(priceTier.unit_price || 0)}
                                                onChange={(e) => {
                                                  const v = Number(e.target.value) || 0
                                                  const next = selected.print_prices.map((r, i) => {
                                                    if (i !== actualIdx) return r
                                                    const updatedTiers = commonRanges.map((rt, rti) => {
                                                      if (rti === ti) return { ...rt, unit_price: v }
                                                      const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                      return existingTier || rt
                                                    })
                                                    return { ...r, tiers: updatedTiers }
                                                  })
                                                  updateSize(selected.id, { print_prices: next })
                                                }}
                                              />
                                            </td>
                                          )
                                        })}
                                        <td>
                                          <div className="el-select el-select--small">
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="BLR"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                      </div>
                                          </div>
                                        </td>
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="text"
                                            placeholder=""
                                          />
                                        </td>
                                        <td></td>
                                      </tr>
                                    )
                                  })()}
                                </>
                              )}

                              {/* Черно-белая - родительская строка */}
                              {bwRows.length > 0 && (
                                <>
                                  <tr className="simplified-table__parent-row">
                                    <td className="simplified-table__parent-cell">
                                      <div className="el-select el-select--small" style={{ width: '100%' }}>
                                        <div className="el-input el-input--small el-input--suffix">
                                          <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value="черно-белая"
                                            style={{ cursor: 'default', backgroundColor: '#f5f7fa' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                  </div>
                </div>
                                    </td>
                                    {commonRanges.map(() => (
                                      <td key={Math.random()} style={{ backgroundColor: '#f5f7fa' }}></td>
                                    ))}
                                    <td style={{ backgroundColor: '#f5f7fa' }}></td>
                                    <td style={{ backgroundColor: '#f5f7fa' }}></td>
                                  </tr>
                                  
                                  {/* Односторонняя ч/б */}
                                  {bwRows.find(r => r.sides_mode === 'single') && (() => {
                                    const row = bwRows.find(r => r.sides_mode === 'single')!
                                    const actualIdx = selected.print_prices.findIndex(p =>
                                      p.technology_code === row.technology_code &&
                                      p.color_mode === row.color_mode &&
                                      p.sides_mode === row.sides_mode
                                    )
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div className="el-select el-select--small" style={{ width: '100%' }}>
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="односторонняя"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                    </div>
                  </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <input
                                                className="form-input form-input--compact-table"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={String(priceTier.unit_price || 0)}
                                                onChange={(e) => {
                                                  const v = Number(e.target.value) || 0
                                                  const next = selected.print_prices.map((r, i) => {
                                                    if (i !== actualIdx) return r
                                                    const updatedTiers = commonRanges.map((rt, rti) => {
                                                      if (rti === ti) return { ...rt, unit_price: v }
                                                      const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                      return existingTier || rt
                                                    })
                                                    return { ...r, tiers: updatedTiers }
                                                  })
                                                  updateSize(selected.id, { print_prices: next })
                                                }}
                                              />
                                            </td>
                                          )
                                        })}
                                        <td>
                                          <div className="el-select el-select--small">
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="BLR"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                    </div>
                                          </div>
                                        </td>
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="text"
                                            placeholder=""
                                          />
                                        </td>
                                        <td></td>
                                      </tr>
                                    )
                                  })()}
                                  
                                  {/* Двухсторонняя ч/б */}
                                  {bwRows.find(r => r.sides_mode === 'duplex') && (() => {
                                    const row = bwRows.find(r => r.sides_mode === 'duplex')!
                                    const actualIdx = selected.print_prices.findIndex(p =>
                                      p.technology_code === row.technology_code &&
                                      p.color_mode === row.color_mode &&
                                      p.sides_mode === row.sides_mode
                                    )
                            return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div className="el-select el-select--small" style={{ width: '100%' }}>
                                            <div className="el-input el-input--small el-input--suffix">
                                <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="двухсторонняя"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                </span>
                                              </span>
                                            </div>
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <input
                                                className="form-input form-input--compact-table"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={String(priceTier.unit_price || 0)}
                                                onChange={(e) => {
                                                  const v = Number(e.target.value) || 0
                                                  const next = selected.print_prices.map((r, i) => {
                                                    if (i !== actualIdx) return r
                                                    const updatedTiers = commonRanges.map((rt, rti) => {
                                                      if (rti === ti) return { ...rt, unit_price: v }
                                                      const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                      return existingTier || rt
                                                    })
                                                    return { ...r, tiers: updatedTiers }
                                                  })
                                                  updateSize(selected.id, { print_prices: next })
                                                }}
                                              />
                                            </td>
                                          )
                                        })}
                                        <td>
                                          <div className="el-select el-select--small">
                                            <div className="el-input el-input--small el-input--suffix">
                                              <input
                                                type="text"
                                                readOnly
                                                className="el-input__inner"
                                                value="BLR"
                                                style={{ cursor: 'default' }}
                                              />
                                              <span className="el-input__suffix">
                                                <span className="el-input__suffix-inner">
                                                  <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                                </span>
                                              </span>
                        </div>
                      </div>
                                        </td>
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="text"
                                            placeholder=""
                                          />
                                        </td>
                                        <td></td>
                                      </tr>
                                    )
                                  })()}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                    
                    {/* Модалка для добавления/редактирования диапазонов */}
                    {tierModal.isOpen && selected && (
                                    <div
                                      ref={tierModalRef}
                                      className="simplified-tier-modal"
                          style={tierModal.anchorElement ? {
                            position: 'absolute',
                            top: `${tierModal.anchorElement.getBoundingClientRect().bottom + 5}px`,
                            left: `${tierModal.anchorElement.getBoundingClientRect().left}px`,
                            zIndex: 2003
                          } : {
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 2003
                          }}
                                      onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                                    >
                        <div className="simplified-tier-modal__content" onClick={(e) => e.stopPropagation()}>
                                        <div className="simplified-tier-modal__header">
                            <strong>{tierModal.type === 'add' ? 'Добавить диапазон' : 'Редактировать диапазон'}</strong>
                                          <button
                                            type="button"
                                            className="simplified-tier-modal__close"
                              onClick={(e: React.MouseEvent) => {
                                              e.stopPropagation()
                                setTierModal({ type: 'add', isOpen: false, boundary: '' })
                                            }}
                              title="Закрыть"
                                          >
                              ×
                                          </button>
                                        </div>
                                        <div className="simplified-tier-modal__body">
                            <FormField label="Граница диапазона">
                                            <input
                                              className="form-input form-input--compact"
                                              type="number"
                                              min="1"
                                              step="1"
                                placeholder="Граница диапазона"
                                value={tierModal.boundary}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTierModal({ ...tierModal, boundary: e.target.value })}
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
                                  setTierModal({ type: 'add', isOpen: false, boundary: '' })
                                }}
                                            >
                                Отменить
                                            </Button>
                                            <Button
                                              variant="primary"
                                              size="sm"
                                onClick={(e) => {
                                  e?.stopPropagation()
                                  const boundary = Number(tierModal.boundary)
                                  if (!boundary || boundary < 1) return

                                  const currentRanges = getSizeRanges(selected)
                                  let newRanges: Tier[]
                                  
                                  if (tierModal.type === 'add') {
                                    newRanges = addRangeBoundary(currentRanges, boundary)
                                  } else if (tierModal.tierIndex !== undefined) {
                                    newRanges = editRangeBoundary(currentRanges, tierModal.tierIndex, boundary)
                                                  } else {
                                    return
                                  }

                                  updateSizeRanges(selected.id, newRanges)
                                  setTierModal({ type: 'add', isOpen: false, boundary: '' })
                                }}
                              >
                                {tierModal.type === 'add' ? 'Добавить' : 'Сохранить'}
                                            </Button>
                                          </div>
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

                    {selectedPaperTypeId && materialsForSelectedPaperType.length > 0 && (() => {
                      const commonRanges = getSizeRanges(selected)
                      
                      return (
                        <div className="simplified-tiers-table mt-3">
                                <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                                  <thead>
                                    <tr>
                                <th>Параметры материалов (цена за изделие указанного формата)</th>
                                {commonRanges.map((t, ti) => {
                                  const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : String(t.min_qty)
                                        return (
                                          <th key={ti} className="simplified-table__range-cell">
                                      <div className="cell">
                                        <span
                                          style={{ cursor: 'pointer' }}
                                                onClick={() => {
                                                  setTierModal({
                                              type: 'edit',
                                              tierIndex: ti,
                                                    isOpen: true,
                                              boundary: String(t.min_qty),
                                              anchorElement: undefined
                                                  })
                                                }}
                                              >
                                          {rangeLabel}
                                        </span>
                                        <span>
                                          <button
                                            type="button"
                                            className="el-button remove-range el-button--text el-button--mini"
                                            style={{ color: 'red', marginRight: '-15px' }}
                                                onClick={() => {
                                              const newRanges = removeRange(commonRanges, ti)
                                              updateSizeRanges(selected.id, newRanges)
                                            }}
                                          >
                                            ×
                                          </button>
                                        </span>
                                            </div>
                                          </th>
                                        )
                                      })}
                                <th>
                                  <div className="cell">Ед.изм.</div>
                                </th>
                                <th>
                                  <div className="cell">Вес за ед</div>
                                </th>
                                <th>
                                  <div className="cell">
                                    <div className="simplified-row__add-range-wrapper">
                                      <button
                                        type="button"
                                        className="el-button el-button--info el-button--mini is-plain"
                                        style={{ width: '100%', marginLeft: '0px' }}
                                        onClick={(e) => {
                                          const button = e.currentTarget as HTMLElement
                                          setTierModal({
                                            type: 'add',
                                            isOpen: true,
                                            boundary: '',
                                            anchorElement: button
                                          })
                                        }}
                                      >
                                        + Диапазон
                                      </button>
                                    </div>
                                  </div>
                                </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                              {materialsForSelectedPaperType.map(m => {
                                const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                                  ?.densities?.find(d => d.material_id === Number(m.id))
                                const materialPrice = selected.material_prices.find(mp => mp.material_id === Number(m.id))
                                const actualIdx = selected.material_prices.findIndex(mp => mp.material_id === Number(m.id))
                                
                                return (
                                  <tr key={m.id}>
                                    <td>
                                      <div className="el-select el-select--small" style={{ width: '100%' }}>
                                        <div className="el-input el-input--small el-input--suffix">
                                          <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value={`${m.name}${densityInfo ? ` (${densityInfo.value} г/м²)` : ''}`}
                                            style={{ cursor: 'default' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    {commonRanges.map((t, ti) => {
                                      const priceTier = materialPrice?.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                      return (
                                        <td key={ti}>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={String(priceTier.unit_price || 0)}
                                            onChange={(e) => {
                                              const v = Number(e.target.value) || 0
                                              if (actualIdx === -1) {
                                                // Создаем новую запись для материала
                                                const newMaterialPrice = {
                                                  material_id: Number(m.id),
                                                  tiers: commonRanges.map((rt, rti) => {
                                                    if (rti === ti) return { ...rt, unit_price: v }
                                                    return { ...rt, unit_price: 0 }
                                                  })
                                                }
                                                updateSize(selected.id, {
                                                  material_prices: [...selected.material_prices, newMaterialPrice]
                                                })
                                              } else {
                                              const next = selected.material_prices.map((r, i) => {
                                                  if (i !== actualIdx) return r
                                                  const updatedTiers = commonRanges.map((rt, rti) => {
                                                    if (rti === ti) return { ...rt, unit_price: v }
                                                    const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                    return existingTier || rt
                                                  })
                                                  return { ...r, tiers: updatedTiers }
                                              })
                                              updateSize(selected.id, { material_prices: next })
                                              }
                                            }}
                                          />
                                        </td>
                                      )
                                    })}
                                    <td>
                                      <div className="el-select el-select--small">
                                        <div className="el-input el-input--small el-input--suffix">
                                          <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value="BLR"
                                            style={{ cursor: 'default' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      <input
                                        className="form-input form-input--compact-table"
                                        type="text"
                                        placeholder=""
                                      />
                                    </td>
                                      <td></td>
                                    </tr>
                                )
                              })}
                                  </tbody>
                                </table>
                              </div>
                      )
                    })()}

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
                    ) : (() => {
                      const commonRanges = getSizeRanges(selected)
                      
                      return (
                        <div className="simplified-tiers-table">
                          <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
                            <thead>
                              <tr>
                                <th>Параметры отделки (цена за рез/биг/фальц или за изделие)</th>
                                {commonRanges.map((t, ti) => {
                                  const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : String(t.min_qty)
                                  return (
                                    <th key={ti} className="simplified-table__range-cell">
                                      <div className="cell">
                                        <span
                                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setTierModal({
                                              type: 'edit',
                                              tierIndex: ti,
                              isOpen: true,
                                              boundary: String(t.min_qty),
                                              anchorElement: undefined
                            })
                          }}
                        >
                                          {rangeLabel}
                                        </span>
                                        <span>
                                          <button
                                            type="button"
                                            className="el-button remove-range el-button--text el-button--mini"
                                            style={{ color: 'red', marginRight: '-15px' }}
                        onClick={() => {
                                              const newRanges = removeRange(commonRanges, ti)
                                              updateSizeRanges(selected.id, newRanges)
                                            }}
                                          >
                                            ×
                                          </button>
                                        </span>
                    </div>
                                    </th>
                                  )
                                })}
                                <th>
                                  <div className="cell">Ед.изм.</div>
                                </th>
                                <th>
                                  <div className="cell">Вес за ед</div>
                                </th>
                                <th>
                                  <div className="cell">
                                    <div className="simplified-row__add-range-wrapper">
                          <button
                            type="button"
                                        className="el-button el-button--info el-button--mini is-plain"
                                        style={{ width: '100%', marginLeft: '0px' }}
                            onClick={(e) => {
                                          const button = e.currentTarget as HTMLElement
                                          setTierModal({
                                            type: 'add',
                                            isOpen: true,
                                            boundary: '',
                                            anchorElement: button
                                          })
                                        }}
                                      >
                                        + Диапазон
                          </button>
                        </div>
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {services.map(service => {
                                const finishing = selected.finishing.find(f => f.service_id === Number(service.id))
                                const actualIdx = selected.finishing.findIndex(f => f.service_id === Number(service.id))
                                
                                if (!finishing) return null
                                
                                return (
                                  <tr key={service.id}>
                                    <td>
                                      <div className="el-select el-select--small" style={{ width: '100%' }}>
                                        <div className="el-input el-input--small el-input--suffix">
                            <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value={service.name}
                                            style={{ cursor: 'default' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                          </div>
                        </div>
                                    </td>
                                    {commonRanges.map((t, ti) => {
                                      const priceTier = finishing.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                      return (
                                        <td key={ti}>
                                <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={String(priceTier.unit_price || 0)}
                                  onChange={(e) => {
                                    const v = Number(e.target.value) || 0
                                                const next = selected.finishing.map((r, i) => {
                                                if (i !== actualIdx) return r
                                                const updatedTiers = commonRanges.map((rt, rti) => {
                                                  if (rti === ti) return { ...rt, unit_price: v }
                                                  const existingTier = r.tiers.find(t => t.min_qty === rt.min_qty)
                                                  return existingTier || rt
                                                })
                                                return { ...r, tiers: updatedTiers }
                                                })
                                                updateSize(selected.id, { finishing: next })
                                              }}
                                          />
                                        </td>
                                      )
                                    })}
                                    <td>
                                      <div className="el-select el-select--small">
                                        <div className="el-input el-input--small el-input--suffix">
                                          <input
                                            type="text"
                                            readOnly
                                            className="el-input__inner"
                                            value={finishing.price_unit === 'per_cut' ? 'за рез/биг/фальц' : 'за изделие'}
                                            style={{ cursor: 'default' }}
                                          />
                                          <span className="el-input__suffix">
                                            <span className="el-input__suffix-inner">
                                              <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                        step="1"
                                        value={String(finishing.units_per_item || 1)}
                                            onChange={(e) => {
                                          const v = Number(e.target.value) || 1
                                              const next = selected.finishing.map((r, i) => {
                                            if (i !== actualIdx) return r
                                            return { ...r, units_per_item: v }
                                              })
                                              updateSize(selected.id, { finishing: next })
                                            }}
                                          />
                                        </td>
                                      <td></td>
                                    </tr>
                                )
                              })}
                                  </tbody>
                                </table>
                              </div>
                      )
                    })()}
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


