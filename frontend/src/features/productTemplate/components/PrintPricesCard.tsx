import React, { useState, useRef, useEffect } from 'react'
import { Button, FormField } from '../../../components/common'
import { useToastNotifications } from '../../../components/Toast'
import { api } from '../../../api'
import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import { PriceCell } from './PriceCell'
import { type Tier, defaultTiers, addRangeBoundary, editRangeBoundary, removeRange, normalizeTiers } from '../utils/tierManagement'
import { getTierModalAnchorStyle } from '../utils/tierModalAnchorStyle'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean; supports_duplex?: number | boolean }

type TierRangeModalState = {
  type: 'add' | 'edit'
  tierIndex?: number
  isOpen: boolean
  boundary: string
  anchorElement?: HTMLElement
}

/** Первый разрешённый материал с заполненными sheet_width и sheet_height — для раскладки при «Заполнить из центральных цен». */
function firstMaterialIdWithSheetDims(
  allMaterials: Array<{ id: number; sheet_width?: number | null; sheet_height?: number | null }> | undefined,
  allowedIds: number[] | undefined,
): number | undefined {
  if (!allMaterials?.length || !allowedIds?.length) return undefined
  for (const rawId of allowedIds) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const m = allMaterials.find((x) => Number(x.id) === id)
    const sw = m != null ? Number(m.sheet_width) : 0
    const sh = m != null ? Number(m.sheet_height) : 0
    if (sw > 0 && sh > 0) return id
  }
  return undefined
}

interface PrintPricesCardProps {
  selected: SimplifiedSizeConfig
  printTechs: PrintTechRow[]
  loadingLists: boolean
  isMobile: boolean
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
  getSizeRanges: (size: SimplifiedSizeConfig) => Tier[]
  updateSizeRanges: (sizeId: number | string, newRanges: Tier[]) => void
  /** Материалы склада (для раскладки по ширине/высоте листа при запросе из центральных цен) */
  allMaterials?: Array<{ id: number; sheet_width?: number | null; sheet_height?: number | null }>
  /** Разрешённые id материалов для текущего размера (порядок важен: берётся первый с обоими размерами мм) */
  allowedMaterialIds?: number[]
  /** Другие размеры того же типа — для «Скопировать печать из размера» */
  otherSizesForPrintCopy?: Array<{ id: string | number; label: string }>
  /** Подставить в текущий размер копию default_print + print_prices с выбранного размера */
  onCopyPrintFromSize?: (sourceSizeId: string | number) => void
}

