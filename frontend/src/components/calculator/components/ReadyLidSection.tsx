import React, { useEffect, useMemo, useState } from 'react'
import { getMaterials } from '../../../api'
import {
  blockSheetCount,
  formatMm,
  pickChannel,
  readyLidThicknessMm,
  type ThicknessMaterial,
} from '../../../utils/boundProductPreset'

type MaterialRow = ThicknessMaterial & { name: string }

export function ReadyLidSection({
  coverIds,
  channelIds,
  lidMaterialId,
  blockMaterialId,
  pages,
  pagesPerSheet,
  onLidChange,
  validationError,
}: {
  coverIds: number[]
  channelIds: number[]
  lidMaterialId?: number
  blockMaterialId?: number
  pages?: number
  pagesPerSheet: number
  onLidChange: (id: number) => void
  validationError?: string
}) {
  const [materials, setMaterials] = useState<MaterialRow[]>([])

  useEffect(() => {
    let cancelled = false
    getMaterials()
      .then((response) => {
        if (cancelled) return
        const rows = Array.isArray(response.data) ? response.data : []
        setMaterials(
          rows
            .filter((row: { id?: number }) => row && row.id != null)
            .map((row: MaterialRow) => ({
              id: Number(row.id),
              name: row.name,
              sheet_thickness_mm: row.sheet_thickness_mm,
              spine_thickness_mm: row.spine_thickness_mm,
              channel_min_mm: row.channel_min_mm,
              channel_max_mm: row.channel_max_mm,
            })),
        )
      })
      .catch(() => {
        if (!cancelled) setMaterials([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const covers = useMemo(
    () => materials.filter((row) => coverIds.includes(row.id)),
    [coverIds, materials],
  )
  const channels = useMemo(
    () => materials.filter((row) => channelIds.includes(row.id)),
    [channelIds, materials],
  )
  const block = materials.find((row) => row.id === blockMaterialId)
  const lid = covers.find((row) => row.id === lidMaterialId) ?? covers[0]
  const sheets = blockSheetCount(Number(pages) || 0, pagesPerSheet)
  const totalMm = readyLidThicknessMm(
    sheets,
    Number(block?.sheet_thickness_mm) || 0,
    Number(lid?.spine_thickness_mm) || 0,
  )
  const channel = pickChannel(channels, totalMm)

  useEffect(() => {
    if (lid && lidMaterialId !== lid.id) onLidChange(lid.id)
  }, [lid, lidMaterialId, onLidChange])

  return (
    <div className="param-group">
      <label>
        Крышка <span style={{ color: 'var(--danger, #c53030)' }}>*</span>
      </label>
      <select
        className="form-control"
        value={lid?.id ?? ''}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next > 0) onLidChange(next)
        }}
      >
        {covers.length === 0 && <option value="">Нет крышек в сборке</option>}
        {covers.map((cover) => (
          <option key={cover.id} value={cover.id}>
            {cover.name}
          </option>
        ))}
      </select>
      {validationError && <p className="param-hint">{validationError}</p>}
      <p className="param-hint">
        {totalMm > 0
          ? `Толщина под канал: ${formatMm(totalMm)} мм. Канал: ${channel?.name ?? 'нет подходящего'}. Списание: 2 крышки и 1 канал.`
          : 'Крышка считается и без миллиметров. Канал подставится, когда у бумаги блока заполнен эталон листа.'}
      </p>
    </div>
  )
}
