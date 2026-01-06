import React, { useCallback, useMemo, useState } from 'react'
import { Button, FormField, Alert, Modal } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean }
type PaperTypeRow = Awaited<ReturnType<typeof getPaperTypesFromWarehouse>>[number]
type ServiceRow = { id: number; name: string; operationType?: string; operation_type?: string; priceUnit?: string; price_unit?: string }

interface Props {
  value: SimplifiedConfig
  onChange: (next: SimplifiedConfig) => void
  onSave: () => void
  saving: boolean
  allMaterials: CalculatorMaterial[]
}

const uid = () => `sz_${Date.now()}_${Math.random().toString(16).slice(2)}`

const defaultTiers = () => [{ min_qty: 1, max_qty: undefined, price: 0 }]

export const SimplifiedTemplateSection: React.FC<Props> = ({ value, onChange, onSave, saving, allMaterials }) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(value.sizes[0]?.id ?? null)
  const [paperTypes, setPaperTypes] = useState<PaperTypeRow[]>([])
  const [printTechs, setPrintTechs] = useState<PrintTechRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSize, setNewSize] = useState<{ label: string; width_mm: string; height_mm: string }>({ label: '', width_mm: '', height_mm: '' })

  const selected = useMemo(
    () => value.sizes.find(s => s.id === selectedSizeId) || null,
    [value.sizes, selectedSizeId],
  )

  const updateSize = useCallback((id: string, patch: Partial<SimplifiedSizeConfig>) => {
    onChange({
      ...value,
      sizes: value.sizes.map(s => (s.id === id ? { ...s, ...patch } : s)),
    })
  }, [onChange, value])

  const removeSize = useCallback((id: string) => {
    const nextSizes = value.sizes.filter(s => s.id !== id)
    onChange({ ...value, sizes: nextSizes })
    if (selectedSizeId === id) setSelectedSizeId(nextSizes[0]?.id ?? null)
  }, [onChange, selectedSizeId, value.sizes, value])

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [pt, techResp, svcResp] = await Promise.all([
        getPaperTypesFromWarehouse(),
        getPrintTechnologies().then(r => (Array.isArray(r.data) ? r.data : [])),
        api.get('/pricing/services').then(r => (Array.isArray(r.data) ? r.data : [])),
      ])
      setPaperTypes(pt || [])
      setPrintTechs((techResp || []).filter((t: any) => t && t.code))
      const allowedOps = new Set(['cut', 'score', 'fold', 'laminate'])
      setServices((svcResp || []).filter((s: any) => allowedOps.has(String(s.operation_type ?? s.operationType ?? '').toLowerCase())))
    } finally {
      setLoadingLists(false)
    }
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
      default_print: undefined,
      print_prices: [],
      allowed_material_ids: [],
      material_prices: [],
      finishing: [],
    }
    const next = { ...value, sizes: [...value.sizes, size] }
    onChange(next)
    setSelectedSizeId(size.id)
    setShowAddSize(false)
    setNewSize({ label: '', width_mm: '', height_mm: '' })
  }, [newSize.height_mm, newSize.label, newSize.width_mm, onChange, value])

  const techName = useCallback((code: string) => printTechs.find(t => t.code === code)?.name || code, [printTechs])
  const svcName = useCallback((id: number) => services.find(s => Number(s.id) === Number(id))?.name || `#${id}`, [services])
  const materialName = useCallback((id: number) => allMaterials.find(m => Number(m.id) === Number(id))?.name || `#${id}`, [allMaterials])

  const groupedMaterials = useMemo(() => {
    const byPaperType = new Map<string, CalculatorMaterial[]>()
    for (const m of allMaterials || []) {
      const key = String((m as any).paper_type_name || (m as any).paper_type || (m as any).category_name || 'Другое')
      const list = byPaperType.get(key) || []
      list.push(m)
      byPaperType.set(key, list)
    }
    return Array.from(byPaperType.entries()).map(([k, items]) => ({
      key: k,
      items: items.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    }))
  }, [allMaterials])

  return (
    <div className="simplified-template">
      <div className="simplified-template__header">
        <div>
          <h3>Упрощённый калькулятор</h3>
          <p className="text-muted text-sm">Настройка цен по размерам: печать (за изделие), материалы (за изделие) и отделка (за рез/биг/фальц).</p>
        </div>
        <div className="simplified-template__header-actions">
          <Button variant="secondary" onClick={openAddSize}>➕ Размер</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>Сохранить</Button>
        </div>
      </div>

      {value.sizes.length === 0 ? (
        <Alert type="info">Добавьте хотя бы один размер (обрезной формат), чтобы начать настройку.</Alert>
      ) : (
        <div className="simplified-template__grid">
          <div className="simplified-template__sizes">
            <div className="simplified-template__sizes-title">Обрезные форматы</div>
            {value.sizes.map(s => (
              <button
                key={s.id}
                type="button"
                className={`simplified-size ${selectedSizeId === s.id ? 'simplified-size--active' : ''}`}
                onClick={() => setSelectedSizeId(s.id)}
              >
                <div className="simplified-size__label">{s.label}</div>
                <div className="simplified-size__meta">{s.width_mm}×{s.height_mm}</div>
              </button>
            ))}
          </div>

          <div className="simplified-template__editor">
            {!selected ? (
              <Alert type="warning">Выберите размер слева.</Alert>
            ) : (
              <>
                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Размер</strong>
                      <div className="text-muted text-sm">Название и габариты (мм)</div>
                    </div>
                    <Button variant="error" size="sm" onClick={() => removeSize(selected.id)}>Удалить</Button>
                  </div>
                  <div className="simplified-card__content simplified-form-grid">
                    <FormField label="Название">
                      <input
                        className="form-input"
                        value={selected.label}
                        onChange={(e) => updateSize(selected.id, { label: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Ширина, мм">
                      <input
                        className="form-input"
                        value={String(selected.width_mm)}
                        onChange={(e) => updateSize(selected.id, { width_mm: Number(e.target.value) || 0 })}
                      />
                    </FormField>
                    <FormField label="Высота, мм">
                      <input
                        className="form-input"
                        value={String(selected.height_mm)}
                        onChange={(e) => updateSize(selected.id, { height_mm: Number(e.target.value) || 0 })}
                      />
                    </FormField>
                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Печать (цена за изделие)</strong>
                      <div className="text-muted text-sm">Для каждого набора (технология/цветность/стороны) задайте диапазоны тиража и цену за 1 изделие.</div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const firstTech = printTechs[0]?.code || ''
                        if (!firstTech) return
                        const nextRow = {
                          technology_code: firstTech,
                          color_mode: 'color' as const,
                          sides_mode: 'single' as const,
                          tiers: defaultTiers(),
                        }
                        updateSize(selected.id, { print_prices: [...selected.print_prices, nextRow] })
                      }}
                      disabled={loadingLists}
                    >
                      ➕ Цена печати
                    </Button>
                  </div>
                  <div className="simplified-card__content">
                    {selected.print_prices.length === 0 ? (
                      <div className="text-muted">Нет цен. Нажмите “➕ Цена печати”.</div>
                    ) : (
                      <div className="simplified-list">
                        {selected.print_prices.map((row, idx) => (
                          <div key={`${row.technology_code}_${row.color_mode}_${row.sides_mode}_${idx}`} className="simplified-row">
                            <div className="simplified-row__head">
                              <div className="simplified-row__title">
                                {techName(row.technology_code)} • {row.color_mode === 'color' ? 'полноцвет' : 'ч/б'} • {row.sides_mode === 'single' ? '1 сторона' : row.sides_mode === 'duplex' ? '2 стороны' : '2 стороны (ч/б оборот)'}
                              </div>
                              <div className="simplified-row__actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const next = selected.print_prices.map((r, i) => (i === idx ? { ...r, tiers: [...r.tiers, { min_qty: 1, max_qty: undefined, price: 0 }] } : r))
                                    updateSize(selected.id, { print_prices: next })
                                  }}
                                >
                                  ➕ Диапазон
                                </Button>
                                <Button
                                  variant="error"
                                  size="sm"
                                  onClick={() => {
                                    updateSize(selected.id, { print_prices: selected.print_prices.filter((_, i) => i !== idx) })
                                  }}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </div>

                            <div className="simplified-row__grid">
                              <FormField label="Технология">
                                <select
                                  className="form-select"
                                  value={row.technology_code}
                                  onChange={(e) => {
                                    const next = selected.print_prices.map((r, i) => (i === idx ? { ...r, technology_code: e.target.value } : r))
                                    updateSize(selected.id, { print_prices: next })
                                  }}
                                >
                                  {printTechs.map(t => (
                                    <option key={t.code} value={t.code}>{t.name}</option>
                                  ))}
                                </select>
                              </FormField>
                              <FormField label="Цветность">
                                <select
                                  className="form-select"
                                  value={row.color_mode}
                                  onChange={(e) => {
                                    const next = selected.print_prices.map((r, i) => (i === idx ? { ...r, color_mode: (e.target.value as any) } : r))
                                    updateSize(selected.id, { print_prices: next })
                                  }}
                                >
                                  <option value="color">полноцвет</option>
                                  <option value="bw">ч/б</option>
                                </select>
                              </FormField>
                              <FormField label="Стороны">
                                <select
                                  className="form-select"
                                  value={row.sides_mode}
                                  onChange={(e) => {
                                    const next = selected.print_prices.map((r, i) => (i === idx ? { ...r, sides_mode: (e.target.value as any) } : r))
                                    updateSize(selected.id, { print_prices: next })
                                  }}
                                >
                                  <option value="single">односторонняя</option>
                                  <option value="duplex">двухсторонняя</option>
                                  <option value="duplex_bw_back">с ч/б оборотом</option>
                                </select>
                              </FormField>
                            </div>

                            <div className="simplified-tiers">
                              {row.tiers.map((t, ti) => (
                                <div key={ti} className="simplified-tier">
                                  <div className="simplified-tier__range">
                                    <input
                                      className="form-input"
                                      value={String(t.min_qty)}
                                      onChange={(e) => {
                                        const v = Number(e.target.value) || 0
                                        const next = selected.print_prices.map((r, i) => {
                                          if (i !== idx) return r
                                          return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, min_qty: v } : tt)) }
                                        })
                                        updateSize(selected.id, { print_prices: next })
                                      }}
                                    />
                                    <span className="simplified-tier__dash">—</span>
                                    <input
                                      className="form-input"
                                      placeholder="∞"
                                      value={t.max_qty == null ? '' : String(t.max_qty)}
                                      onChange={(e) => {
                                        const raw = e.target.value
                                        const v = raw === '' ? undefined : (Number(raw) || undefined)
                                        const next = selected.print_prices.map((r, i) => {
                                          if (i !== idx) return r
                                          return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, max_qty: v } : tt)) }
                                        })
                                        updateSize(selected.id, { print_prices: next })
                                      }}
                                    />
                                  </div>
                                  <div className="simplified-tier__price">
                                    <input
                                      className="form-input"
                                      value={String(t.price)}
                                      onChange={(e) => {
                                        const v = Number(e.target.value) || 0
                                        const next = selected.print_prices.map((r, i) => {
                                          if (i !== idx) return r
                                          return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                        })
                                        updateSize(selected.id, { print_prices: next })
                                      }}
                                    />
                                    <span className="text-muted text-sm">за 1 изделие</span>
                                  </div>
                                  <Button
                                    variant="error"
                                    size="sm"
                                    onClick={() => {
                                      const next = selected.print_prices.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                      })
                                      updateSize(selected.id, { print_prices: next })
                                    }}
                                  >
                                    ✕
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Материалы (разрешённые)</strong>
                      <div className="text-muted text-sm">Выберите конкретные материалы. Для каждого можно задать цену “за изделие” по диапазонам.</div>
                    </div>
                  </div>
                  <div className="simplified-card__content">
                    <div className="simplified-materials">
                      {groupedMaterials.map(group => (
                        <div key={group.key} className="simplified-materials__group">
                          <div className="simplified-materials__group-title">{group.key}</div>
                          <div className="simplified-materials__items">
                            {group.items.map(m => {
                              const checked = selected.allowed_material_ids.includes(Number(m.id))
                              return (
                                <label key={m.id} className={`simplified-checkbox ${checked ? 'simplified-checkbox--checked' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const nextAllowed = checked
                                        ? selected.allowed_material_ids.filter(id => id !== Number(m.id))
                                        : [...selected.allowed_material_ids, Number(m.id)]
                                      updateSize(selected.id, { allowed_material_ids: nextAllowed })
                                    }}
                                  />
                                  <span>{m.name}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const firstId = selected.allowed_material_ids[0]
                          if (!firstId) return
                          updateSize(selected.id, {
                            material_prices: [
                              ...selected.material_prices,
                              { material_id: firstId, tiers: defaultTiers() },
                            ],
                          })
                        }}
                        disabled={selected.allowed_material_ids.length === 0}
                      >
                        ➕ Цена материала
                      </Button>
                    </div>

                    {selected.material_prices.length > 0 && (
                      <div className="simplified-list mt-3">
                        {selected.material_prices.map((mp, idx) => (
                          <div key={`${mp.material_id}_${idx}`} className="simplified-row">
                            <div className="simplified-row__head">
                              <div className="simplified-row__title">{materialName(mp.material_id)}</div>
                              <div className="simplified-row__actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const next = selected.material_prices.map((r, i) => (i === idx ? { ...r, tiers: [...r.tiers, { min_qty: 1, max_qty: undefined, price: 0 }] } : r))
                                    updateSize(selected.id, { material_prices: next })
                                  }}
                                >
                                  ➕ Диапазон
                                </Button>
                                <Button
                                  variant="error"
                                  size="sm"
                                  onClick={() => updateSize(selected.id, { material_prices: selected.material_prices.filter((_, i) => i !== idx) })}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </div>
                            <FormField label="Материал">
                              <select
                                className="form-select"
                                value={String(mp.material_id)}
                                onChange={(e) => {
                                  const v = Number(e.target.value)
                                  const next = selected.material_prices.map((r, i) => (i === idx ? { ...r, material_id: v } : r))
                                  updateSize(selected.id, { material_prices: next })
                                }}
                              >
                                {selected.allowed_material_ids.map(id => (
                                  <option key={id} value={id}>{materialName(id)}</option>
                                ))}
                              </select>
                            </FormField>
                            <div className="simplified-tiers">
                              {mp.tiers.map((t, ti) => (
                                <div key={ti} className="simplified-tier">
                                  <div className="simplified-tier__range">
                                    <input className="form-input" value={String(t.min_qty)} onChange={(e) => {
                                      const v = Number(e.target.value) || 0
                                      const next = selected.material_prices.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, min_qty: v } : tt)) }
                                      })
                                      updateSize(selected.id, { material_prices: next })
                                    }} />
                                    <span className="simplified-tier__dash">—</span>
                                    <input className="form-input" placeholder="∞" value={t.max_qty == null ? '' : String(t.max_qty)} onChange={(e) => {
                                      const raw = e.target.value
                                      const v = raw === '' ? undefined : (Number(raw) || undefined)
                                      const next = selected.material_prices.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, max_qty: v } : tt)) }
                                      })
                                      updateSize(selected.id, { material_prices: next })
                                    }} />
                                  </div>
                                  <div className="simplified-tier__price">
                                    <input className="form-input" value={String(t.price)} onChange={(e) => {
                                      const v = Number(e.target.value) || 0
                                      const next = selected.material_prices.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                      })
                                      updateSize(selected.id, { material_prices: next })
                                    }} />
                                    <span className="text-muted text-sm">за 1 изделие</span>
                                  </div>
                                  <Button variant="error" size="sm" onClick={() => {
                                    const next = selected.material_prices.map((r, i) => {
                                      if (i !== idx) return r
                                      return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                    })
                                    updateSize(selected.id, { material_prices: next })
                                  }}>✕</Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="simplified-card">
                  <div className="simplified-card__header">
                    <div>
                      <strong>Отделка (послепечатные услуги)</strong>
                      <div className="text-muted text-sm">Резка/биговка/фальцовка/ламинация. Цена задаётся “за рез/биг/фальц” или “за изделие”.</div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const first = services[0]
                        if (!first) return
                        updateSize(selected.id, {
                          finishing: [
                            ...selected.finishing,
                            { service_id: Number(first.id), price_unit: 'per_cut', units_per_item: 1, tiers: defaultTiers() },
                          ],
                        })
                      }}
                      disabled={loadingLists}
                    >
                      ➕ Услуга
                    </Button>
                  </div>
                  <div className="simplified-card__content">
                    {selected.finishing.length === 0 ? (
                      <div className="text-muted">Нет услуг. Нажмите “➕ Услуга”.</div>
                    ) : (
                      <div className="simplified-list">
                        {selected.finishing.map((f, idx) => (
                          <div key={`${f.service_id}_${idx}`} className="simplified-row">
                            <div className="simplified-row__head">
                              <div className="simplified-row__title">{svcName(f.service_id)}</div>
                              <div className="simplified-row__actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const next = selected.finishing.map((r, i) => (i === idx ? { ...r, tiers: [...r.tiers, { min_qty: 1, max_qty: undefined, price: 0 }] } : r))
                                    updateSize(selected.id, { finishing: next })
                                  }}
                                >
                                  ➕ Диапазон
                                </Button>
                                <Button
                                  variant="error"
                                  size="sm"
                                  onClick={() => updateSize(selected.id, { finishing: selected.finishing.filter((_, i) => i !== idx) })}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </div>
                            <div className="simplified-row__grid">
                              <FormField label="Услуга">
                                <select
                                  className="form-select"
                                  value={String(f.service_id)}
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    const next = selected.finishing.map((r, i) => (i === idx ? { ...r, service_id: v } : r))
                                    updateSize(selected.id, { finishing: next })
                                  }}
                                >
                                  {services.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </FormField>
                              <FormField label="Единица">
                                <select
                                  className="form-select"
                                  value={f.price_unit}
                                  onChange={(e) => {
                                    const v = e.target.value as any
                                    const next = selected.finishing.map((r, i) => (i === idx ? { ...r, price_unit: v } : r))
                                    updateSize(selected.id, { finishing: next })
                                  }}
                                >
                                  <option value="per_cut">за рез/биг/фальц</option>
                                  <option value="per_item">за изделие</option>
                                </select>
                              </FormField>
                              <FormField label="Ед. на изделие">
                                <input
                                  className="form-input"
                                  value={String(f.units_per_item)}
                                  onChange={(e) => {
                                    const v = Number(e.target.value) || 0
                                    const next = selected.finishing.map((r, i) => (i === idx ? { ...r, units_per_item: v } : r))
                                    updateSize(selected.id, { finishing: next })
                                  }}
                                />
                              </FormField>
                            </div>
                            <div className="simplified-tiers">
                              {f.tiers.map((t, ti) => (
                                <div key={ti} className="simplified-tier">
                                  <div className="simplified-tier__range">
                                    <input className="form-input" value={String(t.min_qty)} onChange={(e) => {
                                      const v = Number(e.target.value) || 0
                                      const next = selected.finishing.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, min_qty: v } : tt)) }
                                      })
                                      updateSize(selected.id, { finishing: next })
                                    }} />
                                    <span className="simplified-tier__dash">—</span>
                                    <input className="form-input" placeholder="∞" value={t.max_qty == null ? '' : String(t.max_qty)} onChange={(e) => {
                                      const raw = e.target.value
                                      const v = raw === '' ? undefined : (Number(raw) || undefined)
                                      const next = selected.finishing.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, max_qty: v } : tt)) }
                                      })
                                      updateSize(selected.id, { finishing: next })
                                    }} />
                                  </div>
                                  <div className="simplified-tier__price">
                                    <input className="form-input" value={String(t.price)} onChange={(e) => {
                                      const v = Number(e.target.value) || 0
                                      const next = selected.finishing.map((r, i) => {
                                        if (i !== idx) return r
                                        return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                      })
                                      updateSize(selected.id, { finishing: next })
                                    }} />
                                    <span className="text-muted text-sm">{f.price_unit === 'per_cut' ? 'за 1 рез/биг/фальц' : 'за 1 изделие'}</span>
                                  </div>
                                  <Button variant="error" size="sm" onClick={() => {
                                    const next = selected.finishing.map((r, i) => {
                                      if (i !== idx) return r
                                      return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                    })
                                    updateSize(selected.id, { finishing: next })
                                  }}>✕</Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal isOpen={showAddSize} onClose={() => setShowAddSize(false)} title="Добавить размер" size="md">
        <div className="simplified-add-size">
          <FormField label="Название" required>
            <input className="form-input" value={newSize.label} onChange={(e) => setNewSize({ ...newSize, label: e.target.value })} placeholder="Например: A4" />
          </FormField>
          <div className="simplified-form-grid">
            <FormField label="Ширина, мм" required>
              <input className="form-input" value={newSize.width_mm} onChange={(e) => setNewSize({ ...newSize, width_mm: e.target.value })} placeholder="210" />
            </FormField>
            <FormField label="Высота, мм" required>
              <input className="form-input" value={newSize.height_mm} onChange={(e) => setNewSize({ ...newSize, height_mm: e.target.value })} placeholder="297" />
            </FormField>
          </div>
          <div className="simplified-add-size__actions">
            <Button variant="secondary" onClick={() => setShowAddSize(false)}>Отмена</Button>
            <Button variant="primary" onClick={commitAddSize} disabled={!newSize.label.trim()}>Добавить</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


