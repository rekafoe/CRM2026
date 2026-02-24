import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Button, FormField, Alert, Modal } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig, SimplifiedTypeConfig, ProductTypeId } from '../hooks/useProductTemplate'
import { useSimplifiedTypes } from '../hooks/useSimplifiedTypes'
import { ServicePricingTable, type ServiceItem, type ServicePricing } from './ServicePricingTable'
import { ProductTypesCard } from './ProductTypesCard'
import './SimplifiedTemplateSection.css'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean; supports_duplex?: number | boolean }
type PaperTypeRow = PaperTypeForCalculator
type ServiceRow = { 
  id: number; 
  name?: string; 
  service_name?: string;
  operationType?: string; 
  operation_type?: string; 
  type?: string;
  service_type?: string;
  priceUnit?: string; 
  price_unit?: string 
}

interface Props {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  onSave: () => void
  saving: boolean
  allMaterials: CalculatorMaterial[]
  showPagesConfig?: boolean
}

const uid = () => `sz_${Date.now()}_${Math.random().toString(16).slice(2)}`

const cloneSizeWithNewId = (size: SimplifiedSizeConfig): SimplifiedSizeConfig => ({
  ...size,
  id: uid(),
  print_prices: (size.print_prices || []).map((pp) => ({
    ...pp,
    tiers: (pp.tiers || []).map((t) => ({ ...t })),
  })),
  allowed_material_ids: [...(size.allowed_material_ids || [])],
  material_prices: (size.material_prices || []).map((mp) => ({
    ...mp,
    tiers: (mp.tiers || []).map((t) => ({ ...t })),
  })),
  finishing: (size.finishing || []).map((f) => ({ ...f })),
})

/** Поле цены за диапазон: при вводе хранит строку, чтобы можно было набрать 3.05 (ноль не пропадает); число записывается по blur */
const PriceCell: React.FC<{
  value: number
  onChange: (v: number) => void
  className?: string
}> = ({ value, onChange, className }) => {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? inputValue : String(value ?? 0)
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={displayValue}
      onFocus={() => {
        setInputValue(String(value ?? 0))
        setIsFocused(true)
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '' || /^\d*[.,]?\d*$/.test(raw)) setInputValue(raw)
      }}
      onBlur={() => {
        const normalized = inputValue.replace(',', '.')
        if (normalized === '') {
          onChange(0)
        } else {
          const num = parseFloat(normalized)
          if (!Number.isNaN(num) && num >= 0) onChange(num)
        }
        setIsFocused(false)
      }}
    />
  )
}

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