export const PrintPricesCard: React.FC<PrintPricesCardProps> = ({
  selected,
  printTechs,
  loadingLists,
  isMobile,
  updateSize,
  getSizeRanges,
  updateSizeRanges,
  allMaterials,
  allowedMaterialIds,
  otherSizesForPrintCopy = [],
  onCopyPrintFromSize,
}) => {
  const titleWithHint = (label: string, hint: string) => (
    <span className="simplified-label-with-hint">
      <strong>{label}</strong>
      <span className="simplified-label-hint" title={hint}>?</span>
    </span>
  )

  const toast = useToastNotifications()
  const [deriveLoading, setDeriveLoading] = useState(false)
  const [copyPrintSourceId, setCopyPrintSourceId] = useState<string>('')
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  })
  const tierModalRef = useRef<HTMLDivElement>(null)
  const addRangeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setCopyPrintSourceId('')
  }, [selected.id])

  useEffect(() => {
    if (!tierModal.isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!tierModalRef.current) return
      const target = e.target as HTMLElement
      if (tierModalRef.current.contains(target)) return
      const button = target.closest('button')
      if (button) {
        const buttonText = button.textContent || ''
        if (buttonText.includes('Диапазон')) return
      }
      setTierModal((prev) => ({ ...prev, isOpen: false, tierIndex: undefined }))
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [tierModal.isOpen])

  return (
    <div className="simplified-card">
      <div className="simplified-card__header">
        <div>
          {titleWithHint(
            'Печать (цена за изделие)',
            'Выберите технологию печати, и система автоматически покажет все доступные вариации с диапазонами цен.',
          )}
          {otherSizesForPrintCopy.length > 0 && typeof onCopyPrintFromSize === 'function' && (
            <div
              className="simplified-print-copy-row"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}
            >
              <label className="text-sm text-muted" style={{ margin: 0 }}>
                Скопировать настройки печати из размера:
              </label>
              <select
                className="form-select form-select--compact"
                style={{ minWidth: 180, maxWidth: '100%' }}
                value={copyPrintSourceId}
                onChange={(e) => setCopyPrintSourceId(e.target.value)}
                aria-label="Размер-источник для копирования печати"
              >
                <option value="">— выберите размер —</option>
                {otherSizesForPrintCopy.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!copyPrintSourceId}
                onClick={() => {
                  if (!copyPrintSourceId || !onCopyPrintFromSize) return
                  const src = otherSizesForPrintCopy.find((s) => String(s.id) === copyPrintSourceId)
                  if (src) onCopyPrintFromSize(src.id)
                }}
              >
                Скопировать
              </Button>
            </div>
          )}
        </div>
        {selected.default_print?.technology_code && selected.width_mm > 0 && selected.height_mm > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={deriveLoading}
            disabled={deriveLoading}
            onClick={async () => {
              const tech = selected.default_print?.technology_code ?? ''
              if (!tech) return
              const w = selected.width_mm
              const h = selected.height_mm
              const layoutMaterialId = firstMaterialIdWithSheetDims(allMaterials, allowedMaterialIds)
              const selectedTech = printTechs.find((t) => t.code === tech)
              const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
              const isColorOnly =
                tech.toLowerCase().includes('inkjet_pigment') ||
                (tech.toLowerCase().includes('inkjet') &&
                  (selectedTech?.name?.toLowerCase().includes('пигмент') ?? false))
              const modes: Array<{ color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex' }> = []
              if (isColorOnly) {
                modes.push({ color_mode: 'color', sides_mode: 'single' })
                if (supportsDuplex) modes.push({ color_mode: 'color', sides_mode: 'duplex' })
              } else {
                modes.push(
                  { color_mode: 'color', sides_mode: 'single' },
                  ...(supportsDuplex ? [{ color_mode: 'color' as const, sides_mode: 'duplex' as const }] : []),
                  { color_mode: 'bw', sides_mode: 'single' },
                  ...(supportsDuplex ? [{ color_mode: 'bw' as const, sides_mode: 'duplex' as const }] : []),
                )
              }
              const modeLabel = (m: (typeof modes)[0]) =>
                `${m.color_mode === 'color' ? 'цвет' : 'ч/б'}, ${m.sides_mode === 'duplex' ? 'двусторонне' : 'односторонне'}`

              const updated: typeof selected.print_prices = []
              let itemsPerSheet: number | undefined
              const problems: string[] = []

              setDeriveLoading(true)
              try {
                for (const m of modes) {
                  try {
                    const r = await api.get('/pricing/print-prices/derive', {
                      params: {
                        technology_code: tech,
                        width_mm: w,
                        height_mm: h,
                        color_mode: m.color_mode,
                        sides_mode: m.sides_mode,
                        ...(layoutMaterialId != null ? { material_id: layoutMaterialId } : {}),
                        ...(selected.cut_margin_mm != null ? { cut_margin_mm: selected.cut_margin_mm } : {}),
                        ...(selected.cut_gap_mm != null ? { cut_gap_mm: selected.cut_gap_mm } : {}),
                        ...(selected.items_per_sheet_override != null
                          ? { items_per_sheet_override: selected.items_per_sheet_override }
                          : {}),
                      },
                    })
                    const raw = r.data as { data?: unknown } & Record<string, unknown> | undefined
                    const data = (raw != null && raw.data !== undefined ? raw.data : raw) as {
                      items_per_sheet?: number
                      tiers?: Array<{ min_qty: number; max_qty?: number; unit_price: number }>
                      message?: string
                      error?: string
                    }
                    if (data?.items_per_sheet != null) itemsPerSheet = data.items_per_sheet
                    const tiers = data?.tiers ?? []
                    if (tiers.length > 0) {
                      updated.push({
                        technology_code: tech,
                        color_mode: m.color_mode,
                        sides_mode: m.sides_mode,
                        tiers: tiers.map((t: any) => ({ min_qty: t.min_qty, max_qty: t.max_qty, unit_price: t.unit_price ?? 0 })),
                      })
                    } else {
                      const hint = data?.message || data?.error || 'Нет диапазонов тиража для этой комбинации в центральных ценах печати.'
                      problems.push(`${modeLabel(m)}: ${hint}`)
                    }
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e)
                    problems.push(`${modeLabel(m)}: ${msg}`)
                  }
                }

                if (updated.length > 0) {
                  const patch: Partial<typeof selected> = { print_prices: updated }
                  if (itemsPerSheet != null && itemsPerSheet > 0) {
                    patch.min_qty = itemsPerSheet
                  }
                  updateSize(selected.id, patch)
                  toast.success(
                    'Цены подставлены из центральных настроек',
                    problems.length > 0
                      ? `Не для всех режимов: ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? '…' : ''}`
                      : undefined,
                  )
                } else {
                  toast.error(
                    'Не удалось заполнить из центральных цен',
                    problems.length > 0
                      ? problems.join('\n')
                      : 'Проверьте, что для выбранной технологии в «Цены печати» заданы листовые цены и диапазоны тиража.',
                  )
                }
              } finally {
                setDeriveLoading(false)
              }
            }}
          >
            Заполнить из центральных цен
          </Button>
        )}
        {selected.default_print?.technology_code && selected.width_mm > 0 && selected.height_mm > 0 && (
          <span
            className="simplified-label-hint"
            title="Раскладка при этом запросе: первый разрешённый для размера материал с заполненными «ширина и высота листа (мм)» в карточке склада; если таких нет — размер листа из централизованной цены печати (по умолчанию часто 320×450)."
            style={{ marginTop: 8 }}
          >
            ?
          </span>
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

                const selectedTech = printTechs.find(t => t.code === techCode)
                const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
                const isColorOnly = techCode.toLowerCase().includes('inkjet_pigment') ||
                                   (techCode.toLowerCase().includes('inkjet') && selectedTech?.name?.toLowerCase().includes('пигмент'))

                const existingRanges = getSizeRanges(selected)
                const variations: Array<{ technology_code: string; color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex'; tiers: Array<{ min_qty: number; max_qty?: number; unit_price: number }> }> = []

                if (isColorOnly) {
                  if (supportsDuplex) {
                    variations.push(
                      { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                      { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                    )
                  } else {
                    variations.push(
                      { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                    )
                  }
                } else {
                  if (supportsDuplex) {
                    variations.push(
                      { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                      { technology_code: techCode, color_mode: 'color' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                      { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'single' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) },
                      { technology_code: techCode, color_mode: 'bw' as const, sides_mode: 'duplex' as const, tiers: existingRanges.map(r => ({ ...r, unit_price: 0 })) }
                    )
                  } else {
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
          const techCode = selected.print_prices[0]?.technology_code ?? selected.default_print?.technology_code ?? ''
          const selectedTech = techCode ? printTechs.find(t => t.code === techCode) : null
          const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
          const isColorOnly = techCode.toLowerCase().includes('inkjet_pigment') ||
            (techCode.toLowerCase().includes('inkjet') && selectedTech?.name?.toLowerCase().includes('пигмент'))

          const removeVariant = (color_mode: 'color' | 'bw', sides_mode: 'single' | 'duplex') => {
            const remaining = selected.print_prices.filter(
              p => !(p.color_mode === color_mode && p.sides_mode === sides_mode)
            )
            if (remaining.length === 0) return
            updateSize(selected.id, { print_prices: remaining })
          }
          const addVariant = (color_mode: 'color' | 'bw', sides_mode: 'single' | 'duplex') => {
            const existing = selected.print_prices
            const ref = existing[0]
            if (!ref) return
            const tiers = (ref.tiers || defaultTiers()).map(t => ({ ...t, unit_price: 0 }))
            const newEntry = {
              technology_code: ref.technology_code,
              color_mode,
              sides_mode,
              tiers,
            }
            if (existing.some(p => p.color_mode === color_mode && p.sides_mode === sides_mode)) return
            updateSize(selected.id, { print_prices: [...existing, newEntry] })
          }
          const hasVariant = (color_mode: 'color' | 'bw', sides_mode: 'single' | 'duplex') =>
            selected.print_prices.some(p => p.color_mode === color_mode && p.sides_mode === sides_mode)

          const renderPriceRow = (row: typeof selected.print_prices[0], label: string, canRemove: boolean, removeFn: () => void) => {
            const actualIdx = selected.print_prices.findIndex(p =>
              p.technology_code === row.technology_code &&
              p.color_mode === row.color_mode &&
              p.sides_mode === row.sides_mode
            )
            return (
              <tr className="simplified-table__child-row">
                <td className="simplified-table__child-cell">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="el-select el-select--small" style={{ flex: 1 }}>
                      <div className="el-input el-input--small el-input--suffix">
                        <input type="text" readOnly className="el-input__inner" value={label} style={{ cursor: 'default' }} />
                        <span className="el-input__suffix">
                          <span className="el-input__suffix-inner">
                            <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                          </span>
                        </span>
                      </div>
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        className="el-button el-button--text el-button--mini"
                        style={{ color: 'var(--danger, #f56c6c)', flexShrink: 0 }}
                        title={`Убрать ${label} печать для этого продукта`}
                        onClick={removeFn}
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
          }

          const renderParentRow = (label: string, keyPrefix: string) => (
            <tr className="simplified-table__parent-row">
              <td className="simplified-table__parent-cell">
                <div className="el-select el-select--small" style={{ width: '100%' }}>
                  <div className="el-input el-input--small el-input--suffix">
                    <input type="text" readOnly className="el-input__inner" value={label} style={{ cursor: 'default', backgroundColor: '#f5f7fa' }} />
                    <span className="el-input__suffix">
                      <span className="el-input__suffix-inner">
                        <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                      </span>
                    </span>
                  </div>
                </div>
              </td>
              {commonRanges.map((_, ti) => (
                <td key={`${keyPrefix}-empty-${ti}`} style={{ backgroundColor: '#f5f7fa' }}></td>
              ))}
              <td style={{ backgroundColor: '#f5f7fa' }}></td>
            </tr>
          )

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
                              onClick={(e) => {
                                setTierModal({
                                  type: 'edit',
                                  tierIndex: ti,
                                  isOpen: true,
                                  boundary: String(t.min_qty),
                                  anchorElement: e.currentTarget as HTMLElement,
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
                  {colorRows.length > 0 && (
                    <>
                      {renderParentRow('полноцветная', 'color')}
                      {colorRows.find(r => r.sides_mode === 'single') &&
                        renderPriceRow(
                          colorRows.find(r => r.sides_mode === 'single')!,
                          'односторонняя',
                          selected.print_prices.length > 1,
                          () => removeVariant('color', 'single')
                        )}
                      {colorRows.find(r => r.sides_mode === 'duplex') &&
                        renderPriceRow(
                          colorRows.find(r => r.sides_mode === 'duplex')!,
                          'двухсторонняя',
                          selected.print_prices.length > 1,
                          () => removeVariant('color', 'duplex')
                        )}
                    </>
                  )}
                  {bwRows.length > 0 && (
                    <>
                      {renderParentRow('черно-белая', 'bw')}
                      {bwRows.find(r => r.sides_mode === 'single') &&
                        renderPriceRow(
                          bwRows.find(r => r.sides_mode === 'single')!,
                          'односторонняя',
                          selected.print_prices.length > 1,
                          () => removeVariant('bw', 'single')
                        )}
                      {bwRows.find(r => r.sides_mode === 'duplex') &&
                        renderPriceRow(
                          bwRows.find(r => r.sides_mode === 'duplex')!,
                          'двухсторонняя',
                          selected.print_prices.length > 1,
                          () => removeVariant('bw', 'duplex')
                        )}
                    </>
                  )}
                </tbody>
              </table>
              {(() => {
                const missing: Array<{ color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex'; label: string }> = []
                if (!hasVariant('color', 'single')) missing.push({ color_mode: 'color', sides_mode: 'single', label: 'полноцвет односторонняя' })
                if (supportsDuplex && !hasVariant('color', 'duplex')) missing.push({ color_mode: 'color', sides_mode: 'duplex', label: 'полноцвет двухсторонняя' })
                if (!isColorOnly) {
                  if (!hasVariant('bw', 'single')) missing.push({ color_mode: 'bw', sides_mode: 'single', label: 'ч/б односторонняя' })
                  if (supportsDuplex && !hasVariant('bw', 'duplex')) missing.push({ color_mode: 'bw', sides_mode: 'duplex', label: 'ч/б двухсторонняя' })
                }
                if (missing.length === 0) return null
                return (
                  <div className="simplified-tiers-table__add-sides" style={{ marginTop: 10, fontSize: 13, color: '#606266' }}>
                    Добавить вариацию:{' '}
                    {missing.map((m, i) => (
                      <span key={`${m.color_mode}-${m.sides_mode}`}>
                        {i > 0 && ' · '}
                        <button
                          type="button"
                          className="el-button el-button--text el-button--mini"
                          style={{ color: 'var(--primary, #409eff)' }}
                          onClick={() => addVariant(m.color_mode, m.sides_mode)}
                        >
                          {m.label}
                        </button>
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {tierModal.isOpen && selected && (
          <div
            ref={tierModalRef}
            className="simplified-tier-modal"
            style={tierModal.anchorElement ? getTierModalAnchorStyle(tierModal.anchorElement) : {
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
  )
}
