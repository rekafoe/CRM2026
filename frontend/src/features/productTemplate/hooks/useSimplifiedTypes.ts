import { useCallback, useMemo, useState, useEffect } from 'react'
import {
  type SimplifiedConfig,
  type SimplifiedSizeConfig,
  type SimplifiedTypeConfig,
  type ProductTypeVariant,
  getEffectiveConfig,
  generateTypeId,
} from './useProductTemplate'

export interface UseSimplifiedTypesResult {
  hasTypes: boolean
  selectedTypeId: string | null
  setSelectedTypeId: (id: string | null) => void
  effectiveConfig: SimplifiedTypeConfig
  sizes: SimplifiedSizeConfig[]
  selectedSizeId: string | null
  setSelectedSizeId: (id: string | null) => void
  selected: SimplifiedSizeConfig | null
  pagesConfig: NonNullable<SimplifiedConfig['pages']> & { options: number[] }
  applyToCurrentConfig: (updater: (prev: SimplifiedTypeConfig) => SimplifiedTypeConfig) => void
  updatePagesConfig: (patch: Partial<NonNullable<SimplifiedConfig['pages']>>) => void
  updateSize: (id: string, patch: Partial<SimplifiedSizeConfig>) => void
  removeSize: (id: string) => void
  addType: () => void
  setDefaultType: (id: string) => void
  removeType: (id: string) => void
}

export function useSimplifiedTypes(
  value: SimplifiedConfig,
  onChange: (next: SimplifiedConfig) => void,
): UseSimplifiedTypesResult {
  const hasTypes = Boolean(value.types?.length)
  const firstTypeId = value.types?.[0]?.id ?? null
  const defaultTypeId = value.types?.find(t => t.default)?.id ?? firstTypeId

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(() => defaultTypeId ?? null)
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null)

  const effectiveConfig = useMemo(
    () => getEffectiveConfig(value, hasTypes ? selectedTypeId : null),
    [value, hasTypes, selectedTypeId],
  )
  const sizes = effectiveConfig.sizes

  const selected = useMemo(
    () => sizes.find(s => s.id === selectedSizeId) || null,
    [sizes, selectedSizeId],
  )

  useEffect(() => {
    if (sizes.length > 0 && (!selectedSizeId || !sizes.some(s => s.id === selectedSizeId))) {
      setSelectedSizeId(sizes[0].id)
    } else if (sizes.length === 0) setSelectedSizeId(null)
  }, [sizes, selectedSizeId])

  useEffect(() => {
    if (hasTypes && value.types?.length) {
      const valid = value.types.some(t => t.id === selectedTypeId)
      if (!valid) setSelectedTypeId(defaultTypeId ?? value.types[0]?.id ?? null)
    } else {
      if (selectedTypeId !== null) setSelectedTypeId(null)
    }
  }, [hasTypes, value.types, defaultTypeId, selectedTypeId])

  const pagesConfig = useMemo(
    () => effectiveConfig.pages || { options: [] as number[] },
    [effectiveConfig.pages],
  )

  const applyToCurrentConfig = useCallback(
    (updater: (prev: SimplifiedTypeConfig) => SimplifiedTypeConfig) => {
      if (hasTypes && selectedTypeId) {
        const current = value.typeConfigs?.[selectedTypeId] ?? { sizes: [], pages: value.pages }
        const next = updater(current)
        onChange({
          ...value,
          typeConfigs: { ...value.typeConfigs, [selectedTypeId]: next },
        })
      } else {
        const current: SimplifiedTypeConfig = { sizes: value.sizes, pages: value.pages }
        const next = updater(current)
        onChange({ ...value, sizes: next.sizes, pages: next.pages })
      }
    },
    [value, hasTypes, selectedTypeId, onChange],
  )

  const updatePagesConfig = useCallback(
    (patch: Partial<NonNullable<SimplifiedConfig['pages']>>) => {
      applyToCurrentConfig(prev => ({
        ...prev,
        pages: { ...(prev.pages || { options: [] }), ...patch },
      }))
    },
    [applyToCurrentConfig],
  )

  const addType = useCallback(() => {
    const id = generateTypeId()
    const name = hasTypes ? 'Новый тип' : 'Основной'
    if (!hasTypes) {
      const types: ProductTypeVariant[] = [{ id, name, default: true }]
      const typeConfigs: Record<string, SimplifiedTypeConfig> = {
        [id]: { sizes: value.sizes || [], pages: value.pages },
      }
      onChange({ ...value, types, typeConfigs })
    } else {
      const types: ProductTypeVariant[] = [...(value.types || []), { id, name, default: false }]
      const typeConfigs: Record<string, SimplifiedTypeConfig> = {
        ...value.typeConfigs,
        [id]: { sizes: [], pages: effectiveConfig.pages },
      }
      onChange({ ...value, types, typeConfigs })
    }
    setSelectedTypeId(id)
    setSelectedSizeId(null)
  }, [value, hasTypes, effectiveConfig.pages, onChange])

  const setDefaultType = useCallback(
    (id: string) => {
      if (!value.types?.length) return
      onChange({
        ...value,
        types: value.types.map(t => ({ ...t, default: t.id === id })),
      })
    },
    [value, onChange],
  )

  const removeType = useCallback(
    (id: string) => {
      if (!value.types || value.types.length <= 1) return
      const nextTypes = value.types.filter(t => t.id !== id)
      const nextConfigs = { ...value.typeConfigs }
      delete nextConfigs[id]
      const hasDefault = nextTypes.some(t => t.default)
      onChange({
        ...value,
        types: hasDefault ? nextTypes : nextTypes.map((t, i) => ({ ...t, default: i === 0 })),
        typeConfigs: nextConfigs,
      })
      if (selectedTypeId === id) {
        const nextId = nextTypes[0]?.id ?? null
        setSelectedTypeId(nextId)
        const cfg = nextConfigs[nextId!]
        setSelectedSizeId(cfg?.sizes?.[0]?.id ?? null)
      }
    },
    [value, selectedTypeId, onChange],
  )

  const updateSize = useCallback(
    (id: string, patch: Partial<SimplifiedSizeConfig>) => {
      applyToCurrentConfig(prev => ({
        ...prev,
        sizes: (prev.sizes || []).map(s => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [applyToCurrentConfig],
  )

  const removeSize = useCallback(
    (id: string) => {
      applyToCurrentConfig(prev => {
        const nextSizes = (prev.sizes || []).filter(s => s.id !== id)
        if (selectedSizeId === id) setSelectedSizeId(nextSizes[0]?.id ?? null)
        return { ...prev, sizes: nextSizes }
      })
    },
    [applyToCurrentConfig, selectedSizeId],
  )

  return {
    hasTypes,
    selectedTypeId,
    setSelectedTypeId,
    effectiveConfig,
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
  }
}