export const SimplifiedTemplateSection: React.FC<Props> = ({
  value,
  onChange,
  onSave,
  saving,
  allMaterials,
  showPagesConfig = true,
}) => {
  const {
    hasTypes,
    selectedTypeId,
    setSelectedTypeId,
    sizes,
    selectedSizeId,
    setSelectedSizeId,
    selected,
    pagesConfig,
    applyToCurrentConfig,
    updatePagesConfig,
    updateSize,
    removeSize,
    addType,
    setDefaultType,
    removeType,
  } = useSimplifiedTypes(value, onChange)

  const [paperTypes, setPaperTypes] = useState<PaperTypeRow[]>([])
  const [printTechs, setPrintTechs] = useState<PrintTechRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSize, setNewSize] = useState<{ label: string; width_mm: string; height_mm: string }>({ label: '', width_mm: '', height_mm: '' })
  const [showCopySizes, setShowCopySizes] = useState(false)
  const [copyFromTypeId, setCopyFromTypeId] = useState<ProductTypeId | null>(null)
  const [copySelectedSizeIds, setCopySelectedSizeIds] = useState<string[]>([])
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string | null>(null)
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  })
  const [isMobile, setIsMobile] = useState(false)
  const [newPageToAdd, setNewPageToAdd] = useState('')

  const handleSelectType = useCallback(
    (typeId: ProductTypeId) => {
      setSelectedTypeId(typeId)
      const cfg = value.typeConfigs?.[String(typeId)]?.sizes ?? []
      setSelectedSizeId(cfg[0]?.id ?? null)
    },
    [value.typeConfigs, setSelectedTypeId, setSelectedSizeId],
  )

  // Восстанавливаем флаг взаимодействия с материалами при смене размера
  useEffect(() => {
    if (!selected) return
    if (selected.allowed_material_ids && selected.allowed_material_ids.length > 0) {
      hasUserInteractedWithMaterialsRef.current = true
    }
  }, [selected])

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [pt, techResp, svcResp] = await Promise.all([
        getPaperTypesFromWarehouse(),
        getPrintTechnologies().then(r => (Array.isArray(r.data) ? r.data : [])),
        api.get('/pricing/services').then(r => {
          const data = (r.data as any)?.data ?? r.data ?? []
          return Array.isArray(data) ? data : []
        }).catch(err => {
          console.error('Ошибка загрузки услуг отделки:', err)
          return []
        }),
      ])
      setPaperTypes(pt || [])
      setPrintTechs((techResp || []).filter((t: any) => t && t.code))
      
      // Загружаем все услуги - показываем все, кроме явно исключенных типов
      const allServices = (svcResp || []).filter((s: any) => {
        // Базовая валидация - услуга должна иметь id и name
        if (!s || !s.id || !s.name) return false
        
        // Исключаем только явно ненужные типы (например, печать, если такие есть)
        const excludedTypes = new Set(['print', 'printing'])
        const opType = String(s.operation_type ?? s.operationType ?? s.type ?? s.service_type ?? '').toLowerCase()
        
        // Если тип не указан или не в списке исключенных - показываем услугу
        if (!opType) return true
        return !excludedTypes.has(opType)
      })
      
      console.log('Все загруженные услуги:', allServices.length, allServices)
      setServices(allServices)
      
      // Восстанавливаем selectedPaperTypeId из сохраненных данных (но не блокируем переключение)
      // Если есть allowed_material_ids, определяем тип бумаги по материалам для начальной установки
      if (selected && selected.allowed_material_ids && selected.allowed_material_ids.length > 0 && pt && pt.length > 0 && !selectedPaperTypeId) {
        // Ищем тип бумаги, который содержит хотя бы один из сохраненных материалов
        for (const paperType of pt) {
          const materialIds = new Set(
            paperType.densities?.map(d => d.material_id).filter(id => id && id > 0) || []
          )
          // Проверяем, есть ли хотя бы один материал из allowed_material_ids в этом типе бумаги
          const hasMatchingMaterial = selected.allowed_material_ids.some(id => materialIds.has(id))
          if (hasMatchingMaterial && materialIds.size > 0) {
            setSelectedPaperTypeId(paperType.id)
            hasUserInteractedWithMaterialsRef.current = true // Помечаем, что материалы уже выбраны
            break
          }
        }
      }
      
      // Автоматически выбираем первый тип бумаги, если он есть и еще не выбран
      if (pt && pt.length > 0 && !selectedPaperTypeId) {
        setSelectedPaperTypeId(pt[0].id)
      }
    } catch (error) {
      console.error('Ошибка загрузки списков:', error)
    } finally {
      setLoadingLists(false)
    }
  }, [selectedPaperTypeId, selected])

  // Загружаем списки при монтировании компонента
  useEffect(() => {
    if (!loadingLists && (paperTypes.length === 0 || printTechs.length === 0 || services.length === 0)) {
      void loadLists()
    }
  }, []) // Загружаем только один раз при монтировании

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
      setTierModal((prev) => ({ ...prev, isOpen: false, tierIndex: undefined }))
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
      min_qty: 1,
      max_qty: undefined,
      default_print: undefined,
      print_prices: [],
      allowed_material_ids: [],
      material_prices: [],
      finishing: [],
    }
    applyToCurrentConfig(prev => ({ ...prev, sizes: [...(prev.sizes || []), size] }))
    setSelectedSizeId(size.id)
    setShowAddSize(false)
    setNewSize({ label: '', width_mm: '', height_mm: '' })
  }, [newSize.height_mm, newSize.label, newSize.width_mm, applyToCurrentConfig])

  const availableSourceTypes = useMemo(() => {
    if (!hasTypes || !value.types?.length) return []
    return value.types.filter((t) => t.id !== selectedTypeId)
  }, [hasTypes, value.types, selectedTypeId])

  const copySourceSizes = useMemo(() => {
    if (copyFromTypeId == null) return []
    return value.typeConfigs?.[String(copyFromTypeId)]?.sizes ?? []
  }, [value.typeConfigs, copyFromTypeId])

  const openCopySizesModal = useCallback(() => {
    if (!availableSourceTypes.length) return
    const initialTypeId = availableSourceTypes[0]?.id ?? null
    const initialSizes = initialTypeId != null ? (value.typeConfigs?.[String(initialTypeId)]?.sizes ?? []) : []
    setCopyFromTypeId(initialTypeId)
    setCopySelectedSizeIds(initialSizes.map((s) => s.id))
    setShowCopySizes(true)
  }, [availableSourceTypes, value.typeConfigs])

  const closeCopySizesModal = useCallback(() => {
    setShowCopySizes(false)
    setCopyFromTypeId(null)
    setCopySelectedSizeIds([])
  }, [])

  const commitCopySizes = useCallback(() => {
    if (copyFromTypeId == null || copySelectedSizeIds.length === 0) return
    const sourceSizes = value.typeConfigs?.[String(copyFromTypeId)]?.sizes ?? []
    const selectedSourceSizes = sourceSizes.filter((s) => copySelectedSizeIds.includes(s.id))
    if (selectedSourceSizes.length === 0) return

    const cloned = selectedSourceSizes.map(cloneSizeWithNewId)
    applyToCurrentConfig((prev) => ({
      ...prev,
      sizes: [...(prev.sizes || []), ...cloned],
    }))
    setSelectedSizeId(cloned[0]?.id ?? null)
    closeCopySizesModal()
  }, [applyToCurrentConfig, closeCopySizesModal, copyFromTypeId, copySelectedSizeIds, setSelectedSizeId, value.typeConfigs])

  useEffect(() => {
    if (!showCopySizes || copyFromTypeId == null) return
    const sourceSizes = value.typeConfigs?.[String(copyFromTypeId)]?.sizes ?? []
    const sourceIds = new Set(sourceSizes.map((s) => s.id))
    setCopySelectedSizeIds((prev) => {
      const filtered = prev.filter((id) => sourceIds.has(id))
      if (filtered.length > 0) return filtered
      return sourceSizes.map((s) => s.id)
    })
  }, [copyFromTypeId, showCopySizes, value.typeConfigs])

  const techName = useCallback((code: string) => printTechs.find(t => t.code === code)?.name || code, [printTechs])
  const svcName = useCallback((id: number) => services.find(s => Number(s.id) === Number(id))?.name || `#${id}`, [services])
  const materialName = useCallback((id: number) => allMaterials.find(m => Number(m.id) === Number(id))?.name || `#${id}`, [allMaterials])

  // Получить диапазоны для печати (только из print_prices, материалы имеют свои стандартные диапазоны)
  const getSizeRanges = useCallback((size: SimplifiedSizeConfig): Tier[] => {
    if (size.print_prices.length > 0 && size.print_prices[0].tiers.length > 0) {
      return normalizeTiers(size.print_prices[0].tiers)
    }
    return defaultTiers()
  }, [])

  // Обновить диапазоны только в печати (материалы имеют фиксированные стандартные диапазоны SRA3)
  const updateSizeRanges = useCallback((sizeId: string, newRanges: Tier[]) => {
    const size = sizes.find(s => s.id === sizeId)
    if (!size) return

    const updatedPrintPrices = size.print_prices.map(pp => {
      const priceMap = new Map(pp.tiers.map(t => [t.min_qty, t.unit_price]))
      const newTiers = newRanges.map(r => ({
        ...r,
        unit_price: priceMap.get(r.min_qty) ?? 0
      }))
      return { ...pp, tiers: newTiers }
    })

    updateSize(sizeId, { print_prices: updatedPrintPrices })
  }, [sizes, updateSize])

  // Материалы выбранного типа бумаги (или всех типов, если selectedPaperTypeId не выбран)
  // Поддерживаем выбор нескольких типов бумаги - показываем материалы из выбранного типа
  const materialsForSelectedPaperType = useMemo(() => {
    if (!paperTypes.length) return []
    
    // Если тип бумаги не выбран, возвращаем пустой массив (пользователь должен выбрать тип)
    if (!selectedPaperTypeId) return []
    
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
  
  // Все материалы из всех типов бумаги (для отображения в таблице)
  const allMaterialsFromAllPaperTypes = useMemo(() => {
    if (!paperTypes.length) return []
    
    const allMaterialIds = new Set<number>()
    paperTypes.forEach(pt => {
      pt.densities?.forEach(d => {
        if (d.material_id && d.material_id > 0) {
          allMaterialIds.add(d.material_id)
        }
      })
    })
    
    if (allMaterials && allMaterials.length > 0) {
      return allMaterials.filter(m => allMaterialIds.has(Number(m.id)))
    }
    
    // Создаем материалы из всех типов бумаги
    const materialsMap = new Map<number, CalculatorMaterial>()
    paperTypes.forEach(pt => {
      pt.densities?.forEach(d => {
        if (d.material_id && d.material_id > 0 && !materialsMap.has(d.material_id)) {
          materialsMap.set(d.material_id, {
            id: d.material_id,
            name: `${pt.display_name || pt.name} ${d.value} г/м²`,
            price: d.price || 0,
            unit: 'лист',
            quantity: d.available_quantity || 0,
            is_active: d.is_available ? 1 : 0,
            category_name: pt.display_name || pt.name,
          } as any as CalculatorMaterial)
        }
      })
    })
    
    return Array.from(materialsMap.values())
  }, [paperTypes, allMaterials])

  // Отслеживание взаимодействия пользователя с материалами
  const hasUserInteractedWithMaterialsRef = useRef(false)
  
  // Автоматическое добавление материалов при выборе типа бумаги только при первой загрузке
  // НЕ добавляем автоматически, если уже есть сохраненные allowed_material_ids (пользователь уже выбирал)
  useEffect(() => {
    if (!selected || !selectedPaperTypeId || materialsForSelectedPaperType.length === 0) return
    // Если пользователь уже взаимодействовал с материалами, не добавляем автоматически
    if (hasUserInteractedWithMaterialsRef.current) return
    
    // Если уже есть сохраненные allowed_material_ids, значит пользователь уже выбирал материалы
    // Не добавляем автоматически, чтобы не перезаписать выбор пользователя
    if (selected.allowed_material_ids && selected.allowed_material_ids.length > 0) {
      hasUserInteractedWithMaterialsRef.current = true
      return
    }

    const materialsToAdd = materialsForSelectedPaperType.filter(m => 
      !selected.allowed_material_ids.includes(Number(m.id))
    )
    
    if (materialsToAdd.length > 0) {
      const nextAllowed = [...selected.allowed_material_ids, ...materialsToAdd.map(m => Number(m.id))]
      updateSize(selected.id, { allowed_material_ids: nextAllowed })
    }
  }, [selectedPaperTypeId, materialsForSelectedPaperType, selected, updateSize])

  // Отслеживание взаимодействия пользователя с услугами для каждого размера отдельно
  // Ключ - ID размера, значение - был ли пользователь взаимодействовал с услугами
  const hasUserInteractedWithServicesRef = useRef<Map<string, boolean>>(new Map())
  
  // Восстанавливаем флаг взаимодействия при смене размера
  useEffect(() => {
    if (!selected) return
    
    // Если размер уже был настроен (есть print_prices или material_prices), 
    // и finishing пустой - значит пользователь явно удалил все услуги
    const hasOtherData = (selected.print_prices && selected.print_prices.length > 0) || 
                        (selected.material_prices && selected.material_prices.length > 0) ||
                        (selected.allowed_material_ids && selected.allowed_material_ids.length > 0)
    
    if (hasOtherData && selected.finishing && selected.finishing.length === 0) {
      // Размер был настроен, но услуг нет - пользователь явно удалил их
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
    } else if (selected.finishing && selected.finishing.length > 0) {
      // Есть сохраненные услуги - пользователь выбирал их
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
    }
    // Если размер новый (нет других данных) и finishing пустой - не помечаем как взаимодействие
  }, [selected])
  
  useEffect(() => {
    if (!selected || services.length === 0) return
    
    // Проверяем, взаимодействовал ли пользователь с услугами для этого размера
    const hasInteracted = hasUserInteractedWithServicesRef.current.get(selected.id) || false
    if (hasInteracted) return

    // Если уже есть сохраненные finishing, значит пользователь уже выбирал услуги
    if (selected.finishing && selected.finishing.length > 0) {
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
      return
    }

    // Проверяем, был ли размер настроен ранее (есть другие данные)
    const hasOtherData = (selected.print_prices && selected.print_prices.length > 0) || 
                        (selected.material_prices && selected.material_prices.length > 0) ||
                        (selected.allowed_material_ids && selected.allowed_material_ids.length > 0)
    
    // Если размер был настроен, но услуг нет - не добавляем автоматически
    // (пользователь мог явно удалить их)
    if (hasOtherData) {
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
      return
    }

    // По умолчанию услуги не добавляем — послепечатные включаются вручную
  }, [services, selected, getSizeRanges, updateSize])

  return (
    <div className="simplified-template simplified-template--pricing">
      <div className="simplified-template__header">
        <div>
          <h3>Упрощённый калькулятор</h3>
          <p className="text-muted text-sm">Настройка цен по размерам: печать (за изделие), материалы (за изделие) и отделка (за рез/биг/фальц).</p>
        </div>
        <div className="simplified-template__header-actions">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving}
            className="simplified-template__save-btn"
          >
            Сохранить
          </Button>
        </div>
      </div>

      <div className="simplified-card">
        <div className="simplified-card__header">
          <div>
            <strong>Опции калькулятора</strong>
            <div className="text-muted text-sm">Дополнительные чекбоксы, которые появятся в калькуляторе при расчёте.</div>
          </div>
        </div>
        <div className="simplified-card__content">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.use_layout !== false}
              onChange={(e) => onChange({ ...value, use_layout: e.target.checked })}
            />
            Учитывать раскладку на лист — оптимизация (несколько изделий на лист). Снять = 1 изделие на лист.
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!value.cutting}
              onChange={(e) => onChange({ ...value, cutting: e.target.checked })}
            />
            Резка стопой — считать резы по раскладке (резов на лист), а не по тиражу
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.duplex_as_single_x2 === true}
              onChange={(e) => onChange({ ...value, duplex_as_single_x2: e.target.checked })}
            />
            Для двухсторонней печати: считать как (односторонняя + материал) ×2, но списывать материал как обычно
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.include_material_cost !== false}
              onChange={(e) => onChange({ ...value, include_material_cost: e.target.checked })}
            />
            Учитывать стоимость материалов в расчёте
          </label>
          <div className="text-muted text-sm">
            По умолчанию включено: как и раньше, стоимость материалов добавляется в итоговую цену.
          </div>
        </div>
      </div>

      <ProductTypesCard
        value={value}
        onChange={onChange}
        selectedTypeId={selectedTypeId}
        onSelectType={handleSelectType}
        onAddType={addType}
        setDefaultType={setDefaultType}
        removeType={removeType}
      />

      {showPagesConfig && (
        <div className="simplified-card">
          <div className="simplified-card__header">
            <div>
              <strong>Страницы (для многостраничных изделий)</strong>
              <div className="text-muted text-sm">Привяжите к продукту варианты количества страниц — они появятся в калькуляторе.</div>
            </div>
          </div>
          <div className="simplified-card__content simplified-pages-config">
            <FormField label="Привязанные варианты">
              <div className="simplified-pages-list">
                {(pagesConfig.options || []).length === 0 ? (
                  <span className="text-muted text-sm">Нет привязанных вариантов. Добавьте количество страниц ниже.</span>
                ) : (
                  (pagesConfig.options || [])
                    .slice()
                    .sort((a, b) => a - b)
                    .map((num) => (
                      <span key={num} className="simplified-pages-chip">
                        <span>{num} стр.</span>
                        <button
                          type="button"
                          className="simplified-pages-chip__remove"
                          onClick={() => {
                            const nextOptions = (pagesConfig.options || []).filter((n) => n !== num);
                            const nextDefault =
                              pagesConfig.default === num
                                ? (nextOptions[0] ?? undefined)
                                : pagesConfig.default && nextOptions.includes(pagesConfig.default)
                                  ? pagesConfig.default
                                  : nextOptions[0];
                            updatePagesConfig({ options: nextOptions, default: nextDefault });
                          }}
                          title="Отвязать"
                        >
                          ×
                        </button>
                      </span>
                    ))
                )}
              </div>
              <div className="simplified-pages-add">
                <input
                  className="form-input simplified-pages-add__input"
                  type="number"
                  min={4}
                  max={500}
                  step={4}
                  value={newPageToAdd}
                  onChange={(e) => setNewPageToAdd(e.target.value)}
                  placeholder="Напр. 16"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const num = parseInt(newPageToAdd.trim(), 10);
                      if (Number.isFinite(num) && num >= 4 && num <= 500) {
                        const options = pagesConfig.options || [];
                        if (!options.includes(num)) {
                          const nextOptions = [...options, num].sort((a, b) => a - b);
                          const nextDefault = options.length === 0 ? num : pagesConfig.default;
                          updatePagesConfig({ options: nextOptions, default: nextDefault ?? num });
                          setNewPageToAdd('');
                        }
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const num = parseInt(newPageToAdd.trim(), 10);
                    if (!Number.isFinite(num) || num < 4 || num > 500) return;
                    const options = pagesConfig.options || [];
                    if (options.includes(num)) return;
                    const nextOptions = [...options, num].sort((a, b) => a - b);
                    const nextDefault = options.length === 0 ? num : pagesConfig.default;
                    updatePagesConfig({ options: nextOptions, default: nextDefault ?? num });
                    setNewPageToAdd('');
                  }}
                >
                  Добавить
                </Button>
              </div>
            </FormField>
            <FormField label="По умолчанию в калькуляторе">
              <select
                className="form-select"
                value={pagesConfig.default ?? ''}
                onChange={(e) => updatePagesConfig({ default: e.target.value === '' ? undefined : Number(e.target.value) })}
                disabled={!pagesConfig.options || pagesConfig.options.length === 0}
              >
                <option value="">—</option>
                {(pagesConfig.options || []).slice().sort((a, b) => a - b).map((pages) => (
                  <option key={pages} value={pages}>{pages} стр.</option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      )}

      {sizes.length === 0 ? (
        <Alert type="info">Добавьте хотя бы один размер (обрезной формат), чтобы начать настройку.</Alert>
      ) : (
        <div className="simplified-template__grid">
          <div className="simplified-template__sizes">
            <div className="simplified-template__sizes-header">
              <div className="simplified-template__sizes-title">Обрезные форматы</div>
              <div className="simplified-template__sizes-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openAddSize}
                  className="simplified-template__action-btn"
                >
                  Добавить размер
                </Button>
                {hasTypes && availableSourceTypes.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openCopySizesModal}
                    className="simplified-template__action-btn"
                  >
                    Скопировать из типа
                  </Button>
                )}
              </div>
            </div>
            {sizes.map(s => (
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
                    <FormField label="Мин. тираж">
                      <input
                        className="form-input form-input--compact"
                        type="number"
                        min="1"
                        placeholder="по раскладке"
                        title="Пусто = мин. по раскладке (1 лист). 1 = любой тираж, стоимость за полный лист."
                        value={selected.min_qty !== undefined ? String(selected.min_qty) : ''}
                        onChange={(e) =>
                          updateSize(selected.id, {
                            min_qty: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                      <div className="text-muted text-xs mt-1">Пусто — мин. по раскладке (шт/лист). 1 — любой тираж по цене полного листа.</div>
                    </FormField>
                    <FormField label="Макс. тираж">
                      <input
                        className="form-input form-input--compact"
                        type="number"
                        min="1"
                        value={selected.max_qty !== undefined ? String(selected.max_qty) : ''}
                        onChange={(e) =>
                          updateSize(selected.id, {
                            max_qty: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
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
                    {selected.default_print?.technology_code && selected.width_mm > 0 && selected.height_mm > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          const tech = selected.default_print?.technology_code ?? ''
                          if (!tech) return
                          const w = selected.width_mm
                          const h = selected.height_mm
                          const modes: Array<{ color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex' }> = [
                            { color_mode: 'color', sides_mode: 'single' },
                            { color_mode: 'color', sides_mode: 'duplex' },
                            { color_mode: 'bw', sides_mode: 'single' },
                            { color_mode: 'bw', sides_mode: 'duplex' },
                          ]
                          const updated: typeof selected.print_prices = []
                          let itemsPerSheet: number | undefined
                          for (const m of modes) {
                            try {
                              const r = await api.get('/pricing/print-prices/derive', {
                                params: { technology_code: tech, width_mm: w, height_mm: h, color_mode: m.color_mode, sides_mode: m.sides_mode },
                              })
                              const data = r.data as { items_per_sheet?: number; tiers?: Array<{ min_qty: number; max_qty?: number; unit_price: number }> }
                              if (data?.items_per_sheet != null) itemsPerSheet = data.items_per_sheet
                              const tiers = data?.tiers ?? []
                              if (tiers.length > 0) {
                                updated.push({
                                  technology_code: tech,
                                  color_mode: m.color_mode,
                                  sides_mode: m.sides_mode,
                                  tiers: tiers.map((t: any) => ({ min_qty: t.min_qty, max_qty: t.max_qty, unit_price: t.unit_price ?? 0 })),
                                })
                              }
                            } catch {
                              // Пропускаем режим, если нет центральных цен
                            }
                          }
                          if (updated.length > 0) {
                            const patch: Partial<typeof selected> = { print_prices: updated }
                            if (itemsPerSheet != null && itemsPerSheet > 0) {
                              patch.min_qty = itemsPerSheet
                            }
                            updateSize(selected.id, patch)
                          }
                        }}
                      >
                        Заполнить из центральных цен
                      </Button>
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

                            // Получаем информацию о технологии
                            const selectedTech = printTechs.find(t => t.code === techCode)
                            const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
                            
                            // Проверяем, поддерживает ли технология только цветную печать
                            // Для струйных пигментных технологий обычно только цветная печать
                            const isColorOnly = techCode.toLowerCase().includes('inkjet_pigment') || 
                                               (techCode.toLowerCase().includes('inkjet') && selectedTech?.name?.toLowerCase().includes('пигмент'))

                            // Создаем вариации для выбранной технологии с учётом ограничений
                            // Используем общие диапазоны, если они уже есть, иначе создаем дефолтные
                            const existingRanges = getSizeRanges(selected)
                            const variations: Array<{ technology_code: string; color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex'; tiers: Array<{ min_qty: number; max_qty?: number; unit_price: number }> }> = []
                            
                            if (isColorOnly) {
                              // Только цветная печать
                              if (supportsDuplex) {
                                // Односторонняя и двухсторонняя цветная
                                variations.push(
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                                )
                              } else {
                                // Только односторонняя цветная
                                variations.push(
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                                )
                              }
                            } else {
                              // Обычная технология - все вариации
                              if (supportsDuplex) {
                                // Все 4 вариации: цветная/чб × односторонняя/двухсторонняя
                                variations.push(
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                                  { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                                  { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                                )
                              } else {
                                // Только односторонняя: цветная и ч/б
                                variations.push(
                                  { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                                  { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                                )
                              }
                            }

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
                      const removeSidesMode = (sidesMode: 'single' | 'duplex') => {
                        const remaining = selected.print_prices.filter(p => p.sides_mode !== sidesMode)
                        if (remaining.length === 0) return
                        updateSize(selected.id, { print_prices: remaining })
                      }
                      const hasSingle = selected.print_prices.some(p => p.sides_mode === 'single')
                      const hasDuplex = selected.print_prices.some(p => p.sides_mode === 'duplex')
                      const selectedTech = selected.default_print?.technology_code
                        ? printTechs.find(t => t.code === selected.default_print?.technology_code)
                        : null
                      const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
                      const addSidesMode = (sidesMode: 'single' | 'duplex') => {
                        const existing = selected.print_prices
                        const newEntries = existing.map(p => ({
                          technology_code: p.technology_code,
                          color_mode: p.color_mode,
                          sides_mode: sidesMode as 'single' | 'duplex',
                          tiers: (p.tiers || defaultTiers()).map(t => ({ ...t, unit_price: 0 }))
                        }))
                        updateSize(selected.id, { print_prices: [...existing, ...newEntries] })
                      }
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
                                    {commonRanges.map((_, ti) => (
                                      <td key={`color-empty-${ti}`} style={{ backgroundColor: '#f5f7fa' }}></td>
                                    ))}
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
                                    const canRemoveSingle = selected.print_prices.some(p => p.sides_mode === 'duplex')
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className="el-select el-select--small" style={{ flex: 1 }}>
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
                                            {canRemoveSingle && (
                                              <button
                                                type="button"
                                                className="el-button el-button--text el-button--mini"
                                                style={{ color: 'var(--danger, #f56c6c)', flexShrink: 0 }}
                                                title="Убрать одностороннюю печать для этого продукта"
                                                onClick={() => removeSidesMode('single')}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                        <td key={ti}>
                                          <PriceCell
                                            className="form-input form-input--compact-table"
                                            value={priceTier.unit_price ?? 0}
                                            onChange={(v) => {
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
                                    const canRemoveDuplex = selected.print_prices.some(p => p.sides_mode === 'single')
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className="el-select el-select--small" style={{ flex: 1 }}>
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
                                            {canRemoveDuplex && (
                                              <button
                                                type="button"
                                                className="el-button el-button--text el-button--mini"
                                                style={{ color: 'var(--danger, #f56c6c)', flexShrink: 0 }}
                                                title="Убрать двухстороннюю печать для этого продукта"
                                                onClick={() => removeSidesMode('duplex')}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <PriceCell
                                                className="form-input form-input--compact-table"
                                                value={priceTier.unit_price ?? 0}
                                                onChange={(v) => {
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
                                    {commonRanges.map((_, ti) => (
                                      <td key={`bw-empty-${ti}`} style={{ backgroundColor: '#f5f7fa' }}></td>
                                    ))}
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
                                    const canRemoveSingleBw = selected.print_prices.some(p => p.sides_mode === 'duplex')
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className="el-select el-select--small" style={{ flex: 1 }}>
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
                                            {canRemoveSingleBw && (
                                              <button
                                                type="button"
                                                className="el-button el-button--text el-button--mini"
                                                style={{ color: 'var(--danger, #f56c6c)', flexShrink: 0 }}
                                                title="Убрать одностороннюю печать для этого продукта"
                                                onClick={() => removeSidesMode('single')}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <PriceCell
                                                className="form-input form-input--compact-table"
                                                value={priceTier.unit_price ?? 0}
                                                onChange={(v) => {
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
                                    const canRemoveDuplexBw = selected.print_prices.some(p => p.sides_mode === 'single')
                                    return (
                                      <tr className="simplified-table__child-row">
                                        <td className="simplified-table__child-cell">
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className="el-select el-select--small" style={{ flex: 1 }}>
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
                                            {canRemoveDuplexBw && (
                                              <button
                                                type="button"
                                                className="el-button el-button--text el-button--mini"
                                                style={{ color: 'var(--danger, #f56c6c)', flexShrink: 0 }}
                                                title="Убрать двухстороннюю печать для этого продукта"
                                                onClick={() => removeSidesMode('duplex')}
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        {commonRanges.map((t, ti) => {
                                          const priceTier = row.tiers.find(rt => rt.min_qty === t.min_qty) || t
                                          return (
                                            <td key={ti}>
                                              <PriceCell
                                                className="form-input form-input--compact-table"
                                                value={priceTier.unit_price ?? 0}
                                                onChange={(v) => {
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
                                        <td></td>
                                      </tr>
                                    )
                                  })()}
                                </>
                              )}
                            </tbody>
                          </table>
                          {(hasSingle && !hasDuplex && supportsDuplex) || (!hasSingle && hasDuplex) ? (
                            <div className="simplified-tiers-table__add-sides" style={{ marginTop: 10, fontSize: 13, color: '#606266' }}>
                              {hasSingle && !hasDuplex && supportsDuplex && (
                                <>
                                  Сейчас только односторонняя печать.{' '}
                                  <button
                                    type="button"
                                    className="el-button el-button--text el-button--mini"
                                    style={{ color: 'var(--primary, #409eff)' }}
                                    onClick={() => addSidesMode('duplex')}
                                  >
                                    Добавить двухстороннюю
                                  </button>
                                </>
                              )}
                              {!hasSingle && hasDuplex && (
                                <>
                                  Сейчас только двухсторонняя печать.{' '}
                                  <button
                                    type="button"
                                    className="el-button el-button--text el-button--mini"
                                    style={{ color: 'var(--primary, #409eff)' }}
                                    onClick={() => addSidesMode('single')}
                                  >
                                    Добавить одностороннюю
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
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
                      <div className="text-muted text-sm">Выберите тип бумаги, затем конкретные материалы. Цены подтягиваются со склада автоматически.</div>
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
                      <>
                        {/* Список материалов с чекбоксами для выбора разрешенных */}
                        <div className="mt-3 mb-3" style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '12px' }}>
                          <div className="text-sm font-medium mb-2">Выберите разрешенные материалы:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            {materialsForSelectedPaperType.map(m => {
                              const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                                ?.densities?.find(d => d.material_id === Number(m.id))
                              const isAllowed = selected.allowed_material_ids.includes(Number(m.id))
                              
                              return (
                                <label
                                  key={m.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: isAllowed ? '#f0f9ff' : 'transparent',
                                    border: isAllowed ? '1px solid #3b82f6' : '1px solid #e5e7eb'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    onChange={(e) => {
                                      hasUserInteractedWithMaterialsRef.current = true
                                      const checked = e.target.checked
                                      if (checked) {
                                        updateSize(selected.id, {
                                          allowed_material_ids: [...selected.allowed_material_ids, Number(m.id)]
                                        })
                                      } else {
                                        updateSize(selected.id, {
                                          allowed_material_ids: selected.allowed_material_ids.filter(id => id !== Number(m.id))
                                        })
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <span>
                                    {m.name}{densityInfo ? ` (${densityInfo.value} г/м²)` : ''}
                                    {densityInfo?.price != null && (
                                      <span className="text-muted" style={{ marginLeft: 6 }}>
                                        {densityInfo.price.toFixed(2)} ₽/лист
                                      </span>
                                    )}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* Список выбранных материалов с ценами со склада */}
                        {selected.allowed_material_ids.length > 0 && (
                          <div className="mt-3" style={{ fontSize: 13 }}>
                            <div className="text-muted text-sm mb-2">Цены подтягиваются со склада при расчёте заказа</div>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                              {allMaterialsFromAllPaperTypes
                                .filter(m => selected.allowed_material_ids.includes(Number(m.id)))
                                .map(m => {
                                  const pt = paperTypes.find(p => p.densities?.some(d => d.material_id === Number(m.id)))
                                  const density = pt?.densities?.find(d => d.material_id === Number(m.id))
                                  return (
                                    <li key={m.id} style={{ marginBottom: 4 }}>
                                      {m.name}
                                      {density ? ` (${density.value} г/м²)` : ''}
                                      {pt && ` [${pt.display_name || pt.name}]`}
                                      {density?.price != null && (
                                        <span className="text-muted" style={{ marginLeft: 6 }}>
                                          — {density.price.toFixed(2)} ₽/лист
                                        </span>
                                      )}
                                    </li>
                                  )
                                })}
                            </ul>
                          </div>
                        )}
                        </>
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
                      <div className="text-muted text-sm">Выберите услуги из списка. Цены загружаются из services-management. Отметьте услуги, которые нужно добавить в продукт.</div>
                    </div>
                  </div>
                  <div className="simplified-card__content">
                    {loadingLists ? (
                      <div className="text-muted">Загрузка услуг отделки...</div>
                    ) : services.length === 0 ? (
                      <div className="text-muted">
                        <div>Услуги отделки не найдены. Проверьте настройки услуг в системе.</div>
                        <button
                          type="button"
                          className="el-button el-button--text el-button--mini"
                          onClick={() => void loadLists()}
                          style={{ marginTop: '8px' }}
                        >
                          Попробовать снова
                        </button>
                      </div>
                    ) : (() => {
                      const commonRanges = getSizeRanges(selected)
                      
                      // Преобразуем services в формат ServiceItem
                      const serviceItems: ServiceItem[] = services.map(s => {
                        const opType = s.operation_type ?? s.operationType ?? s.type ?? s.service_type ?? ''
                        return {
                          id: Number(s.id),
                          name: s.name || s.service_name || `Услуга #${s.id}`,
                          price_unit: (opType === 'cut' || opType === 'score' || opType === 'fold') 
                            ? 'per_cut' as const 
                            : 'per_item' as const,
                          operation_type: opType
                        }
                      })
                      
                      // ✅ Преобразуем finishing в формат ServicePricing БЕЗ tiers
                      // tiers для услуг в simplifiedTemplate больше нигде не используем
                      const servicePricings: ServicePricing[] = selected.finishing.map(f => ({
                        service_id: f.service_id,
                        price_unit: f.price_unit,
                        units_per_item: f.units_per_item,
                        // 🆕 Сохраняем информацию о подтипе для сложных операций
                        variant_id: f.variant_id,
                        subtype: f.subtype,
                        variant_name: f.variant_name,
                        density: f.density,
                      }))
                      
                      return (
                        <ServicePricingTable
                          services={serviceItems}
                          servicePricings={servicePricings}
                          commonRanges={commonRanges}
                          onUpdate={(newPricings) => {
                            // Помечаем, что пользователь взаимодействовал с услугами для этого размера
                            hasUserInteractedWithServicesRef.current.set(selected.id, true)
                            // ✅ Сохраняем service_id, price_unit, units_per_item и информацию о подтипе - без tiers
                            const finishingWithoutTiers = newPricings.map(p => ({
                              service_id: p.service_id,
                              price_unit: p.price_unit,
                              units_per_item: p.units_per_item,
                              // 🆕 Сохраняем информацию о подтипе для сложных операций
                              variant_id: p.variant_id,
                              subtype: p.subtype,
                              variant_name: p.variant_name,
                              density: p.density,
                              // tiers не сохраняем - цены берутся из централизованной системы
                            }))
                            updateSize(selected.id, { finishing: finishingWithoutTiers })
                          }}
                          onRangesUpdate={(newRanges) => {
                            updateSizeRanges(selected.id, newRanges)
                          }}
                          rangesEditable={true}
                          isMobile={isMobile}
                          title="Параметры отделки (цена за рез/биг/фальц или за изделие)"
                          loadServiceTiers={true}
                          allowPriceOverride={false}
                        />
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
      <Modal isOpen={showCopySizes} onClose={closeCopySizesModal} title="Скопировать размеры из другого типа" size="md">
        <div className="simplified-add-size">
          <FormField label="Тип-источник" required>
            <select
              className="form-select"
              value={copyFromTypeId ?? ''}
              onChange={(e) => {
                const typeId = Number(e.target.value)
                if (!Number.isFinite(typeId)) {
                  setCopyFromTypeId(null)
                  setCopySelectedSizeIds([])
                  return
                }
                const sourceSizes = value.typeConfigs?.[String(typeId)]?.sizes ?? []
                setCopyFromTypeId(typeId)
                setCopySelectedSizeIds(sourceSizes.map((s) => s.id))
              }}
            >
              {availableSourceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Размеры для копирования">
            {copySourceSizes.length === 0 ? (
              <div className="text-muted text-sm">В выбранном типе нет размеров для копирования.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={copySelectedSizeIds.length === copySourceSizes.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCopySelectedSizeIds(copySourceSizes.map((s) => s.id))
                      } else {
                        setCopySelectedSizeIds([])
                      }
                    }}
                  />
                  Выбрать все
                </label>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8, padding: 8 }}>
                  {copySourceSizes.map((s) => {
                    const checked = copySelectedSizeIds.includes(s.id)
                    return (
                      <label key={s.id} className="checkbox-label" style={{ display: 'block', marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCopySelectedSizeIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]))
                            } else {
                              setCopySelectedSizeIds((prev) => prev.filter((id) => id !== s.id))
                            }
                          }}
                        />
                        {s.label} ({s.width_mm}×{s.height_mm} мм)
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </FormField>
          <div className="simplified-add-size__actions">
            <Button variant="secondary" onClick={closeCopySizesModal}>Отмена</Button>
            <Button
              variant="primary"
              onClick={commitCopySizes}
              disabled={!copyFromTypeId || copySelectedSizeIds.length === 0}
            >
              Скопировать
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


