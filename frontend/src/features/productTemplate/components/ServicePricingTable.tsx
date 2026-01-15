import React, { useState, useRef, useEffect } from 'react'
import { FormField, Button } from '../../../components/common'
import { getServiceVolumeTiers, getServiceVariants } from '../../../services/pricing/api'
import type { ServiceVolumeTier, ServiceVariant } from '../../../types/pricing'

// Типы для работы с диапазонами
export type Tier = { min_qty: number; max_qty?: number; unit_price: number }

export interface ServiceItem {
  id: number
  name: string
  price_unit?: 'per_cut' | 'per_item'
  operation_type?: string
}

export interface ServicePricing {
  service_id: number
  price_unit: 'per_cut' | 'per_item'
  units_per_item: number
  // 🆕 tiers больше не храним в шаблоне продукта - цены берутся из централизованной системы услуг
  // tiers оставлен только для обратной совместимости со старыми данными, но не используется при сохранении
  tiers?: Tier[] // Опционально, только для чтения старых данных
  // 🆕 Поля для сложных операций с подтипами (например, ламинация)
  variant_id?: number // ID варианта услуги (типа, например "Рулонная" или "Пакетная")
  subtype?: string // Название подтипа (например, "глянец 32 мк")
  variant_name?: string // Название варианта (типа, например "Рулонная")
  density?: string // Плотность подтипа (например, "32 мк")
}

export interface ServiceWithTiers extends ServiceItem {
  tiers: Tier[] // Предустановленные tiers из services-management
  loading?: boolean
}

interface ServicePricingTableProps {
  services: ServiceItem[]
  servicePricings: ServicePricing[]
  commonRanges: Tier[]
  onUpdate: (pricings: ServicePricing[]) => void
  onRangesUpdate?: (newRanges: Tier[]) => void
  rangesEditable?: boolean
  isMobile?: boolean
  title?: string
  description?: string
  // Новые пропсы для работы с предустановленными ценами
  loadServiceTiers?: boolean // Загружать ли tiers из API
  allowPriceOverride?: boolean // Позволить ли переопределять цены для продукта
}

type TierRangeModalState = {
  type: 'add' | 'edit'
  tierIndex?: number
  isOpen: boolean
  boundary: string
  anchorElement?: HTMLElement
}

// Утилиты для работы с диапазонами
const defaultTiers = (): Tier[] => [
  { min_qty: 1, max_qty: undefined, unit_price: 0 }
]

const normalizeTiers = (tiers: Tier[]): Tier[] => {
  if (tiers.length === 0) return defaultTiers()

  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  
  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i] = { ...sorted[i], max_qty: sorted[i + 1].min_qty - 1 }
  }
  
  if (sorted.length > 0) {
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max_qty: undefined }
  }

  return sorted
}

const addRangeBoundary = (tiers: Tier[], newBoundary: number): Tier[] => {
  if (tiers.length === 0) {
    return [{ min_qty: 1, max_qty: newBoundary - 1, unit_price: 0 }, { min_qty: newBoundary, max_qty: undefined, unit_price: 0 }]
  }

  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  const existingBoundary = sortedTiers.find(t => t.min_qty === newBoundary)
  if (existingBoundary) {
    return sortedTiers
  }

  const targetIndex = sortedTiers.findIndex(t => {
    const max = t.max_qty !== undefined ? t.max_qty + 1 : Infinity
    return newBoundary >= t.min_qty && newBoundary < max
  })

  if (targetIndex === -1) {
    const lastTier = sortedTiers[sortedTiers.length - 1]
    if (lastTier.max_qty === undefined) {
      const newTiers = [...sortedTiers]
      newTiers[newTiers.length - 1] = { ...lastTier, max_qty: newBoundary - 1 }
      newTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
      return normalizeTiers(newTiers)
    }
    sortedTiers.push({ min_qty: newBoundary, max_qty: undefined, unit_price: 0 })
    return normalizeTiers(sortedTiers)
  }

  const targetTier = sortedTiers[targetIndex]
  
  if (newBoundary === targetTier.min_qty) {
    return sortedTiers
  }
  
  const newTiers = [...sortedTiers]
  newTiers[targetIndex] = { ...targetTier, max_qty: newBoundary - 1 }
  newTiers.splice(targetIndex + 1, 0, { min_qty: newBoundary, max_qty: targetTier.max_qty, unit_price: 0 })
  
  return normalizeTiers(newTiers)
}

