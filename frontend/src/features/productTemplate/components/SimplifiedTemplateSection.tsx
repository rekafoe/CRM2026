import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Button, FormField, Alert } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig, ProductTypeId } from '../hooks/useProductTemplate'
import { sortSizesByArea, getEffectiveAllowedMaterialIds } from '../hooks/useProductTemplate'
import type { UseSimplifiedTypesResult } from '../hooks/useSimplifiedTypes'
import { PrintPricesCard } from './PrintPricesCard'
import { MaterialsCard } from './MaterialsCard'
import { FinishingCard } from './FinishingCard'
import { SubtypeDesignsCard } from './SubtypeDesignsCard'
import { AddSizeModal, CopySizesModal } from './SizeModals'
import { type Tier, defaultTiers, normalizeTiers } from '../utils/tierManagement'
import { clonePrintBlockFromSize } from '../utils/clonePrintConfig'
import { computeItemsPerSheet } from './PrintSheetSection'
import { ImprovedPrintingCalculatorModal } from '../../../components/calculator/ImprovedPrintingCalculatorModal'
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

export type BindingServiceRow = {
  id: number;
  name: string;
  variants?: Array<{ id: number; variantName?: string; variant_name?: string }>;
}

export type SimplifiedEditorTab = 'print' | 'materials' | 'finishing' | 'design' | 'check'
export type SimplifiedChecklistState = {
  size: boolean
  print: boolean
  materials: boolean
  finishing: boolean
}

export type { ServiceRow }

interface Props {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  onSave: () => void
  saving: boolean
  allMaterials: CalculatorMaterial[]
  showPagesConfig?: boolean
  types: UseSimplifiedTypesResult
  services: ServiceRow[]
  /** ID продукта — нужен для привязки дизайнов к подтипу */
  productId?: number
  bindingServices?: BindingServiceRow[]
  onEditorTabChange?: (tab: SimplifiedEditorTab) => void
  onChecklistChange?: (checklist: SimplifiedChecklistState) => void
}

const uid = () => Date.now() + Math.floor(Math.random() * 1000)

