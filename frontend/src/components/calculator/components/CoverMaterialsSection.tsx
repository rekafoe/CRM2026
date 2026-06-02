import React, { useEffect, useMemo, useState } from 'react'
import { getMaterials } from '../../../api'
import { CoverMaterialsAllowedEditor } from '../../multipage/CoverMaterialsAllowedEditor'
import {
  getCoverAllowedMaterialIds,
  isSeparateCoverMode,
  pickDefaultCoverMaterialId,
} from '../../../utils/multipageCoverMaterials'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'

type CoverConfig = {
  mode?: string
  allowed_material_ids?: number[]
  material_id?: number
}

type Props = {
  coverConfig?: CoverConfig | null
  coverMaterialId?: number
  updateSpecs: (updates: Record<string, unknown>, instant?: boolean) => void
  warehousePaperTypes: Array<{
    name: string
    display_name: string
    id?: number | string
    densities?: Array<{ material_id?: number; value?: number; price?: number }>
  }>
  schemaMaterials?: Array<{ id: number; name: string; density?: number }>
  validationError?: string
}

export const CoverMaterialsSection: React.FC<Props> = ({
  coverConfig,
  coverMaterialId,
  updateSpecs,
  warehousePaperTypes,
  schemaMaterials,
  validationError,
}) => {
  const [allMaterials, setAllMaterials] = useState<CalculatorMaterial[]>([])

  useEffect(() => {
    if (!isSeparateCoverMode(coverConfig)) return
    let cancelled = false
    getMaterials()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) {
          setAllMaterials(list as CalculatorMaterial[])
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [coverConfig?.mode])

  const materialsList = useMemo(() => {
    if (allMaterials.length > 0) return allMaterials
    if (!schemaMaterials?.length) return []
    return schemaMaterials.map((m) => ({
      id: m.id,
      name: m.name,
      density: m.density,
    })) as CalculatorMaterial[]
  }, [allMaterials, schemaMaterials])

  const paperTypesForEditor = useMemo(
    () =>
      warehousePaperTypes.map((pt, i) => ({
        id: (pt as { id?: number | string }).id ?? pt.name ?? i,
        name: pt.name,
        display_name: pt.display_name,
        densities: pt.densities,
      })),
    [warehousePaperTypes],
  )
  const show = isSeparateCoverMode(coverConfig)
  const allowedIds = useMemo(
    () => getCoverAllowedMaterialIds(coverConfig),
    [coverConfig]
  )

  useEffect(() => {
    if (!show || allowedIds.length === 0) return
    const current = coverMaterialId != null ? Number(coverMaterialId) : NaN
    if (Number.isFinite(current) && allowedIds.includes(current)) return
    const next = pickDefaultCoverMaterialId(coverConfig)
    if (next != null) {
      updateSpecs({ cover_material_id: next }, true)
    }
  }, [show, allowedIds.join(','), coverConfig, coverMaterialId, updateSpecs])

  useEffect(() => {
    if (!show) return
    if (coverMaterialId == null) return
    if (allowedIds.length > 0 && !allowedIds.includes(Number(coverMaterialId))) {
      updateSpecs({ cover_material_id: pickDefaultCoverMaterialId(coverConfig) }, true)
    }
  }, [show, allowedIds.join(','), coverMaterialId, coverConfig, updateSpecs])

  if (!show) return null

  return (
    <div className="calculator-cover-materials">
      <h4 className="calculator-subsection-title">Обложка</h4>
      {validationError && (
        <div className="validation-error" style={{ marginBottom: 8 }}>
          {validationError}
        </div>
      )}
      <CoverMaterialsAllowedEditor
        allowedIds={allowedIds}
        onAllowedChange={() => {}}
        allMaterials={materialsList}
        paperTypes={paperTypesForEditor}
        defaultMaterialId={coverMaterialId}
        onDefaultMaterialChange={(id) =>
          updateSpecs({ cover_material_id: id }, true)
        }
        allowEditAllowedList={false}
      />
    </div>
  )
}