const editRangeBoundary = (tiers: Tier[], tierIndex: number, newBoundary: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers

  const existingBoundary = sortedTiers.find((t, i) => i !== tierIndex && t.min_qty === newBoundary)
  if (existingBoundary) {
    return sortedTiers
  }

  const editedTier = sortedTiers[tierIndex]
  const newTiers = [...sortedTiers]

  newTiers[tierIndex] = { ...editedTier, min_qty: newBoundary }

  if (tierIndex > 0) {
    newTiers[tierIndex - 1] = { ...newTiers[tierIndex - 1], max_qty: newBoundary - 1 }
  }

  return normalizeTiers(newTiers)
}

const removeRange = (tiers: Tier[], tierIndex: number): Tier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers

  if (sortedTiers.length <= 1) {
    return sortedTiers
  }

  const newTiers = [...sortedTiers]
  const removedTier = newTiers[tierIndex]

  if (tierIndex > 0) {
    const prevTier = newTiers[tierIndex - 1]
    newTiers[tierIndex - 1] = { ...prevTier, max_qty: removedTier.max_qty }
  } else if (tierIndex < newTiers.length - 1) {
    const nextTier = newTiers[tierIndex + 1]
    newTiers[tierIndex + 1] = { ...nextTier, min_qty: 1 }
  }

  newTiers.splice(tierIndex, 1)
  return normalizeTiers(newTiers)
}

// Преобразует ServiceVolumeTier[] в Tier[]
// ServiceVolumeTier имеет только minQuantity, диапазон продолжается до следующего tier или до бесконечности
const convertServiceTiersToTiers = (serviceTiers: ServiceVolumeTier[], commonRanges: Tier[]): Tier[] => {
  if (serviceTiers.length === 0) {
    // Если tiers нет, используем commonRanges с нулевыми ценами
    return commonRanges.map(r => ({ ...r, unit_price: 0 }))
  }

  // Сортируем tiers по minQuantity
  const sortedTiers = [...serviceTiers]
    .filter(t => t.isActive)
    .sort((a, b) => a.minQuantity - b.minQuantity)

  // Для каждого commonRange находим соответствующую цену из serviceTiers
  return commonRanges.map(range => {
    // Находим tier с максимальным minQuantity, который <= range.min_qty
    // Это будет цена для этого диапазона
    let bestTier: ServiceVolumeTier | null = null
    for (const tier of sortedTiers) {
      if (tier.minQuantity <= range.min_qty) {
        bestTier = tier
      } else {
        break
      }
    }

    // Если нашли tier, используем его rate, иначе 0
    return {
      ...range,
      unit_price: bestTier?.rate ?? 0
    }
  })
}

