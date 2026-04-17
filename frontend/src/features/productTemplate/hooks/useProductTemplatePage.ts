import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ProductWithDetails,
  ProductParameterPreset,
  ProductParameter,
  addProductMaterial,
  createProductConfig,
  createProductParameter,
  updateProductParameter,
  deleteProductParameter,
  getProductTemplateConfig,
  getProductDetails,
  getProductMaterials,
  getProductParameterPresets,
  removeProductMaterial,
  updateProduct,
  updateProductConfig
} from '../../../services/products'
import { getAllWarehouseMaterials, CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { calculatePrice } from '../../../services/pricing'
import useProductTemplate, { buildDefaultSizes } from './useProductTemplate'
import type { Material } from '../../../types/shared'

interface QuickTestPayload {
  qty: number
  params: Record<string, unknown>
}

// Типы для материалов продуктов
interface ProductMaterialLink {
  id?: number
  material_id: number
  material_name?: string
  category_name?: string
  qty_per_sheet?: number
  is_required?: number | boolean
}

export interface UseProductTemplatePageResult {
  state: ReturnType<typeof useProductTemplate>[0]
  dispatch: ReturnType<typeof useProductTemplate>[1]
  product: ProductWithDetails | null
  templateConfigId: number | null
  loading: boolean
  loadingLists: boolean
  saving: boolean
  parameters: ProductParameter[]
  materials: ProductMaterialLink[]
  allMaterials: (Material | CalculatorMaterial)[]
  parameterPresets: ProductParameterPreset[]
  parameterPresetsLoading: boolean
  summaryStats: Array<{ label: string; value: string | number }>
  quickTestMaterials: ProductMaterialLink[]
  currentMaterialId: number | undefined
  persistTemplateConfig: (message: string) => Promise<void>
  persistTrimSizeWithFormat: (message: string) => Promise<void>
  handleMetaSave: () => Promise<void>
  handleAddMaterial: (payload: { material_id: number; qty_per_sheet?: number; is_required?: boolean }) => Promise<void>
  handleUpdateMaterialQuantity: (materialId: number, qty: number, isRequired?: boolean) => Promise<void>
  handleBulkAddMaterials: (materials: Array<{ material_id: number; qty_per_sheet?: number; is_required?: boolean }>) => Promise<void>
  handleBulkAddOperations: (operations: Array<{ operation_id: number; sequence?: number; is_required?: boolean; is_default?: boolean; price_multiplier?: number }>) => Promise<unknown[]>
  handleRemoveMaterial: (material: ProductMaterialLink) => Promise<void>
  handleAddParameter: (param: Partial<ProductParameter>) => Promise<void>
  handleUpdateParameter: (param: Partial<ProductParameter> & { id: number }) => Promise<void>
  handleRemoveParameter: (param: { id: number; name?: string; label?: string }) => Promise<void>
  handleQuickTestCalculate: (payload: QuickTestPayload) => Promise<unknown>
  refreshProduct: () => Promise<void>
}

export default function useProductTemplatePage(productId: number | undefined): UseProductTemplatePageResult {
  const [state, dispatch] = useProductTemplate()

  const [product, setProduct] = useState<ProductWithDetails | null>(null)
  const [templateConfigId, setTemplateConfigId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [saving, setSaving] = useState(false)

  const [parameters, setParameters] = useState<ProductParameter[]>([])
  const [materials, setMaterials] = useState<ProductMaterialLink[]>([])
  const [allMaterials, setAllMaterials] = useState<(Material | CalculatorMaterial)[]>([])
  const [parameterPresets, setParameterPresets] = useState<ProductParameterPreset[]>([])
  const [parameterPresetsLoading, setParameterPresetsLoading] = useState(false)

  const lastLoadedProductIdRef = useRef<number | null>(null)
  const defaultSimplifiedConfig = useMemo(
    () => ({ sizes: buildDefaultSizes(), pages: { options: [] as number[] } }),
    []
  )

  const resolvePresetKey = useCallback((details: ProductWithDetails | null) => {
    if (!details) return null

    // Используем расширенный тип для доступа к дополнительным полям
    const extendedDetails = details as ProductWithDetails & {
      parameter_preset_key?: string
      operation_preset?: string
      product_type?: string
      calculator_type?: string
      category_name?: string
    }

    const possibleKeys = [
      extendedDetails.parameter_preset_key,
      extendedDetails.operation_preset,
      extendedDetails.product_type,
      extendedDetails.calculator_type,
    ]

    for (const key of possibleKeys) {
      if (typeof key === 'string' && key.trim()) {
        return key.trim()
      }
    }

    const categoryName = (extendedDetails.category_name || '').toLowerCase()
    if (categoryName.includes('визит')) return 'business_cards'
    if (categoryName.includes('листов')) return 'flyers'
    if (categoryName.includes('буклет')) return 'booklets'
    if (categoryName.includes('плакат')) return 'posters'
    if (categoryName.includes('футбол')) return 'tshirt'

    return null
  }, [])

  const loadParameterPresets = useCallback(
    async (details: ProductWithDetails | null) => {
      const presetKey = resolvePresetKey(details)
      if (!presetKey) {
        setParameterPresets([])
        return
      }

      setParameterPresetsLoading(true)
      try {
        const presets = await getProductParameterPresets({ productType: presetKey, productName: details?.name })
        setParameterPresets(presets)
      } catch (error) {
        console.error('Не удалось загрузить пресеты параметров продукта', error)
        setParameterPresets([])
      } finally {
        setParameterPresetsLoading(false)
      }
    },
    [resolvePresetKey]
  )

  useEffect(() => {
    if (!productId) return
    if (lastLoadedProductIdRef.current === productId) return
    lastLoadedProductIdRef.current = productId

    const load = async () => {
      try {
        setLoading(true)
        setTemplateConfigId(null)
        dispatch({ type: 'reset' })

        const details = await getProductDetails(productId)
        if (details) {
          setProduct(details)
          dispatch({ type: 'setMeta', patch: {
            name: details.name || '',
            description: details.description || '',
            icon: details.icon || '',
            operator_percent: (details as any)?.operator_percent !== undefined
              ? String((details as any)?.operator_percent)
              : '',
            category_id: (details as any)?.category_id ?? undefined,
            route_key: (details as any)?.route_key != null ? String((details as any).route_key) : '',
          } })
          void loadParameterPresets(details)
        } else {
          setProduct(null)
          setParameterPresets([])
        }

        setLoadingLists(true)
        const [templateConfig, productMaterials, warehouseMaterials] = await Promise.all([
          getProductTemplateConfig(productId),
          getProductMaterials(productId),
          getAllWarehouseMaterials()
        ])
        if (templateConfig) {
          setTemplateConfigId(templateConfig.id)
          const cfgData = templateConfig.config_data || {}
          const constraints = (templateConfig as { constraints?: { print_sheet?: string | { width?: number; height?: number }; overrides?: { include_ids?: number[] } } }).constraints || {}

          if (cfgData.trim_size) {
            dispatch({ type: 'setTrim', field: 'width', value: String(cfgData.trim_size.width || '') })
            dispatch({ type: 'setTrim', field: 'height', value: String(cfgData.trim_size.height || '') })
          }

          if (Array.isArray(cfgData.finishing)) {
            dispatch({ type: 'setFinishing', value: cfgData.finishing.map((item: unknown) => {
              if (typeof item === 'string') {
                return { name: item }
              }
              const obj = item as { name?: string }
              return { name: String(obj?.name || item) }
            }) })
          }

          if (Array.isArray(cfgData.packaging)) {
            dispatch({ type: 'setPackaging', value: cfgData.packaging.map((item: unknown) => {
              if (typeof item === 'string') {
                return { name: item }
              }
              const obj = item as { name?: string }
              return { name: String(obj?.name || item) }
            }) })
          }

          if (cfgData.print_run) {
            dispatch({ type: 'setRun', patch: { enabled: !!cfgData.print_run.enabled } })
            dispatch({ type: 'setRun', patch: { min: typeof cfgData.print_run.min === 'number' ? cfgData.print_run.min : '' } })
            dispatch({ type: 'setRun', patch: { max: typeof cfgData.print_run.max === 'number' ? cfgData.print_run.max : '' } })
          }

          if (Array.isArray(cfgData.price_rules)) {
            dispatch({
              type: 'setRules',
              value: cfgData.price_rules.map((rule: unknown) => {
                const r = rule as { min_qty?: number; max_qty?: number | null; unit_price?: number | null; discount_percent?: number | null }
                return {
                  min_qty: Number(r.min_qty || 0),
                  max_qty: r.max_qty !== undefined && r.max_qty !== null ? Number(r.max_qty) : undefined,
                  unit_price: r.unit_price !== undefined && r.unit_price !== null ? Number(r.unit_price) : undefined,
                  discount_percent:
                    r.discount_percent !== undefined && r.discount_percent !== null
                      ? Number(r.discount_percent)
                      : undefined
                }
              })
            })
          }

          // 🆕 Упрощённый калькулятор (конфиг по размерам)
          if (cfgData.simplified && typeof cfgData.simplified === 'object') {
            dispatch({ type: 'setSimplified', value: cfgData.simplified as any })
          } else {
            dispatch({ type: 'setSimplified', value: defaultSimplifiedConfig })
          }

          if (constraints.print_sheet) {
            const sheet = constraints.print_sheet
            if (typeof sheet === 'string') {
              dispatch({ type: 'setPrintSheet', patch: { preset: sheet as 'SRA3' | 'A3' | 'А4' | '', width: '', height: '' } })
            } else if (sheet && typeof sheet === 'object') {
              dispatch({ type: 'setPrintSheet', patch: { preset: '', width: String(sheet.width || ''), height: String(sheet.height || '') } })
            }
          }

          if (constraints?.overrides) {
            const includeIds = Array.isArray(constraints.overrides.include_ids) 
              ? constraints.overrides.include_ids.filter((id): id is number => typeof id === 'number')
              : []
            const overridesAny = constraints.overrides as any
            const allowedPaperTypes = Array.isArray(overridesAny.allowed_paper_types)
              ? overridesAny.allowed_paper_types.filter((pt: any): pt is string => typeof pt === 'string')
              : Array.isArray(overridesAny.allowedPaperTypes)
                ? overridesAny.allowedPaperTypes.filter((pt: any): pt is string => typeof pt === 'string')
                : []
            const allowedPriceTypes = Array.isArray(overridesAny.allowed_price_types)
              ? overridesAny.allowed_price_types.filter((k: any): k is string => typeof k === 'string')
              : Array.isArray((constraints as any).allowed_price_types)
                ? (constraints as any).allowed_price_types.filter((k: any): k is string => typeof k === 'string')
                : []
            dispatch({ type: 'setOverrides', patch: { includeIds, allowedPaperTypes, allowedPriceTypes } })
          }
        }
        if (!templateConfig) {
          dispatch({ type: 'setSimplified', value: defaultSimplifiedConfig })
        }

        setMaterials(productMaterials || [])
        setAllMaterials(warehouseMaterials || [])

        const productParameters = details?.parameters || []
        setParameters(productParameters)

        const initParams: Record<string, unknown> = {}
        for (const param of productParameters) {
          const key = param.name || param.label
          if (!key) continue
          if (param.type === 'select' && Array.isArray(param.options) && param.options.length > 0) {
            initParams[key] = param.options[0]
          } else if (param.type === 'checkbox') {
            initParams[key] = false // Checkbox по умолчанию выключен
          } else if (param.type === 'number' || param.type === 'range') {
            initParams[key] = param.min_value ?? 0
          } else {
            initParams[key] = ''
          }
        }
        dispatch({ type: 'setTestParams', value: initParams })

        try {
          let firstMaterialId = productMaterials?.[0]?.material_id || (productMaterials?.[0] as { id?: number })?.id
          if (!firstMaterialId && templateConfig) {
            const templateOverrides = (templateConfig as { constraints?: { overrides?: { include_ids?: number[] } } })?.constraints?.overrides?.include_ids
            if (Array.isArray(templateOverrides) && templateOverrides.length > 0) {
              firstMaterialId = templateOverrides[0]
            }
          }
          if (firstMaterialId) {
            dispatch({
              type: 'setTestParams',
              value: { ...(state.test.params || {}), material_id: Number(firstMaterialId) }
            })
          }
        } catch (error) {
          console.warn('Unable to preselect material for quick test', error)
        }
      } catch (error) {
        console.error('Failed to load product template', error)
      } finally {
        setLoading(false)
        setLoadingLists(false)
      }
    }

    void load()
  }, [productId, dispatch, loadParameterPresets])

  const buildConfigData = useCallback(() => {
    const isMultiPageProduct = (product as any)?.product_type === 'multi_page'
    const simplifiedConfig = isMultiPageProduct
      ? state.simplified
      : (({ pages, ...rest }) => rest)(state.simplified)
    return {
      trim_size: {
        width: Number(state.trim_size.width) || state.trim_size.width,
        height: Number(state.trim_size.height) || state.trim_size.height
      },
      finishing: state.finishing,
      packaging: state.packaging,
      print_run: {
        enabled: state.print_run.enabled,
        min: state.print_run.min || undefined,
        max: state.print_run.max || undefined
      },
      price_rules: state.price_rules,
      simplified: simplifiedConfig
    }
  }, [product, state.trim_size.width, state.trim_size.height, state.finishing, state.packaging, state.print_run.enabled, state.print_run.min, state.print_run.max, state.price_rules, state.simplified])

  const buildConstraints = useCallback(() => ({
    print_sheet: state.print_sheet.preset
      ? state.print_sheet.preset
      : {
          width: Number(state.print_sheet.width) || state.print_sheet.width,
          height: Number(state.print_sheet.height) || state.print_sheet.height
        },
    overrides: { 
      include_ids: state.constraints.overrides.includeIds, // Старое поле для обратной совместимости
      allowed_paper_types: state.constraints.overrides.allowedPaperTypes, // Новое поле для типов бумаги
      allowed_price_types: state.constraints.overrides.allowedPriceTypes ?? []
    }
  }), [state.print_sheet.preset, state.print_sheet.width, state.print_sheet.height, state.constraints.overrides.includeIds, state.constraints.overrides.allowedPaperTypes, state.constraints.overrides.allowedPriceTypes])

  const persistTemplateConfig = useCallback(
    async (message: string) => {
      if (!productId) return
      try {
        setSaving(true)
        const constraints = buildConstraints()
        const payload = {
          name: 'template',
          is_active: true,
          config_data: buildConfigData(),
          constraints
        }

        console.log('💾 [useProductTemplatePage] Сохраняем constraints:', {
          productId,
          constraints,
          allowedPaperTypes: constraints?.overrides?.allowed_paper_types,
          fullPayload: payload
        })

        if (templateConfigId) {
          await updateProductConfig(productId, templateConfigId, payload)
        } else {
          const created = await createProductConfig(productId, payload)
          setTemplateConfigId(created.id)
        }

        console.log('✅ [useProductTemplatePage] Constraints сохранены успешно')
        if (message) alert(message)
      } catch (error) {
        console.error('Failed to persist template config', error)
        alert('Ошибка сохранения шаблона')
      } finally {
        setSaving(false)
      }
    },
    [productId, templateConfigId, buildConfigData, buildConstraints]
  )

  // Функция для сохранения размера с автоматическим созданием/обновлением параметра "format"
  const persistTrimSizeWithFormat = useCallback(
    async (message: string) => {
      if (!productId) return
      
      const width = state.trim_size.width?.trim()
      const height = state.trim_size.height?.trim()
      
      if (!width || !height || isNaN(Number(width)) || isNaN(Number(height))) {
        alert('Укажите корректные значения ширины и высоты')
        return
      }

      try {
        setSaving(true)
        
        // 1. Сохраняем размер в конфигурацию шаблона
        const payload = {
          name: 'template',
          is_active: true,
          config_data: buildConfigData(),
          constraints: buildConstraints()
        }

        if (templateConfigId) {
          await updateProductConfig(productId, templateConfigId, payload)
        } else {
          const created = await createProductConfig(productId, payload)
          setTemplateConfigId(created.id)
        }

        // 2. Создаем или обновляем параметр "format"
        const formatValue = `${width}×${height}`
        const formatParam = parameters.find(p => p.name === 'format')
        
        if (formatParam) {
          // Параметр уже существует - обновляем его опции
          let currentOptions: string[] = []
          
          if (Array.isArray(formatParam.options)) {
            currentOptions = formatParam.options
          } else if (formatParam.options) {
            // Если options - строка, пытаемся разбить по разделителю
            const optionsStr = String(formatParam.options)
            currentOptions = optionsStr.includes(';') 
              ? optionsStr.split(';').map((s: string) => s.trim()).filter(Boolean)
              : [optionsStr.trim()].filter(Boolean)
          }
          
          // Добавляем новый размер, если его еще нет
          if (!currentOptions.includes(formatValue)) {
            const updatedOptions = [...currentOptions, formatValue]
            // updateProductParameter автоматически преобразует массив в JSON строку
            // Передаем все поля параметра, так как бэкенд ожидает все поля при обновлении
            const updated = await updateProductParameter(productId, formatParam.id, {
              name: formatParam.name,
              type: formatParam.type,
              label: formatParam.label,
              options: updatedOptions, // Массив будет преобразован в JSON строку в updateProductParameter
              min_value: formatParam.min_value ?? undefined,
              max_value: formatParam.max_value ?? undefined,
              step: formatParam.step ?? undefined,
              default_value: formatParam.default_value ?? undefined,
              is_required: formatParam.is_required,
              sort_order: formatParam.sort_order
            })
            
            // Обновляем локальное состояние параметров
            setParameters(prev => prev.map(p => 
              p.id === formatParam.id 
                ? { ...p, options: Array.isArray(updated.options) ? updated.options : updatedOptions }
                : p
            ))
            
            // Обновляем test.params чтобы новый размер был выбран по умолчанию
            dispatch({ 
              type: 'setTestParams', 
              value: { ...(state.test.params || {}), format: formatValue } 
            })
          } else {
            // Размер уже есть - просто обновляем test.params
            dispatch({ 
              type: 'setTestParams', 
              value: { ...(state.test.params || {}), format: formatValue } 
            })
          }
        } else {
          // Параметр не существует - создаем его
          // createProductParameter автоматически преобразует массив в JSON строку
          const created = await createProductParameter(productId, {
            name: 'format',
            type: 'select',
            label: 'Формат',
            options: [formatValue], // Массив будет преобразован в JSON строку в createProductParameter
            is_required: true,
            sort_order: parameters.length
          })
          
          setParameters(prev => {
            const updated = [...prev, created]
            // Обновляем test.params для нового параметра
            dispatch({ type: 'setTestParams', value: { ...(state.test.params || {}), format: formatValue } })
            return updated
          })
        }

        if (message) alert(message)
      } catch (error) {
        console.error('Failed to persist trim size with format', error)
        alert('Ошибка сохранения размера')
      } finally {
        setSaving(false)
      }
    },
    [productId, templateConfigId, buildConfigData, buildConstraints, state.trim_size, parameters, state.test.params, dispatch]
  )

  const handleMetaSave = useCallback(async () => {
    if (!productId) return
    try {
      setSaving(true)
      const operatorPercentValue =
        state.meta.operator_percent !== ''
          ? Number(state.meta.operator_percent)
          : undefined
      const rk = state.meta.route_key?.trim()
        ? state.meta.route_key.trim().toLowerCase()
        : null
      await updateProduct(productId, {
        name: state.meta.name,
        description: state.meta.description,
        icon: state.meta.icon,
        category_id: state.meta.category_id ?? 0,
        route_key: rk,
        ...(operatorPercentValue !== undefined && Number.isFinite(operatorPercentValue)
          ? { operator_percent: operatorPercentValue }
          : {})
      } as any)
      alert('Основные данные обновлены')
    } catch (error) {
      console.error('Failed to update product metadata', error)
      alert('Ошибка сохранения метаданных')
    } finally {
      setSaving(false)
    }
  }, [productId, state.meta.name, state.meta.description, state.meta.icon, state.meta.operator_percent, state.meta.category_id, state.meta.route_key])

  const refreshMaterials = useCallback(async (id: number) => {
    const fresh = await getProductMaterials(id)
    setMaterials(fresh)
  }, [])

  const handleAddMaterial = useCallback(
    async (payload: { material_id: number; qty_per_sheet?: number; is_required?: boolean }) => {
      if (!productId) return
      try {
        await addProductMaterial(productId, { ...payload, is_required: payload.is_required ?? true })
        await refreshMaterials(productId)
      } catch (error) {
        console.error('Failed to add material', error)
        alert('Ошибка добавления материала')
      }
    },
    [productId, refreshMaterials]
  )

  const handleUpdateMaterialQuantity = useCallback(
    async (materialId: number, qty: number, isRequired = true) => {
      if (!productId) return
      try {
        await addProductMaterial(productId, {
          material_id: materialId,
          qty_per_sheet: qty,
          is_required: isRequired
        })
        await refreshMaterials(productId)
      } catch (error) {
        console.error('Failed to update material quantity', error)
        alert('Ошибка обновления материала')
      }
    },
    [productId, refreshMaterials]
  )

  const handleBulkAddMaterials = useCallback(
    async (materials: Array<{ material_id: number; qty_per_sheet?: number; is_required?: boolean }>) => {
      if (!productId) return
      try {
        const { bulkAddProductMaterials } = await import('../../../services/products')
        await bulkAddProductMaterials(productId, materials)
        await refreshMaterials(productId)
      } catch (error) {
        console.error('Failed to bulk add materials', error)
        alert('Ошибка массового добавления материалов')
        throw error
      }
    },
    [productId, refreshMaterials]
  )

  const handleBulkAddOperations = useCallback(
    async (operations: Array<{
      operation_id: number;
      sequence?: number;
      is_required?: boolean;
      is_default?: boolean;
      price_multiplier?: number;
    }>): Promise<unknown[]> => {
      if (!productId) return []
      try {
        const { bulkAddProductOperations } = await import('../../../services/products')
        await bulkAddProductOperations(productId, operations)
        // Перезагружаем операции через API
        const { apiClient } = await import('../../../api/client')
        const response = await apiClient.get(`/products/${productId}/operations`)
        const ops = response.data?.data || response.data || []
        return Array.isArray(ops) ? ops : []
      } catch (error) {
        console.error('Failed to bulk add operations', error)
        alert('Ошибка массового добавления операций')
        throw error
      }
    },
    [productId]
  )

  const handleRemoveMaterial = useCallback(
    async (material: ProductMaterialLink) => {
      if (!productId) return
      try {
        const materialId = material.material_id || material.id
        if (!materialId) return
        await removeProductMaterial(productId, materialId)
        setMaterials((prev) => prev.filter(item => (item.material_id || item.id) !== materialId))
      } catch (error) {
        console.error('Failed to remove material', error)
        alert('Ошибка удаления материала')
      }
    },
    [productId]
  )

  const handleAddParameter = useCallback(
    async (param: Partial<ProductParameter>) => {
      if (!productId || !param.name || !param.type || !param.label) return
      try {
        const created = await createProductParameter(productId, { 
          name: param.name,
          type: param.type,
          label: param.label,
          options: param.options,
          min_value: param.min_value,
          max_value: param.max_value,
          step: param.step,
          default_value: param.default_value,
          is_required: !!param.is_required,
          sort_order: parameters.length
        })
        setParameters(prev => {
          const updated = [...prev, created]
          // Обновляем test.params для нового параметра
          const key = created.name || created.label
          if (key) {
            const defaultValue = created.type === 'select' && Array.isArray(created.options) && created.options.length > 0
              ? created.options[0]
              : created.type === 'checkbox'
                ? false
                : created.type === 'number' || created.type === 'range'
                  ? created.min_value ?? 0
                  : ''
            dispatch({ type: 'setTestParams', value: { ...(state.test.params || {}), [key]: defaultValue } })
          }
          return updated
        })
      } catch (error) {
        console.error('Failed to create parameter', error)
        alert('Ошибка добавления параметра')
      }
    },
    [productId, parameters.length, state.test.params, dispatch]
  )

  const handleUpdateParameter = useCallback(
    async (param: Partial<ProductParameter> & { id: number }) => {
      if (!productId || !param.id) return
      try {
        const updated = await updateProductParameter(productId, param.id, param)
        setParameters(prev => {
          const newParams = prev.map(item => item.id === param.id ? updated : item)
          // Обновляем test.params если изменился тип или опции
          const key = updated.name || updated.label
          if (key && state.test.params) {
            const currentValue = state.test.params[key]
            // Если тип изменился - сбрасываем значение
            if (updated.type === 'select' && Array.isArray(updated.options) && updated.options.length > 0) {
              if (!updated.options.includes(currentValue)) {
                dispatch({ type: 'setTestParams', value: { ...state.test.params, [key]: updated.options[0] } })
              }
            }
          }
          return newParams
        })
      } catch (error) {
        console.error('Failed to update parameter', error)
        alert('Ошибка обновления параметра')
      }
    },
    [productId, state.test.params, dispatch]
  )

  const handleRemoveParameter = useCallback(
    async (param: { id: number; name?: string; label?: string }) => {
      if (!productId) return
      try {
        await deleteProductParameter(productId, param.id)
        setParameters(prev => {
          const filtered = prev.filter(item => item.id !== param.id)
          // Удаляем из test.params
          const key = param.name || param.label
          if (key && state.test.params) {
            const { [key]: removed, ...rest } = state.test.params as Record<string, unknown>
            dispatch({ type: 'setTestParams', value: rest })
          }
          return filtered
        })
      } catch (error) {
        console.error('Failed to delete parameter', error)
        alert('Ошибка удаления параметра')
      }
    },
    [productId, state.test.params, dispatch]
  )

  const summaryStats = useMemo(() => {
    const isSimplified =
      (product as any)?.calculator_type === 'simplified' ||
      (product as any)?.product_type === 'multi_page'
    const routeKeyDisplay = (product as any)?.route_key?.trim()
      ? String((product as any).route_key).trim()
      : 'не задан'
    const base = [
      { label: 'ID продукта', value: productId || '—' },
      { label: 'Ключ URL продукта (route_key)', value: routeKeyDisplay },
      { label: 'Шаблон', value: templateConfigId ? 'Настроен' : '—' },
    ]
    if (isSimplified) {
      const sizes = state.simplified?.sizes || []
      const types = state.simplified?.types || []
      return [
        ...base,
        { label: 'Размеров', value: sizes.length },
        { label: 'Типов', value: types.length },
        { label: 'Материалы', value: materials.length || sizes.reduce((s, sz) => s + (sz.allowed_material_ids?.length || 0), 0) },
      ]
    }
    return [
      ...base,
      { label: 'Материалы', value: materials.length },
      { label: 'Отделка', value: state.finishing.length },
      { label: 'Упаковка', value: state.packaging.length },
      { label: 'Правила цены', value: state.price_rules.length },
    ]
  }, [productId, product, templateConfigId, materials.length, state.finishing.length, state.packaging.length, state.price_rules.length, state.simplified])

  const quickTestMaterials = useMemo((): ProductMaterialLink[] => {
    if (materials?.length) return materials
    const include = state.constraints.overrides.includeIds || []
    if (!include.length) return []
    return allMaterials
      .filter((material) => include.includes(material.id))
      .map((material) => ({
        material_id: material.id,
        material_name: material.name,
        category_name: (material as { category_name?: string }).category_name,
        qty_per_sheet: 1,
        is_required: false
      }))
  }, [materials, allMaterials, state.constraints.overrides.includeIds])

  const handleQuickTestCalculate = useCallback(
    async ({ qty, params }: QuickTestPayload) => {
      if (!productId) return null
      try {
        const mergedParams = {
          ...params,
          trim_size: {
            width: Number(state.trim_size.width) || state.trim_size.width,
            height: Number(state.trim_size.height) || state.trim_size.height
          },
          print_sheet: state.print_sheet.preset
            ? state.print_sheet.preset
            : {
                width: Number(state.print_sheet.width) || state.print_sheet.width,
                height: Number(state.print_sheet.height) || state.print_sheet.height
              }
        }

        return await calculatePrice({ product_id: productId, quantity: qty, channel: 'online', params: mergedParams })
      } catch (error: unknown) {
        console.error('Quick test failed', error)
        const errorObj = error as { response?: { data?: { error?: string; message?: string } }; message?: string }
        console.error('Error details:', errorObj?.response?.data)
        const message = errorObj?.response?.data?.error || errorObj?.response?.data?.message || errorObj?.message || 'Ошибка расчёта'
        alert(`Ошибка расчёта: ${message}`)
        return null
      }
    },
    [productId, state.trim_size.width, state.trim_size.height, state.print_sheet.preset, state.print_sheet.width, state.print_sheet.height]
  )

  const currentMaterialId = (state.test.params as Record<string, unknown>)?.material_id as number | undefined

  const refreshProduct = useCallback(async () => {
    if (!productId) return
    const details = await getProductDetails(productId)
    if (details) {
      setProduct(details)
      dispatch({
        type: 'setMeta',
        patch: {
          route_key: (details as any)?.route_key != null ? String((details as any).route_key) : '',
        },
      })
    }
  }, [productId, dispatch])

  return {
    state,
    dispatch,
    product,
    templateConfigId,
    loading,
    loadingLists,
    saving,
    parameters,
    materials,
    allMaterials,
  parameterPresets,
  parameterPresetsLoading,
    summaryStats,
    quickTestMaterials,
    currentMaterialId,
    persistTemplateConfig,
    persistTrimSizeWithFormat,
    handleMetaSave,
    handleAddMaterial,
    handleUpdateMaterialQuantity,
    handleBulkAddMaterials,
    handleBulkAddOperations,
    handleRemoveMaterial,
    handleAddParameter,
    handleUpdateParameter,
    handleRemoveParameter,
    handleQuickTestCalculate,
    refreshProduct,
  }
}

