import React, { useEffect, useState } from 'react'
import { getMaterials } from '../../../api'

type BoardRow = { id: number; name: string }

export function CoverBoardSection({
  boardIds,
  boardMaterialId,
  onChange,
  validationError,
}: {
  boardIds: number[]
  boardMaterialId?: number
  onChange: (id: number) => void
  validationError?: string
}) {
  const [rows, setRows] = useState<BoardRow[]>([])

  useEffect(() => {
    if (boardIds.length < 2) return
    let cancelled = false
    getMaterials()
      .then((response) => {
        if (cancelled) return
        const list = Array.isArray(response.data) ? response.data : []
        const allowed = new Set(boardIds)
        setRows(
          list
            .map((row: { id?: number; name?: string }) => ({
              id: Number(row.id),
              name: String(row.name || ''),
            }))
            .filter((row: BoardRow) => allowed.has(row.id)),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [boardIds.join(',')])

  if (boardIds.length < 2) return null

  return (
    <div className="calculator-cover-materials">
      <h4 className="calculator-subsection-title">Переплётный картон</h4>
      {validationError && (
        <div className="validation-error" style={{ marginBottom: 8 }}>
          {validationError}
        </div>
      )}
      <select
        className="form-select"
        value={boardMaterialId ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value="">Выберите картон</option>
        {(rows.length > 0 ? rows : boardIds.map((id) => ({ id, name: `Материал #${id}` }))).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <p className="text-muted text-sm">2 картона на изделие, перед и зад. Печать и ламинация бумаги остаются.</p>
    </div>
  )
}
