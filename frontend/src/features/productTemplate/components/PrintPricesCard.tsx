import React, { useState, useRef, useEffect } from 'react'
import { Button, FormField } from '../../../components/common'
import { api } from '../../../api'
import type { SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import { PriceCell } from './PriceCell'
import { type Tier, defaultTiers, addRangeBoundary, editRangeBoundary, removeRange, normalizeTiers } from '../utils/tierManagement'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean; supports_duplex?: number | boolean }

type TierRangeModalState = {
  type: 'add' | 'edit'
  tierIndex?: number
  isOpen: boolean
  boundary: string
  anchorElement?: HTMLElement
}

interface PrintPricesCardProps {
  selected: SimplifiedSizeConfig
  printTechs: PrintTechRow[]
  loadingLists: boolean
  isMobile: boolean
  updateSize: (sizeId: number | string, patch: Partial<SimplifiedSizeConfig>) => void
  getSizeRanges: (size: SimplifiedSizeConfig) => Tier[]
  updateSizeRanges: (sizeId: number | string, newRanges: Tier[]) => void
}

export const PrintPricesCard: React.FC<PrintPricesCardProps> = ({
  selected,
  printTechs,
  loadingLists,
  isMobile,
  updateSize,
  getSizeRanges,
  updateSizeRanges,
}) => {
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  })
  const tierModalRef = useRef<HTMLDivElement>(null)
  const addRangeButtonRef = useRef<HTMLButtonElement>(null)

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
          <strong>Печать (цена за изделие)</strong>
          <div className="text-muted text-sm">Выберите технологию печати, и система автоматически покажет все доступные вариации с диапазонами цен.</div>
        </div>
        {selected.default_print?.technology_code && selected.width_mm > 0 && selected.height_mm > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const tech = selected.default_print?.technology_code ?? ''
              if (!tech) return
              const w = selected.width_mm
              const h = selected.height_mm
              const modes: Array<{ color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex' }> = [
                { color_mode: 'color', sides_mode: 'single' },
                { color_mode: 'color', sides_mode: 'duplex' },
                { color_mode: 'bw', sides_mode: 'single' },
                { color_mode: 'bw', sides_mode: 'duplex' },
              ]
              const updated: typeof selected.print_prices = []
              let itemsPerSheet: number | undefined
              for (const m of modes) {
                try {
                  const r = await api.get('/pricing/print-prices/derive', {
                    params: { technology_code: tech, width_mm: w, height_mm: h, color_mode: m.color_mode, sides_mode: m.sides_mode },
                  })
                  const data = r.data as { items_per_sheet?: number; tiers?: Array<{ min_qty: number; max_qty?: number; unit_price: number }> }
                  if (data?.items_per_sheet != null) itemsPerSheet = data.items_per_sheet
                  const tiers = data?.tiers ?? []
                  if (tiers.length > 0) {
                    updated.push({
                      technology_code: tech,
                      color_mode: m.color_mode,
                      sides_mode: m.sides_mode,
                      tiers: tiers.map((t: any) => ({ min_qty: t.min_qty, max_qty: t.max_qty, unit_price: t.unit_price ?? 0 })),
                    })
                  }
                } catch {
                  // skip mode if no central prices
                }
              }
              if (updated.length > 0) {
                const patch: Partial<typeof selected> = { print_prices: updated }
                if (itemsPerSheet != null && itemsPerSheet > 0) {
                  patch.min_qty = itemsPerSheet
                }
                updateSize(selected.id, patch)
              }
            }}
          >
            Заполнить из центральных цен
          </Button>
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
          const removeSidesMode = (sidesMode: 'single' | 'duplex') => {
            const remaining = selected.print_prices.filter(p => p.sides_mode !== sidesMode)
            if (remaining.length === 0) return
            updateSize(selected.id, { print_prices: remaining })
          }
          const hasSingle = selected.print_prices.some(p => p.sides_mode === 'single')
          const hasDuplex = selected.print_prices.some(p => p.sides_mode === 'duplex')
          const selectedTech = selected.default_print?.technology_code
            ? printTechs.find(t => t.code === selected.default_print?.technology_code)
            : null
          const supportsDuplex = selectedTech?.supports_duplex === 1 || selectedTech?.supports_duplex === true
          const addSidesMode = (sidesMode: 'single' | 'duplex') => {
            const existing = selected.print_prices
            const newEntries = existing.map(p => ({
              technology_code: p.technology_code,
              color_mode: p.color_mode,
              sides_mode: sidesMode as 'single' | 'duplex',
              tiers: (p.tiers || defaultTiers()).map(t => ({ ...t, unit_price: 0 }))
            }))
            updateSize(selected.id, { print_prices: [...existing, ...newEntries] })
          }

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
                          selected.print_prices.some(p => p.sides_mode === 'duplex'),
                          () => removeSidesMode('single')
                        )}
                      {colorRows.find(r => r.sides_mode === 'duplex') &&
                        renderPriceRow(
                          colorRows.find(r => r.sides_mode === 'duplex')!,
                          'двухсторонняя',
                          selected.print_prices.some(p => p.sides_mode === 'single'),
                          () => removeSidesMode('duplex')
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
                          selected.print_prices.some(p => p.sides_mode === 'duplex'),
                          () => removeSidesMode('single')
                        )}
                      {bwRows.find(r => r.sides_mode === 'duplex') &&
                        renderPriceRow(
                          bwRows.find(r => r.sides_mode === 'duplex')!,
                          'двухсторонняя',
                          selected.print_prices.some(p => p.sides_mode === 'single'),
                          () => removeSidesMode('duplex')
                        )}
                    </>
                  )}
                </tbody>
              </table>
              {(hasSingle && !hasDuplex && supportsDuplex) || (!hasSingle && hasDuplex) ? (
                <div className="simplified-tiers-table__add-sides" style={{ marginTop: 10, fontSize: 13, color: '#606266' }}>
                  {hasSingle && !hasDuplex && supportsDuplex && (
                    <>
                      Сейчас только односторонняя печать.{' '}
                      <button
                        type="button"
                        className="el-button el-button--text el-button--mini"
                        style={{ color: 'var(--primary, #409eff)' }}
                        onClick={() => addSidesMode('duplex')}
                      >
                        Добавить двухстороннюю
                      </button>
                    </>
                  )}
                  {!hasSingle && hasDuplex && (
                    <>
                      Сейчас только двухсторонняя печать.{' '}
                      <button
                        type="button"
                        className="el-button el-button--text el-button--mini"
                        style={{ color: 'var(--primary, #409eff)' }}
                        onClick={() => addSidesMode('single')}
                      >
                        Добавить одностороннюю
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )
        })()}

        {tierModal.isOpen && selected && (
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