const cloneSizeWithNewId = (size: SimplifiedSizeConfig): SimplifiedSizeConfig => ({
  ...size,
  id: uid(),
  print_prices: (size.print_prices || []).map((pp) => ({
    ...pp,
    tiers: (pp.tiers || []).map((t) => ({ ...t })),
  })),
  allowed_material_ids: [...(size.allowed_material_ids || [])],
  use_own_materials: size.use_own_materials,
  allowed_base_material_ids: [...(size.allowed_base_material_ids || [])],
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
  types,
  services,
  productId,
  bindingServices = [],
  onEditorTabChange,
  onChecklistChange,
}) => {
  const {
    hasTypes,
    selectedTypeId,
    setSelectedTypeId,
    sizes,
    selectedSizeId,
    setSelectedSizeId,
    selected,
    effectiveConfig,
    pagesConfig,
    applyToCurrentConfig,
    updatePagesConfig,
    updateSize,
    removeSize,
    addType,
    setDefaultType,
    removeType,
  } = types

  // Эффективные материалы: общие типа или свои размера (флаг use_own_materials)
  const useOwnMaterials = useMemo(() => {
    if (!hasTypes || !selected) return true
    if (selected.use_own_materials === true) return true
    if (selected.use_own_materials === false) return false
    const common = effectiveConfig.common_allowed_material_ids
    return !common || common.length === 0
  }, [hasTypes, selected, selected?.use_own_materials, effectiveConfig.common_allowed_material_ids])

  const effectiveAllowedMaterialIds = useMemo(() => {
    if (!selected) return []
    if (useOwnMaterials) return selected.allowed_material_ids ?? []
    return effectiveConfig.common_allowed_material_ids ?? []
  }, [selected, useOwnMaterials, effectiveConfig.common_allowed_material_ids])

  // Превью раскладки для текущего размера (override имеет приоритет над cut_margin/cut_gap)
  // Формула точно соответствует layoutCalculationService на бэкенде
  const layoutPreview = useMemo(() => {
    if (!selected || !selected.width_mm || !selected.height_mm) return null
    // Если задан ручной override — используем его без поиска материала
    if (selected.items_per_sheet_override != null && selected.items_per_sheet_override > 0) {
      return { n: selected.items_per_sheet_override, matName: null, sw: 0, sh: 0, isOverride: true, noMat: false }
    }
    const hasMatWithoutSheet = allMaterials.some(
      (m: any) => effectiveAllowedMaterialIds.includes(m.id) && !(Number(m.sheet_width) > 0 && Number(m.sheet_height) > 0),
    )
    const firstMat = allMaterials.find(
      (m: any) =>
        effectiveAllowedMaterialIds.includes(m.id) &&
        Number(m.sheet_width) > 0 &&
        Number(m.sheet_height) > 0,
    )
    if (!firstMat) return { n: 0, matName: null, sw: 0, sh: 0, isOverride: false, noMat: true, hasMatWithoutSheet }
    // Точная формула бэкенда: floor((sheet - margin*2) / (item + gap)) × оба поворота
    const margin = selected.cut_margin_mm != null && selected.cut_margin_mm > 0 ? selected.cut_margin_mm : 5
    const gap = selected.cut_gap_mm != null && selected.cut_gap_mm >= 0 ? selected.cut_gap_mm : 2
    const sw = Number((firstMat as any).sheet_width)
    const sh = Number((firstMat as any).sheet_height)
    const aw = sw - margin * 2
    const ah = sh - margin * 2
    const iw = selected.width_mm, ih = selected.height_mm
    const n1 = Math.floor(aw / (iw + gap)) * Math.floor(ah / (ih + gap))
    const n2 = Math.floor(aw / (ih + gap)) * Math.floor(ah / (iw + gap))
    const n = Math.max(1, n1, n2)
    return { n, matName: (firstMat as any).name ?? '?', sw, sh, isOverride: false, noMat: false, hasMatWithoutSheet: false }
  }, [selected, allMaterials, effectiveAllowedMaterialIds])

  const otherSizesForPrintCopy = useMemo(
    () =>
      sizes
        .filter((s) => selected && String(s.id) !== String(selected.id))
        .map((s) => ({
          id: s.id,
          label: s.label && String(s.label).trim() ? String(s.label) : `${s.width_mm}×${s.height_mm} мм`,
        })),
    [sizes, selected],
  )

  const handleCopyPrintFromSize = useCallback(
    (sourceSizeId: string | number) => {
      const source = sizes.find((s) => String(s.id) === String(sourceSizeId))
      if (!source || !selected) return
      const label =
        source.label && String(source.label).trim()
          ? String(source.label)
          : `${source.width_mm}×${source.height_mm} мм`
      if (
        !window.confirm(
          `Заменить настройки печати текущего размера копией из «${label}»? Материалы и отделка не изменятся.`,
        )
      ) {
        return
      }
      updateSize(selected.id, clonePrintBlockFromSize(source))
    },
    [sizes, selected, updateSize],
  )

  const updateEffectiveMaterials = useCallback(
    (ids: number[]) => {
      if (!selected) return
      if (useOwnMaterials) {
        updateSize(selected.id, { allowed_material_ids: ids })
      } else {
        applyToCurrentConfig((prev) => ({ ...prev, common_allowed_material_ids: ids }))
      }
    },
    [selected, useOwnMaterials, updateSize, applyToCurrentConfig],
  )

  const setUseOwnMaterials = useCallback(
    (v: boolean) => {
      if (!selected) return
      if (v) {
        const common = effectiveConfig.common_allowed_material_ids ?? []
        updateSize(selected.id, { use_own_materials: true, allowed_material_ids: [...common] })
      } else {
        updateSize(selected.id, { use_own_materials: false })
      }
    },
    [selected, effectiveConfig.common_allowed_material_ids, updateSize],
  )

  const [paperTypes, setPaperTypes] = useState<PaperTypeRow[]>([])
  const [printTechs, setPrintTechs] = useState<PrintTechRow[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSize, setNewSize] = useState<{ label: string; width_mm: string; height_mm: string }>({ label: '', width_mm: '', height_mm: '' })
  const [showCopySizes, setShowCopySizes] = useState(false)
  const [copyFromTypeId, setCopyFromTypeId] = useState<ProductTypeId | null>(null)
  const [copySelectedSizeIds, setCopySelectedSizeIds] = useState<(number | string)[]>([])
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [newPageToAdd, setNewPageToAdd] = useState('')
  const [editorTab, setEditorTab] = useState<SimplifiedEditorTab>('print')

  const multiPageStructure = value.multiPageStructure || {}
  const multiPageCover = multiPageStructure.cover || { mode: 'none' }
  const multiPageInnerBlock = multiPageStructure.innerBlock || { pagesSource: 'parameter' as const }
  const multiPageBinding = multiPageStructure.binding || {}

  const updateMultiPageStructure = useCallback((patch: Partial<NonNullable<SimplifiedConfig['multiPageStructure']>>) => {
    onChange({
      ...value,
      multiPageStructure: {
        ...(value.multiPageStructure || {}),
        ...patch,
      },
    })
  }, [onChange, value])

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
    if (effectiveAllowedMaterialIds.length > 0) {
      hasUserInteractedWithMaterialsRef.current = true
    }
  }, [selected, effectiveAllowedMaterialIds])

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [pt, techResp] = await Promise.all([
        getPaperTypesFromWarehouse(),
        getPrintTechnologies().then(r => (Array.isArray(r.data) ? r.data : [])),
      ])
      setPaperTypes(pt || [])
      setPrintTechs((techResp || []).filter((t: any) => t && t.code))

      const typeConfig = hasTypes && selectedTypeId ? value.typeConfigs?.[String(selectedTypeId)] : undefined
      const effectiveIds = typeConfig && selected ? getEffectiveAllowedMaterialIds(typeConfig, selected) : (selected?.allowed_material_ids ?? [])
      if (selected && effectiveIds.length > 0 && pt && pt.length > 0 && !selectedPaperTypeId) {
        for (const paperType of pt) {
          const materialIds = new Set(
            paperType.densities?.map(d => d.material_id).filter(id => id && id > 0) || []
          )
          const hasMatchingMaterial = effectiveIds.some(id => materialIds.has(id))
          if (hasMatchingMaterial && materialIds.size > 0) {
            setSelectedPaperTypeId(paperType.id)
            hasUserInteractedWithMaterialsRef.current = true
            break
          }
        }
      }

      if (pt && pt.length > 0 && !selectedPaperTypeId) {
        setSelectedPaperTypeId(pt[0].id)
      }
    } catch (error) {
      console.error('Ошибка загрузки списков:', error)
    } finally {
      setLoadingLists(false)
    }
  }, [selectedPaperTypeId, selected, hasTypes, selectedTypeId, value.typeConfigs])

  useEffect(() => {
    if (!loadingLists && (paperTypes.length === 0 || printTechs.length === 0)) {
      void loadLists()
    }
  }, [])

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
    applyToCurrentConfig(prev => ({ ...prev, sizes: sortSizesByArea([...(prev.sizes || []), size]) }))
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

  const labelWithHint = useCallback((label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <span>{label}</span>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  ), [])

  const headerWithHint = useCallback((label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <strong>{label}</strong>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  ), [])

  const checklist = useMemo<SimplifiedChecklistState>(() => {
    if (!selected) {
      return {
        size: false,
        print: false,
        materials: false,
        finishing: false,
      }
    }
    const hasPrint =
      Array.isArray(selected.print_prices) &&
      selected.print_prices.some((p) => Array.isArray(p.tiers) && p.tiers.some((t) => Number(t.unit_price ?? 0) > 0))
    return {
      size: Boolean(String(selected.label || '').trim() && selected.width_mm > 0 && selected.height_mm > 0),
      print: hasPrint,
      materials: effectiveAllowedMaterialIds.length > 0,
      finishing: Array.isArray(selected.finishing) && selected.finishing.length > 0,
    }
  }, [selected, effectiveAllowedMaterialIds])

  const quickTestPrintPreset = useMemo(() => {
    if (!selected) return null
    const pp = selected.print_prices || []
    if (pp.length === 0) return null

    const defaultTech = selected.default_print?.technology_code
    const byDefaultTech = defaultTech
      ? pp.filter((row) => String(row.technology_code || '').toLowerCase() === String(defaultTech).toLowerCase())
      : pp
    const nonZero = byDefaultTech.find((row) => (row.tiers || []).some((t) => Number(t.unit_price ?? 0) > 0))
    const row = nonZero || byDefaultTech[0] || pp[0]
    if (!row) return null
    return {
      technology: row.technology_code || defaultTech || '',
      color: (row.color_mode as 'bw' | 'color') || 'color',
      sides: row.sides_mode === 'duplex' || row.sides_mode === 'duplex_bw_back' ? 2 : 1,
    }
  }, [selected])

  useEffect(() => {
    if (editorTab === 'design' && !(productId && selectedTypeId != null)) {
      setEditorTab('print')
    }
  }, [editorTab, productId, selectedTypeId])

  useEffect(() => {
    onEditorTabChange?.(editorTab)
  }, [editorTab, onEditorTabChange])

  useEffect(() => {
    onChecklistChange?.(checklist)
  }, [checklist, onChecklistChange])

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
      sizes: sortSizesByArea([...(prev.sizes || []), ...cloned]),
    }))
    setSelectedSizeId(cloned[0]?.id ?? null)
    closeCopySizesModal()
  }, [applyToCurrentConfig, closeCopySizesModal, copyFromTypeId, copySelectedSizeIds, setSelectedSizeId, value.typeConfigs])

  useEffect(() => {
    if (!showCopySizes || copyFromTypeId == null) return
    const sourceSizes = value.typeConfigs?.[String(copyFromTypeId)]?.sizes ?? []
    setCopySelectedSizeIds((prev) => {
      const filtered = prev.filter((id) => sourceSizes.some((s) => String(s.id) === String(id)))
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
  const updateSizeRanges = useCallback((sizeId: number | string, newRanges: Tier[]) => {
    const size = sizes.find(s => String(s.id) === String(sizeId))
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
  useEffect(() => {
    if (!selected || !selectedPaperTypeId || materialsForSelectedPaperType.length === 0) return
    if (hasUserInteractedWithMaterialsRef.current) return
    if (effectiveAllowedMaterialIds.length > 0) {
      hasUserInteractedWithMaterialsRef.current = true
      return
    }

    const materialsToAdd = materialsForSelectedPaperType.filter(m =>
      !effectiveAllowedMaterialIds.includes(Number(m.id))
    )
    if (materialsToAdd.length > 0) {
      updateEffectiveMaterials([...effectiveAllowedMaterialIds, ...materialsToAdd.map(m => Number(m.id))])
    }
  }, [selectedPaperTypeId, materialsForSelectedPaperType, selected, effectiveAllowedMaterialIds, updateEffectiveMaterials])

  // Отслеживание взаимодействия пользователя с услугами для каждого размера отдельно
  // Ключ - ID размера, значение - был ли пользователь взаимодействовал с услугами
  const hasUserInteractedWithServicesRef = useRef<Map<string | number, boolean>>(new Map())
  
  // Восстанавливаем флаг взаимодействия при смене размера
  useEffect(() => {
    if (!selected) return
    const hasMaterials = effectiveAllowedMaterialIds.length > 0
    // Если размер уже был настроен (есть print_prices или material_prices), 
    // и finishing пустой - значит пользователь явно удалил все услуги
    const hasOtherData = (selected.print_prices && selected.print_prices.length > 0) || 
                        (selected.material_prices && selected.material_prices.length > 0) || hasMaterials
    
    if (hasOtherData && selected.finishing && selected.finishing.length === 0) {
      // Размер был настроен, но услуг нет - пользователь явно удалил их
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
    } else if (selected.finishing && selected.finishing.length > 0) {
      // Есть сохраненные услуги - пользователь выбирал их
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
    }
    // Если размер новый (нет других данных) и finishing пустой - не помечаем как взаимодействие
  }, [selected, effectiveAllowedMaterialIds])
  
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
    const hasMaterials = effectiveAllowedMaterialIds.length > 0
    const hasOtherData = (selected.print_prices && selected.print_prices.length > 0) || 
                        (selected.material_prices && selected.material_prices.length > 0) || hasMaterials
    
    // Если размер был настроен, но услуг нет - не добавляем автоматически
    // (пользователь мог явно удалить их)
    if (hasOtherData) {
      hasUserInteractedWithServicesRef.current.set(selected.id, true)
      return
    }

    // По умолчанию услуги не добавляем — послепечатные включаются вручную
  }, [services, selected, effectiveAllowedMaterialIds, getSizeRanges, updateSize])

  return (
    <div className="simplified-template simplified-template--pricing">
      <div className="simplified-template__header">
        <div>
          <h3>
            {headerWithHint(
              'Упрощённый калькулятор',
              'Настройка цен по размерам: печать (за изделие), материалы (за изделие) и отделка (за рез/биг/фальц).',
            )}
          </h3>
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

      {showPagesConfig && (
        <div className="simplified-card">
          <div className="simplified-card__header">
            <div>
              {headerWithHint(
                'Страницы (для многостраничных изделий)',
                'Привяжите к продукту варианты количества страниц — они появятся в калькуляторе.',
              )}
            </div>
          </div>
          <div className="simplified-card__content simplified-pages-config">
            <FormField label="Привязанные варианты">
              <div className="simplified-pages-list">
                {(pagesConfig.options || []).length === 0 ? (
                  <span className="text-muted text-sm">Нет привязанных вариантов.</span>
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

      {showPagesConfig && (
        <div className="simplified-card">
          <div className="simplified-card__header">
            <div>
              {headerWithHint(
                'Структура многостраничного изделия',
                'Настройка обложки, внутреннего блока и переплёта.',
              )}
            </div>
          </div>
          <div className="simplified-card__content simplified-form-grid">
            <FormField label="Источник страниц внутреннего блока">
              <select
                className="form-select"
                value={multiPageInnerBlock.pagesSource || 'parameter'}
                onChange={(e) => updateMultiPageStructure({
                  innerBlock: {
                    ...multiPageInnerBlock,
                    pagesSource: e.target.value as 'parameter' | 'fixed',
                  }
                })}
              >
                <option value="parameter">Из параметра pages</option>
                <option value="fixed">Фиксированное значение</option>
              </select>
            </FormField>
            {multiPageInnerBlock.pagesSource === 'fixed' && (
              <FormField label="Фиксированное число страниц">
                <input
                  className="form-input form-input--compact"
                  type="number"
                  min="1"
                  value={multiPageInnerBlock.fixedPages ?? ''}
                  onChange={(e) => updateMultiPageStructure({
                    innerBlock: {
                      ...multiPageInnerBlock,
                      fixedPages: e.target.value ? Number(e.target.value) : undefined,
                    }
                  })}
                />
              </FormField>
            )}
            <FormField label="Обложка">
              <select
                className="form-select"
                value={multiPageCover.mode || 'none'}
                onChange={(e) => updateMultiPageStructure({
                  cover: {
                    ...multiPageCover,
                    mode: e.target.value as 'none' | 'self' | 'separate',
                  }
                })}
              >
                <option value="none">Без отдельной обложки</option>
                <option value="self">Та же бумага/печать, что блок</option>
                <option value="separate">Отдельные настройки обложки</option>
              </select>
            </FormField>
            {multiPageCover.mode === 'separate' && (
              <>
                <FormField label="Материал обложки (ID)">
                  <input
                    className="form-input form-input--compact"
                    type="number"
                    min="1"
                    value={multiPageCover.material_id ?? ''}
                    onChange={(e) => updateMultiPageStructure({
                      cover: {
                        ...multiPageCover,
                        material_id: e.target.value ? Number(e.target.value) : undefined,
                      }
                    })}
                  />
                </FormField>
                <FormField label="Печать обложки: технология">
                  <input
                    className="form-input"
                    value={multiPageCover.print?.technology_code || ''}
                    onChange={(e) => updateMultiPageStructure({
                      cover: {
                        ...multiPageCover,
                        print: {
                          ...(multiPageCover.print || {}),
                          technology_code: e.target.value || undefined,
                        }
                      }
                    })}
                    placeholder="Например: laser_prof"
                  />
                </FormField>
              </>
            )}
            <FormField label="Экземпляров обложки на изделие">
              <input
                className="form-input form-input--compact"
                type="number"
                min="1"
                value={multiPageCover.qty_per_item ?? 1}
                onChange={(e) => updateMultiPageStructure({
                  cover: {
                    ...multiPageCover,
                    qty_per_item: e.target.value ? Number(e.target.value) : 1,
                  }
                })}
              />
            </FormField>
            <FormField label="Переплёт (service_id)">
              <select
                className="form-select"
                value={multiPageBinding.service_id ?? ''}
                onChange={(e) => {
                  const nextServiceId = e.target.value ? Number(e.target.value) : undefined
                  updateMultiPageStructure({
                    binding: {
                      ...multiPageBinding,
                      service_id: nextServiceId,
                      variant_id: undefined,
                    }
                  })
                }}
              >
                <option value="">— Не выбран</option>
                {bindingServices.map((binding) => (
                  <option key={binding.id} value={binding.id}>{binding.name}</option>
                ))}
              </select>
            </FormField>
            {multiPageBinding.service_id && (
              <FormField label="Вариант переплёта">
                <select
                  className="form-select"
                  value={multiPageBinding.variant_id ?? ''}
                  onChange={(e) => updateMultiPageStructure({
                    binding: {
                      ...multiPageBinding,
                      variant_id: e.target.value ? Number(e.target.value) : undefined,
                    }
                  })}
                >
                  <option value="">— Базовый тариф услуги</option>
                  {(bindingServices.find((b) => b.id === multiPageBinding.service_id)?.variants || []).map((variant) => {
                    const label = variant.variantName || variant.variant_name || `Вариант #${variant.id}`
                    return <option key={variant.id} value={variant.id}>{label}</option>
                  })}
                </select>
              </FormField>
            )}
            <FormField label="Норма переплёта на изделие">
              <input
                className="form-input form-input--compact"
                type="number"
                min="1"
                value={multiPageBinding.units_per_item ?? 1}
                onChange={(e) => updateMultiPageStructure({
                  binding: {
                    ...multiPageBinding,
                    units_per_item: e.target.value ? Number(e.target.value) : 1,
                  }
                })}
              />
            </FormField>
          </div>
        </div>
      )}

      <div className="product-tabs simplified-template__editor-tabs">
        <button
          type="button"
          className={`product-tab ${editorTab === 'print' ? 'product-tab--active' : ''}`}
          onClick={() => setEditorTab('print')}
        >
          Печать
        </button>
        <button
          type="button"
          className={`product-tab ${editorTab === 'materials' ? 'product-tab--active' : ''}`}
          onClick={() => setEditorTab('materials')}
        >
          Материалы
        </button>
        <button
          type="button"
          className={`product-tab ${editorTab === 'finishing' ? 'product-tab--active' : ''}`}
          onClick={() => setEditorTab('finishing')}
        >
          Отделка
        </button>
        {productId && selectedTypeId != null && (
          <button
            type="button"
            className={`product-tab ${editorTab === 'design' ? 'product-tab--active' : ''}`}
            onClick={() => setEditorTab('design')}
          >
            Дизайны
          </button>
        )}
        <button
          type="button"
          className={`product-tab ${editorTab === 'check' ? 'product-tab--active' : ''}`}
          onClick={() => setEditorTab('check')}
        >
          Проверка
        </button>
      </div>

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
          {sizes.length === 0 ? (
            <div className="simplified-template__sizes-empty text-muted text-sm" style={{ padding: 12 }}>
              Нет размеров.
            </div>
          ) : (
            sizes.map(s => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={`simplified-size ${String(selectedSizeId) === String(s.id) ? 'simplified-size--active' : ''}`}
                onClick={() => setSelectedSizeId(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedSizeId(s.id)
                  }
                }}
              >
                <div className="simplified-size__top">
                  <div className="simplified-size__label">{s.label}</div>
                  <button
                    type="button"
                    className="simplified-size__delete"
                    title="Удалить размер"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSize(s.id)
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="simplified-size__meta">{s.width_mm}×{s.height_mm}</div>
              </div>
            ))
          )}
        </div>

        <div className="simplified-template__editor">
          {!selected ? (
            <Alert type="info">
              {sizes.length === 0 ? 'Добавьте размер.' : 'Выберите размер.'}
            </Alert>
          ) : (
              <>
                {editorTab === 'print' && (
                  <div className="simplified-card simplified-card--size">
                    <div className="simplified-card__header">
                      <div>
                        {headerWithHint('Размер', 'Название и габариты (мм).')}
                      </div>
                    </div>
                    <div className="simplified-card__content simplified-form-grid">
                      <FormField label="Название">
                        <input
                          className="form-input simplified-size-input simplified-size-input--name"
                          value={selected.label}
                          onChange={(e) => updateSize(selected.id, { label: e.target.value })}
                        />
                      </FormField>
                      <FormField label="Ширина, мм">
                        <input
                          className="form-input form-input--compact simplified-size-input"
                          value={String(selected.width_mm)}
                          onChange={(e) => updateSize(selected.id, { width_mm: Number(e.target.value) || 0 })}
                        />
                      </FormField>
                      <FormField label="Высота, мм">
                        <input
                          className="form-input form-input--compact simplified-size-input"
                          value={String(selected.height_mm)}
                          onChange={(e) => updateSize(selected.id, { height_mm: Number(e.target.value) || 0 })}
                        />
                      </FormField>
                      <FormField label={labelWithHint('Мин. тираж', 'Пусто = мин. по раскладке (1 лист). 1 = любой тираж, стоимость за полный лист.')}>
                        <input
                          className="form-input form-input--compact simplified-size-input"
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
                      </FormField>
                      <FormField label="Макс. тираж">
                        <input
                          className="form-input form-input--compact simplified-size-input"
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
                      <FormField label={labelWithHint('Отступ резки, мм', 'Отступ с каждой стороны листа (мм). По умолчанию 5 мм. Для наклеек с плоттерной резкой — 15 мм.')}>
                        <input
                          className="form-input form-input--compact simplified-size-input"
                          type="number"
                          min="1"
                          max="50"
                          placeholder="5"
                          title="Отступ с каждой стороны листа (мм). По умолчанию 5 мм. Для наклеек с плоттерной резкой — 15 мм."
                          value={selected.cut_margin_mm !== undefined ? String(selected.cut_margin_mm) : ''}
                          onChange={(e) =>
                            updateSize(selected.id, {
                              cut_margin_mm: e.target.value ? Number(e.target.value) : undefined,
                              ...(selected.items_per_sheet_override == null ? { min_qty: undefined } : {}),
                            })
                          }
                        />
                      </FormField>
                      <FormField label={labelWithHint('Зазор между изделиями, мм', 'Зазор между изделиями при раскладке (мм). По умолчанию 2 мм.')}>
                        <input
                          className="form-input form-input--compact simplified-size-input"
                          type="number"
                          min="0"
                          max="30"
                          placeholder="2"
                          title="Зазор между изделиями при раскладке (мм). По умолчанию 2 мм."
                          value={selected.cut_gap_mm !== undefined ? String(selected.cut_gap_mm) : ''}
                          onChange={(e) =>
                            updateSize(selected.id, {
                              cut_gap_mm: e.target.value !== '' ? Number(e.target.value) : undefined,
                              ...(selected.items_per_sheet_override == null ? { min_qty: undefined } : {}),
                            })
                          }
                        />
                      </FormField>
                      <FormField label={labelWithHint('Норма вместимости на лист', 'Ручной override: сколько изделий помещается на лист. Пусто = считать по отступу и зазору автоматически. Значение также записывается в мин. тираж.')}>
                        <input
                          className="form-input form-input--compact simplified-size-input"
                          type="number"
                          min="1"
                          placeholder="авто"
                          title="Ручной override: сколько изделий помещается на лист. Перекрывает автоматический расчёт по отступам и зазорам."
                          value={selected.items_per_sheet_override !== undefined ? String(selected.items_per_sheet_override) : ''}
                          onChange={(e) => {
                            const val = e.target.value !== '' ? Number(e.target.value) : undefined
                            updateSize(selected.id, {
                              items_per_sheet_override: val,
                              min_qty: val,
                            })
                          }}
                        />
                      </FormField>
                    </div>
                    {layoutPreview && !layoutPreview.noMat && (
                      <div className={`simplified-layout-preview${layoutPreview.isOverride ? ' simplified-layout-preview--override' : ''}`}>
                        <span className="simplified-layout-preview__label">Раскладка</span>
                        <span className="simplified-layout-preview__value">
                          <strong>{layoutPreview.n} шт/лист</strong>
                          {layoutPreview.isOverride ? (
                            <span style={{ color: '#7c3aed', marginLeft: 6 }}>ручная норма</span>
                          ) : (
                            <>
                              {layoutPreview.matName && (
                                <span className="text-muted"> · {layoutPreview.matName} ({layoutPreview.sw}×{layoutPreview.sh} мм)</span>
                              )}
                              {(selected.cut_margin_mm != null && selected.cut_margin_mm !== 5) && (
                                <span style={{ color: '#e65100', marginLeft: 6 }}>отступ {selected.cut_margin_mm} мм</span>
                              )}
                              {(selected.cut_gap_mm != null && selected.cut_gap_mm !== 2) && (
                                <span style={{ color: '#e65100', marginLeft: 6 }}>зазор {selected.cut_gap_mm} мм</span>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {editorTab === 'check' && (
                  <div className="simplified-card simplified-card--inline-calculator">
                    <div className="simplified-card__header">
                      <div>
                        {headerWithHint(
                          'Быстрый просчёт продукта',
                          'Полноценный improved printing калькулятор внутри страницы для проверки расчёта.',
                        )}
                      </div>
                    </div>
                    <div className="simplified-card__content">
                      {productId ? (
                        <ImprovedPrintingCalculatorModal
                          isOpen
                          embedded
                          readOnlyTestMode
                          onClose={() => {}}
                          onAddToOrder={() => {}}
                          initialProductId={productId}
                          initialTestConfig={{
                            typeId: selectedTypeId != null ? Number(selectedTypeId) : undefined,
                            sizeId: selected?.id,
                            printTechnology: quickTestPrintPreset?.technology,
                            printColorMode: quickTestPrintPreset?.color,
                            sides: quickTestPrintPreset?.sides as 1 | 2 | undefined,
                            quantity: selected?.min_qty && Number(selected.min_qty) > 0 ? Number(selected.min_qty) : 1,
                            pages: showPagesConfig ? (pagesConfig.default ?? pagesConfig.options?.[0] ?? undefined) : undefined,
                          }}
                        />
                      ) : (
                        <Alert type="info">Невозможно открыть калькулятор: отсутствует ID продукта.</Alert>
                      )}
                    </div>
                  </div>
                )}

                {editorTab === 'print' && (
                  <PrintPricesCard
                    selected={selected}
                    printTechs={printTechs}
                    loadingLists={loadingLists}
                    isMobile={isMobile}
                    updateSize={updateSize}
                    getSizeRanges={getSizeRanges}
                    updateSizeRanges={updateSizeRanges}
                    allMaterials={allMaterials}
                    allowedMaterialIds={effectiveAllowedMaterialIds}
                    otherSizesForPrintCopy={otherSizesForPrintCopy}
                    onCopyPrintFromSize={handleCopyPrintFromSize}
                  />
                )}

                {editorTab === 'materials' && (
                  <MaterialsCard
                    selected={selected}
                    loadingLists={loadingLists}
                    selectedPaperTypeId={selectedPaperTypeId}
                    setSelectedPaperTypeId={setSelectedPaperTypeId}
                    paperTypes={paperTypes}
                    materialsForSelectedPaperType={materialsForSelectedPaperType}
                    allMaterialsFromAllPaperTypes={allMaterialsFromAllPaperTypes}
                    allMaterials={allMaterials}
                    hasUserInteractedWithMaterialsRef={hasUserInteractedWithMaterialsRef}
                    updateSize={updateSize}
                    hasCommonMaterialsFeature={hasTypes}
                    useOwnMaterials={useOwnMaterials}
                    effectiveAllowedMaterialIds={effectiveAllowedMaterialIds}
                    updateEffectiveMaterials={updateEffectiveMaterials}
                    setUseOwnMaterials={setUseOwnMaterials}
                  />
                )}

                {editorTab === 'finishing' && (
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
                )}

                {editorTab === 'design' && productId && selectedTypeId != null && (
                  <SubtypeDesignsCard
                    productId={productId}
                    typeId={Number(selectedTypeId)}
                    subtypeSizes={sizes}
                    pagesConfig={value.typeConfigs?.[String(selectedTypeId)]?.pages}
                  />
                )}
              </>
            )}
          </div>
        </div>

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