export const ServicePricingTable: React.FC<ServicePricingTableProps> = ({
  services,
  servicePricings,
  commonRanges,
  onUpdate,
  onRangesUpdate,
  rangesEditable = true,
  isMobile = false,
  title = 'Параметры отделки (цена за рез/биг/фальц или за изделие)',
  description,
  loadServiceTiers = true,
  allowPriceOverride = false
}) => {
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  })
  const tierModalRef = useRef<HTMLDivElement>(null)
  const addRangeButtonRef = useRef<HTMLButtonElement>(null)
  const [servicesWithTiers, setServicesWithTiers] = useState<ServiceWithTiers[]>([])
  const [loadingTiers, setLoadingTiers] = useState(false)
  // 🆕 Состояние для вариантов услуг (для сложных операций типа ламинации)
  const [serviceVariants, setServiceVariants] = useState<Map<number, ServiceVariant[]>>(new Map())
  const [loadingVariants, setLoadingVariants] = useState<Set<number>>(new Set())

  // 🆕 Загружаем варианты для услуг с operation_type === 'laminate'
  useEffect(() => {
    const loadVariants = async () => {
      const servicesToLoad = services.filter(s => {
        const opType = s.operation_type || ''
        return opType === 'laminate' || s.name?.toLowerCase().includes('ламинация')
      })

      if (servicesToLoad.length === 0) return

      for (const service of servicesToLoad) {
        if (serviceVariants.has(service.id)) continue // Уже загружено

        setLoadingVariants(prev => new Set(prev).add(service.id))
        try {
          const variants = await getServiceVariants(service.id)
          setServiceVariants(prev => new Map(prev).set(service.id, variants))
        } catch (error) {
          console.error(`Ошибка загрузки вариантов для услуги ${service.id}:`, error)
        } finally {
          setLoadingVariants(prev => {
            const next = new Set(prev)
            next.delete(service.id)
            return next
          })
        }
      }
    }

    void loadVariants()
  }, [services, serviceVariants])

  // Загрузка tiers для услуг
  useEffect(() => {
    if (!loadServiceTiers || services.length === 0) {
      setServicesWithTiers(services.map(s => ({ ...s, tiers: [] })))
      return
    }

    const loadTiers = async () => {
      setLoadingTiers(true)
      try {
        const servicesWithTiersData = await Promise.all(
          services.map(async (service) => {
            try {
              const serviceTiers = await getServiceVolumeTiers(service.id)
              const tiers = convertServiceTiersToTiers(serviceTiers, commonRanges)
              return {
                ...service,
                tiers,
                loading: false
              }
            } catch (error) {
              console.error(`Ошибка загрузки tiers для услуги ${service.id}:`, error)
              return {
                ...service,
                tiers: commonRanges.map(r => ({ ...r, unit_price: 0 })),
                loading: false
              }
            }
          })
        )
        setServicesWithTiers(servicesWithTiersData)
      } catch (error) {
        console.error('Ошибка загрузки tiers услуг:', error)
      } finally {
        setLoadingTiers(false)
      }
    }

    void loadTiers()
  }, [services, loadServiceTiers, commonRanges])

  // Закрытие модалки при клике вне её
  useEffect(() => {
    if (!tierModal.isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!tierModalRef.current) return

      const target = e.target as HTMLElement

      if (tierModalRef.current.contains(target)) {
        return
      }

      const button = target.closest('button')
      if (button) {
        const buttonText = button.textContent || ''
        if (buttonText.includes('Диапазон')) {
          return
        }
      }

      setTierModal((prev) => ({ ...prev, isOpen: false }))
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [tierModal.isOpen])

  // ⛔ handlePriceChange больше не используется - цены редактируются только в services-management
  // Оставлено для обратной совместимости, но не вызывается при allowPriceOverride={false}
  const handlePriceChange = (serviceId: number, tierIndex: number, newPrice: number) => {
    // ⚠️ Эта функция больше не должна вызываться, т.к. цены берутся из централизованной системы
    console.warn('handlePriceChange called but prices should be edited in services-management, not in product template')
    // Если всё же нужно переопределение цен для продукта (в будущем), можно раскомментировать:
    /*
    const existingIdx = servicePricings.findIndex(p => p.service_id === serviceId)
    
    if (existingIdx === -1) {
      const newPricing: ServicePricing = {
        service_id: serviceId,
        price_unit: 'per_cut',
        units_per_item: 1,
        tiers: commonRanges.map((rt, rti) => {
          if (rti === tierIndex) return { ...rt, unit_price: newPrice }
          return { ...rt, unit_price: 0 }
        })
      }
      onUpdate([...servicePricings, newPricing])
    } else {
      const updated = servicePricings.map((p, i) => {
        if (i !== existingIdx) return p
        const updatedTiers = (p.tiers || []).map((rt, rti) => {
          if (rti === tierIndex) return { ...rt, unit_price: newPrice }
          return rt
        })
        return { ...p, tiers: updatedTiers }
      })
      onUpdate(updated)
    }
    */
  }

  const handleAddRange = () => {
    if (!tierModal.boundary.trim()) return
    
    const boundary = Number(tierModal.boundary)
    if (!Number.isFinite(boundary) || boundary < 1) return

    const newRanges = addRangeBoundary(commonRanges, boundary)
    
    // ✅ Обновляем только структуру диапазонов через onRangesUpdate
    // tiers больше не сохраняем в шаблоне продукта - цены берутся из services-management
    if (onRangesUpdate) {
      onRangesUpdate(newRanges)
    }
    
    setTierModal({ type: 'add', isOpen: false, boundary: '' })
  }

  const handleEditRange = () => {
    if (!tierModal.boundary.trim() || tierModal.tierIndex === undefined) return
    
    const boundary = Number(tierModal.boundary)
    if (!Number.isFinite(boundary) || boundary < 1) return

    const newRanges = editRangeBoundary(commonRanges, tierModal.tierIndex, boundary)
    
    // ✅ Обновляем только структуру диапазонов через onRangesUpdate
    // tiers больше не сохраняем в шаблоне продукта
    if (onRangesUpdate) {
      onRangesUpdate(newRanges)
    }
    
    setTierModal({ type: 'add', isOpen: false, boundary: '' })
  }

  const handleRemoveRange = (tierIndex: number) => {
    const newRanges = removeRange(commonRanges, tierIndex)
    
    // ✅ Обновляем только структуру диапазонов через onRangesUpdate
    // tiers больше не сохраняем в шаблоне продукта
    if (onRangesUpdate) {
      onRangesUpdate(newRanges)
    }
  }

  return (
    <div className="simplified-tiers-table">
      {description && <div className="text-muted text-sm" style={{ marginBottom: '12px' }}>{description}</div>}
      <table className={`simplified-table simplified-table--compact ${isMobile ? 'simplified-table--mobile-stack' : ''}`}>
        <thead>
          <tr>
            <th>{title}</th>
            {commonRanges.map((t, ti) => {
              const rangeLabel = t.max_qty == null ? `${t.min_qty} - ∞` : String(t.min_qty)
              return (
                <th key={ti} className="simplified-table__range-cell">
                  <div className="cell">
                    {rangesEditable && (
                      <>
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
                            onClick={() => handleRemoveRange(ti)}
                          >
                            ×
                          </button>
                        </span>
                      </>
                    )}
                    {!rangesEditable && <span>{rangeLabel}</span>}
                  </div>
                </th>
              )
            })}
            {rangesEditable && (
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
            )}
          </tr>
        </thead>
        <tbody>
          {loadingTiers ? (
            <tr>
              <td colSpan={commonRanges.length + (rangesEditable ? 2 : 1) + 1}>
                <div className="text-muted">Загрузка цен услуг...</div>
              </td>
            </tr>
          ) : (
            servicesWithTiers.length > 0 ? servicesWithTiers.map(serviceWithTiers => {
              const service = services.find(s => s.id === serviceWithTiers.id) || serviceWithTiers
              const pricing = servicePricings.find(p => p.service_id === Number(service.id))
              const isSelected = !!pricing
              
              // ✅ Предустановленные tiers из services-management (централизованная система)
              const presetTiers = serviceWithTiers.tiers || commonRanges.map(r => ({ ...r, unit_price: 0 }))
              
              // ✅ Всегда используем presetTiers - tiers из pricing.tiers больше не используются
              // (оставлены только для обратной совместимости со старыми данными)
              
              // 🆕 Проверяем, нужны ли варианты для этой услуги
              const opType = service.operation_type || ''
              const needsVariants = opType === 'laminate' || service.name?.toLowerCase().includes('ламинация')
              const variants = needsVariants ? (serviceVariants.get(service.id) || []) : []
              
              // 🆕 Формируем уникальные типы (1-й уровень)
              const uniqueTypes = variants.length === 0
                ? []
                : Array.from(new Map(variants.map(v => [v.variantName, v])).values())
              
              // 🆕 Определяем выбранный тип и подтип из pricing
              const selectedTypeName = pricing?.variant_name || (uniqueTypes[0]?.variantName || '')
              const selectedSubtype = pricing?.subtype || ''
              const selectedVariantId = pricing?.variant_id
              
              // 🆕 Формируем подтипы для выбранного типа (2-й уровень)
              const subtypes = variants.length === 0 || !selectedTypeName
                ? []
                : variants
                  .filter(v => v.variantName === selectedTypeName)
                  .filter(v => v.parameters?.type || v.parameters?.density)
                  .map(v => {
                    const type = v.parameters?.type || ''
                    const density = v.parameters?.density || ''
                    const subtypeLabel = type && density ? `${type} ${density}` : type || density || `Вариант ${v.id}`
                    return {
                      value: subtypeLabel,
                      label: subtypeLabel,
                      variantId: v.id,
                      variantName: v.variantName,
                      density: density
                    }
                  })

              const handleServiceToggle = (checked: boolean) => {
                if (checked) {
                  // ✅ Добавляем услугу БЕЗ tiers - цены будут браться из централизованной системы услуг
                  const newPricing: ServicePricing = {
                    service_id: Number(service.id),
                    price_unit: service.price_unit || 'per_cut',
                    units_per_item: 1,
                    // 🆕 Для услуг с вариантами устанавливаем значения по умолчанию
                    ...(needsVariants && uniqueTypes.length > 0 ? {
                      variant_id: uniqueTypes[0]?.id,
                      variant_name: uniqueTypes[0]?.variantName,
                      subtype: subtypes[0]?.value,
                      density: subtypes[0]?.density
                    } : {}),
                    // tiers не сохраняем - цены берутся из services-management
                  }
                  onUpdate([...servicePricings, newPricing])
                } else {
                  // Удаляем услугу из продукта
                  const updated = servicePricings.filter(p => p.service_id !== Number(service.id))
                  onUpdate(updated)
                }
              }
              
              // 🆕 Обработчик изменения типа (1-й уровень)
              const handleTypeChange = (newTypeName: string) => {
                const variantsOfNewType = variants.filter(v => v.variantName === newTypeName)
                const firstVariant = variantsOfNewType[0]
                const firstSubtype = variantsOfNewType
                  .filter(v => v.parameters?.type || v.parameters?.density)
                  .map(v => {
                    const type = v.parameters?.type || ''
                    const density = v.parameters?.density || ''
                    return type && density ? `${type} ${density}` : type || density || ''
                  })[0] || ''
                
                const updated = servicePricings.map(p => {
                  if (p.service_id === Number(service.id)) {
                    return {
                      ...p,
                      variant_id: firstVariant?.id,
                      variant_name: newTypeName,
                      subtype: firstSubtype,
                      density: firstVariant?.parameters?.density || ''
                    }
                  }
                  return p
                })
                onUpdate(updated)
              }
              
              // 🆕 Обработчик изменения подтипа (2-й уровень)
              const handleSubtypeChange = (newSubtypeValue: string) => {
                const selectedSubtypeData = subtypes.find(st => st.value === newSubtypeValue)
                const updated = servicePricings.map(p => {
                  if (p.service_id === Number(service.id)) {
                    return {
                      ...p,
                      variant_id: selectedSubtypeData?.variantId || p.variant_id,
                      subtype: newSubtypeValue,
                      density: selectedSubtypeData?.density || ''
                    }
                  }
                  return p
                })
                onUpdate(updated)
              }
              
              return (
                <React.Fragment key={service.id}>
                  <tr style={{ opacity: isSelected ? 1 : 0.6 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleServiceToggle(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <div className="el-select el-select--small" style={{ flex: 1 }}>
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
                      </div>
                      {/* 🆕 Селекторы для услуг с вариантами (ламинация) */}
                      {isSelected && needsVariants && uniqueTypes.length > 0 && (
                        <div style={{ marginTop: '12px', marginLeft: '26px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div>
                            <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                              1. Тип:
                            </label>
                            <select
                              value={selectedTypeName}
                              onChange={(e) => handleTypeChange(e.target.value)}
                              style={{
                                fontSize: '12px',
                                padding: '4px 8px',
                                border: '1px solid #dcdfe6',
                                borderRadius: '4px',
                                width: '100%'
                              }}
                            >
                              {uniqueTypes.map((variant) => (
                                <option key={variant.variantName} value={variant.variantName}>
                                  {variant.variantName}
                                </option>
                              ))}
                            </select>
                          </div>
                          {subtypes.length > 0 && (
                            <div>
                              <label style={{ fontSize: '12px', color: '#666', marginBottom: '4px', display: 'block' }}>
                                2. Подтип с плотностью:
                              </label>
                              <select
                                value={selectedSubtype || subtypes[0]?.value || ''}
                                onChange={(e) => handleSubtypeChange(e.target.value)}
                                style={{
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  border: '1px solid #dcdfe6',
                                  borderRadius: '4px',
                                  width: '100%'
                                }}
                              >
                                {subtypes.map((st) => (
                                  <option key={st.value} value={st.value}>
                                    {st.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  {commonRanges.map((t, ti) => {
                    // ✅ Всегда показываем цены из presetTiers (централизованная система услуг)
                    // tiers из pricing.tiers больше не используются для отображения
                    const priceTier = presetTiers.find(rt => rt.min_qty === t.min_qty) || { ...t, unit_price: 0 }
                    
                    return (
                      <td key={ti}>
                        {/* ✅ Цены только для чтения - редактируются в services-management */}
                        <div 
                          style={{ 
                            padding: '4px 8px', 
                            backgroundColor: isSelected ? '#f5f7fa' : '#fafafa',
                            color: isSelected ? '#606266' : '#909399',
                            borderRadius: '4px',
                            textAlign: 'right'
                          }}
                          title={isSelected 
                            ? 'Цена из services-management (редактируется в управлении услугами)' 
                            : 'Выберите услугу, чтобы добавить в продукт'}
                        >
                          {priceTier.unit_price || 0}
                        </div>
                      </td>
                    )
                  })}
                  {rangesEditable && <td></td>}
                </tr>
                </React.Fragment>
              )
            }) : (
              <tr>
                <td colSpan={commonRanges.length + (rangesEditable ? 2 : 1) + 1}>
                  <div className="text-muted">Нет доступных услуг</div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      {/* Модалка для добавления/редактирования диапазонов */}
      {tierModal.isOpen && rangesEditable && (
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (tierModal.type === 'add') {
                        handleAddRange()
                      } else {
                        handleEditRange()
                      }
                    }
                  }}
                  autoFocus
                />
              </FormField>
            </div>
            <div className="simplified-tier-modal__footer">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e?: React.MouseEvent<Element>) => {
                  e?.stopPropagation()
                  setTierModal({ type: 'add', isOpen: false, boundary: '' })
                }}
              >
                Отменить
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={(e?: React.MouseEvent<Element>) => {
                  e?.stopPropagation()
                  if (tierModal.type === 'add') {
                    handleAddRange()
                  } else {
                    handleEditRange()
                  }
                }}
              >
                {tierModal.type === 'add' ? 'Добавить' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

