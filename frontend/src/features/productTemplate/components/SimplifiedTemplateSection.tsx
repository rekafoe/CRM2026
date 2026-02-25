import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Button, FormField, Alert } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig, ProductTypeId } from '../hooks/useProductTemplate'
import { useSimplifiedTypes } from '../hooks/useSimplifiedTypes'
import { ProductTypesCard } from './ProductTypesCard'
import { PrintPricesCard } from './PrintPricesCard'
import { MaterialsCard } from './MaterialsCard'
import { FinishingCard } from './FinishingCard'
import { AddSizeModal, CopySizesModal } from './SizeModals'
import { type Tier, defaultTiers, normalizeTiers } from '../utils/tierManagement'
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

                <PrintPricesCard
                  selected={selected}
                  printTechs={printTechs}
                  loadingLists={loadingLists}
                  isMobile={isMobile}
                  updateSize={updateSize}
                  getSizeRanges={getSizeRanges}
                  updateSizeRanges={updateSizeRanges}
                />

                <MaterialsCard
                  selected={selected}
                  loadingLists={loadingLists}
                  selectedPaperTypeId={selectedPaperTypeId}
                  setSelectedPaperTypeId={setSelectedPaperTypeId}
                  paperTypes={paperTypes}
                  materialsForSelectedPaperType={materialsForSelectedPaperType}
                  allMaterialsFromAllPaperTypes={allMaterialsFromAllPaperTypes}
                  hasUserInteractedWithMaterialsRef={hasUserInteractedWithMaterialsRef}
                  updateSize={updateSize}
                />

                <FinishingCard
                  selected={selected}
                  loadingLists={loadingLists}
                  services={services}
                  loadLists={loadLists}
                  getSizeRanges={getSizeRanges}
                  updateSizeRanges={updateSizeRanges}
                  updateSize={updateSize}
                  hasUserInteractedWithServicesRef={hasUserInteractedWithServicesRef}
                  isMobile={isMobile}
                />
              </>
            )}
          </div>
        </div>
      )}

      <AddSizeModal
        isOpen={showAddSize}
        onClose={() => setShowAddSize(false)}
        newSize={newSize}
        setNewSize={setNewSize}
        onCommit={commitAddSize}
      />
      <CopySizesModal
        isOpen={showCopySizes}
        onClose={closeCopySizesModal}
        availableSourceTypes={availableSourceTypes}
        copyFromTypeId={copyFromTypeId}
        setCopyFromTypeId={setCopyFromTypeId}
        copySourceSizes={copySourceSizes}
        copySelectedSizeIds={copySelectedSizeIds}
        setCopySelectedSizeIds={setCopySelectedSizeIds}
        typeConfigs={value.typeConfigs}
        onCommit={commitCopySizes}
      />
    </div>
  )
}


