import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getMaterials } from '../../../api'
import { CoverMaterialsAllowedEditor } from '../../multipage/CoverMaterialsAllowedEditor'
import {
  getCoverAllowedMaterialIds,
  isSeparateCoverMode,
  pickDefaultCoverMaterialId,
  resolveCoverMaterialsForAllowed,
} from '../../../utils/multipageCoverMaterials'
import type { CoverMaterialOption } from '../../../services/calculatorMaterialService'

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
  const [allMaterials, setAllMaterials] = useState<CoverMaterialOption[]>([])
  const schemaMaterialsRef = useRef(schemaMaterials)
  schemaMaterialsRef.current = schemaMaterials

  useEffect(() => {
    if (!isSeparateCoverMode(coverConfig)) return
    let cancelled = false
    getMaterials()
      .then((response) => {
        if (cancelled) return
        const fromApi = Array.isArray(response.data)
          ? response.data.filter((m: { id?: number }) => m?.id != null)
          : []
        const fromSchema = Array.isArray(schemaMaterialsRef.current)
          ? schemaMaterialsRef.current
          : []
        const byId = new Map<number, CoverMaterialOption>()
        for (const m of fromApi) {
          const id = Number(m.id)
          if (Number.isFinite(id) && id > 0) {
            byId.set(id, m as CoverMaterialOption)
          }
        }
        for (const sm of fromSchema) {
          const id = Number(sm.id)
          if (!Number.isFinite(id) || id <= 0) continue
          if (!byId.has(id)) {
            byId.set(id, {
              id,
              name: sm.name,
              density: sm.density,
            } as CoverMaterialOption)
          }
        }
        setAllMaterials(Array.from(byId.values()))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [coverConfig?.mode])

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
    [coverConfig],
  )

  const allowedOptions = useMemo(
    () =>
      resolveCoverMaterialsForAllowed(
        allowedIds,
        allMaterials,
        paperTypesForEditor,
      ),
    [allowedIds, allMaterials, paperTypesForEditor],
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
    const id = Number(coverMaterialId)
    if (!Number.isFinite(id)) return
    if (allowedIds.length > 0 && !allowedIds.includes(id)) {
      const next = pickDefaultCoverMaterialId(coverConfig)
      if (next != null) {
        updateSpecs({ cover_material_id: next }, true)
      }
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
      {allowedIds.length > 0 && allowedOptions.length === 0 && (
        <p className="text-muted text-sm" style={{ marginBottom: 8 }}>
          Загрузка списка материалов обложки…
        </p>
      )}
      <CoverMaterialsAllowedEditor
        allowedIds={allowedIds}
        onAllowedChange={() => {}}
        allMaterials={allMaterials}
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
