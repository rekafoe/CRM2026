import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { Button, FormField, Alert, Modal } from '../../../components/common'
import type { CalculatorMaterial } from '../../../services/calculatorMaterialService'
import { getPaperTypesFromWarehouse, type PaperTypeForCalculator } from '../../../services/calculatorMaterialService'
import { getPrintTechnologies } from '../../../api'
import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import './SimplifiedTemplateSection.css'

type PrintTechRow = { code: string; name: string; is_active?: number | boolean }
type PaperTypeRow = PaperTypeForCalculator
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

// Фиксированные тиражи для отображения в таблице (для всех диапазонов)
const DISPLAY_TIERS = [1, 5, 10, 50, 100, 500, 1000] as const

type TierRangeModalState = {
  type: 'print' | 'material' | 'finishing'
  printIdx?: number
  materialIdx?: number
  finishingIdx?: number
  tierIdx?: number // для редактирования существующего диапазона
  isOpen: boolean
  minQty: string
  maxQty: string
}

export const SimplifiedTemplateSection: React.FC<Props> = ({ value, onChange, onSave, saving, allMaterials }) => {
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(value.sizes[0]?.id ?? null)
  const [paperTypes, setPaperTypes] = useState<PaperTypeRow[]>([])
  const [printTechs, setPrintTechs] = useState<PrintTechRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSize, setNewSize] = useState<{ label: string; width_mm: string; height_mm: string }>({ label: '', width_mm: '', height_mm: '' })
  const [selectedPaperTypeId, setSelectedPaperTypeId] = useState<string | null>(null)
  const [tierModal, setTierModal] = useState<TierRangeModalState>({
    type: 'print',
    isOpen: false,
    minQty: '1',
    maxQty: '',
  })

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
      // Автоматически выбираем первый тип бумаги, если он есть
      if (pt && pt.length > 0 && !selectedPaperTypeId) {
        setSelectedPaperTypeId(pt[0].id)
      }
    } finally {
      setLoadingLists(false)
    }
  }, [selectedPaperTypeId])

  // Загружаем списки при монтировании компонента
  useEffect(() => {
    if (paperTypes.length === 0 && printTechs.length === 0 && services.length === 0 && !loadingLists) {
      void loadLists()
    }
  }, [])

  // Закрытие модалки при клике вне её
  const tierModalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tierModal.isOpen && tierModalRef.current && !tierModalRef.current.contains(e.target as Node)) {
        setTierModal({ ...tierModal, isOpen: false })
      }
    }
    if (tierModal.isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [tierModal.isOpen])

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

  // Материалы выбранного типа бумаги
  const materialsForSelectedPaperType = useMemo(() => {
    if (!selectedPaperTypeId || !paperTypes.length) return []
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
                                <div className="simplified-row__add-range-wrapper">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setTierModal({
                                        type: 'print',
                                        printIdx: idx,
                                        isOpen: true,
                                        minQty: '1',
                                        maxQty: '',
                                      })
                                    }}
                                  >
                                    ➕ Диапазон
                                  </Button>
                                  {tierModal.isOpen && tierModal.type === 'print' && tierModal.printIdx === idx && (
                                    <div
                                      ref={tierModalRef}
                                      className="simplified-tier-modal"
                                      style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '4px',
                                        zIndex: 1000,
                                      }}
                                    >
                                      <div className="simplified-tier-modal__content">
                                        <div className="simplified-tier-modal__header">
                                          <strong>Добавить диапазон</strong>
                                          <button
                                            type="button"
                                            className="simplified-tier-modal__close"
                                            onClick={() => setTierModal({ ...tierModal, isOpen: false })}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                        <div className="simplified-tier-modal__body">
                                          <FormField label="От">
                                            <input
                                              className="form-input form-input--compact"
                                              type="number"
                                              min="1"
                                              step="1"
                                              value={tierModal.minQty}
                                              onChange={(e) => setTierModal({ ...tierModal, minQty: e.target.value })}
                                            />
                                          </FormField>
                                          <FormField label="До (оставьте пустым для ∞)">
                                            <input
                                              className="form-input form-input--compact"
                                              type="number"
                                              min="1"
                                              step="1"
                                              placeholder="∞"
                                              value={tierModal.maxQty}
                                              onChange={(e) => setTierModal({ ...tierModal, maxQty: e.target.value })}
                                            />
                                          </FormField>
                                          <div className="simplified-tier-modal__actions">
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => setTierModal({ ...tierModal, isOpen: false })}
                                            >
                                              Отмена
                                            </Button>
                                            <Button
                                              variant="primary"
                                              size="sm"
                                              onClick={() => {
                                                const minQty = Number(tierModal.minQty) || 1
                                                const maxQty = tierModal.maxQty === '' ? undefined : (Number(tierModal.maxQty) || undefined)
                                                const next = selected.print_prices.map((r, i) => {
                                                  if (i !== idx) return r
                                                  return { ...r, tiers: [...r.tiers, { min_qty: minQty, max_qty: maxQty, price: 0 }] }
                                                })
                                                updateSize(selected.id, { print_prices: next })
                                                setTierModal({ ...tierModal, isOpen: false })
                                              }}
                                            >
                                              Добавить
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
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

                            {row.tiers.length > 0 && (
                              <div className="simplified-tiers-table">
                                <table className="simplified-table simplified-table--compact">
                                  <thead>
                                    <tr>
                                      <th>От</th>
                                      <th>До</th>
                                      {DISPLAY_TIERS.map(tier => (
                                        <th key={tier}>{tier}x</th>
                                      ))}
                                      <th>1000-∞x</th>
                                      <th></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.tiers.map((t, ti) => (
                                      <tr key={ti}>
                                        <td className="simplified-table__range-cell">{t.min_qty}</td>
                                        <td className="simplified-table__range-cell">{t.max_qty == null ? '∞' : t.max_qty}</td>
                                        {DISPLAY_TIERS.map(tier => (
                                          <td key={tier}>
                                            <input
                                              className="form-input form-input--compact-table"
                                              type="number"
                                              min="0"
                                              step="1"
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
                                          </td>
                                        ))}
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="1"
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
                                        </td>
                                        <td>
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
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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
                      <div className="text-muted text-sm">Выберите тип бумаги, затем конкретные материалы с чекбоксами. Для каждого можно задать цену "за изделие" по диапазонам.</div>
                    </div>
                  </div>
                  <div className="simplified-card__content">
                    <FormField label="Тип бумаги">
                      <select
                        className="form-select"
                        value={selectedPaperTypeId || ''}
                        onChange={(e) => setSelectedPaperTypeId(e.target.value || null)}
                        disabled={loadingLists || paperTypes.length === 0}
                      >
                        {paperTypes.length === 0 ? (
                          <option value="">Загрузка...</option>
                        ) : (
                          <>
                            <option value="">-- Выберите тип бумаги --</option>
                            {paperTypes.map(pt => (
                              <option key={pt.id} value={pt.id}>{pt.display_name || pt.name}</option>
                            ))}
                          </>
                        )}
                      </select>
                    </FormField>

                    {selectedPaperTypeId && materialsForSelectedPaperType.length > 0 && (
                      <div className="simplified-materials mt-3">
                        <div className="simplified-materials__group-title mb-2">Материалы ({materialsForSelectedPaperType.length})</div>
                        <div className="simplified-materials__items">
                          {materialsForSelectedPaperType.map(m => {
                            const checked = selected.allowed_material_ids.includes(Number(m.id))
                            const densityInfo = paperTypes.find(pt => pt.id === selectedPaperTypeId)
                              ?.densities?.find(d => d.material_id === Number(m.id))
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
                                <span>
                                  {m.name}
                                  {densityInfo && <span className="text-muted text-sm"> ({densityInfo.value} г/м²)</span>}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {selectedPaperTypeId && materialsForSelectedPaperType.length === 0 && !loadingLists && (
                      <Alert type="info" className="mt-3">Нет материалов для выбранного типа бумаги.</Alert>
                    )}

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
                            {mp.tiers.length > 0 && (
                              <div className="simplified-tiers-table">
                                <table className="simplified-table simplified-table--compact">
                                  <thead>
                                    <tr>
                                      <th>От</th>
                                      <th>До</th>
                                      {DISPLAY_TIERS.map(tier => (
                                        <th key={tier}>{tier}x</th>
                                      ))}
                                      <th>1000-∞x</th>
                                      <th></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mp.tiers.map((t, ti) => (
                                      <tr key={ti}>
                                        <td className="simplified-table__range-cell">{t.min_qty}</td>
                                        <td className="simplified-table__range-cell">{t.max_qty == null ? '∞' : t.max_qty}</td>
                                        {DISPLAY_TIERS.map(tier => (
                                          <td key={tier}>
                                            <input
                                              className="form-input form-input--compact-table"
                                              type="number"
                                              min="0"
                                              step="1"
                                              value={String(t.price)}
                                              onChange={(e) => {
                                                const v = Number(e.target.value) || 0
                                                const next = selected.material_prices.map((r, i) => {
                                                  if (i !== idx) return r
                                                  return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                                })
                                                updateSize(selected.id, { material_prices: next })
                                              }}
                                            />
                                          </td>
                                        ))}
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={String(t.price)}
                                            onChange={(e) => {
                                              const v = Number(e.target.value) || 0
                                              const next = selected.material_prices.map((r, i) => {
                                                if (i !== idx) return r
                                                return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                              })
                                              updateSize(selected.id, { material_prices: next })
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <Button
                                            variant="error"
                                            size="sm"
                                            onClick={() => {
                                              const next = selected.material_prices.map((r, i) => {
                                                if (i !== idx) return r
                                                return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                              })
                                              updateSize(selected.id, { material_prices: next })
                                            }}
                                          >
                                            ✕
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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
                        if (!first || loadingLists) return
                        updateSize(selected.id, {
                          finishing: [
                            ...selected.finishing,
                            { service_id: Number(first.id), price_unit: 'per_cut', units_per_item: 1, tiers: defaultTiers() },
                          ],
                        })
                      }}
                      disabled={loadingLists || services.length === 0}
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
                                <div className="simplified-row__add-range-wrapper">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setTierModal({
                                        type: 'finishing',
                                        finishingIdx: idx,
                                        isOpen: true,
                                        minQty: '1',
                                        maxQty: '',
                                      })
                                    }}
                                  >
                                    ➕ Диапазон
                                  </Button>
                                  {tierModal.isOpen && tierModal.type === 'finishing' && tierModal.finishingIdx === idx && (
                                    <div
                                      ref={tierModalRef}
                                      className="simplified-tier-modal"
                                      style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: '4px',
                                        zIndex: 1000,
                                      }}
                                    >
                                      <div className="simplified-tier-modal__content">
                                        <div className="simplified-tier-modal__header">
                                          <strong>Добавить диапазон</strong>
                                          <button
                                            type="button"
                                            className="simplified-tier-modal__close"
                                            onClick={() => setTierModal({ ...tierModal, isOpen: false })}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                        <div className="simplified-tier-modal__body">
                                          <FormField label="От">
                                            <input
                                              className="form-input form-input--compact"
                                              type="number"
                                              min="1"
                                              step="1"
                                              value={tierModal.minQty}
                                              onChange={(e) => setTierModal({ ...tierModal, minQty: e.target.value })}
                                            />
                                          </FormField>
                                          <FormField label="До (оставьте пустым для ∞)">
                                            <input
                                              className="form-input form-input--compact"
                                              type="number"
                                              min="1"
                                              step="1"
                                              placeholder="∞"
                                              value={tierModal.maxQty}
                                              onChange={(e) => setTierModal({ ...tierModal, maxQty: e.target.value })}
                                            />
                                          </FormField>
                                          <div className="simplified-tier-modal__actions">
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => setTierModal({ ...tierModal, isOpen: false })}
                                            >
                                              Отмена
                                            </Button>
                                            <Button
                                              variant="primary"
                                              size="sm"
                                              onClick={() => {
                                                const minQty = Number(tierModal.minQty) || 1
                                                const maxQty = tierModal.maxQty === '' ? undefined : (Number(tierModal.maxQty) || undefined)
                                                const next = selected.finishing.map((r, i) => {
                                                  if (i !== idx) return r
                                                  return { ...r, tiers: [...r.tiers, { min_qty: minQty, max_qty: maxQty, price: 0 }] }
                                                })
                                                updateSize(selected.id, { finishing: next })
                                                setTierModal({ ...tierModal, isOpen: false })
                                              }}
                                            >
                                              Добавить
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
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
                            {f.tiers.length > 0 && (
                              <div className="simplified-tiers-table">
                                <table className="simplified-table simplified-table--compact">
                                  <thead>
                                    <tr>
                                      <th>От</th>
                                      <th>До</th>
                                      {DISPLAY_TIERS.map(tier => (
                                        <th key={tier}>{tier}x</th>
                                      ))}
                                      <th>1000-∞x</th>
                                      <th></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.tiers.map((t, ti) => (
                                      <tr key={ti}>
                                        <td className="simplified-table__range-cell">{t.min_qty}</td>
                                        <td className="simplified-table__range-cell">{t.max_qty == null ? '∞' : t.max_qty}</td>
                                        {DISPLAY_TIERS.map(tier => (
                                          <td key={tier}>
                                            <input
                                              className="form-input form-input--compact-table"
                                              type="number"
                                              min="0"
                                              step="1"
                                              value={String(t.price)}
                                              onChange={(e) => {
                                                const v = Number(e.target.value) || 0
                                                const next = selected.finishing.map((r, i) => {
                                                  if (i !== idx) return r
                                                  return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                                })
                                                updateSize(selected.id, { finishing: next })
                                              }}
                                            />
                                          </td>
                                        ))}
                                        <td>
                                          <input
                                            className="form-input form-input--compact-table"
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={String(t.price)}
                                            onChange={(e) => {
                                              const v = Number(e.target.value) || 0
                                              const next = selected.finishing.map((r, i) => {
                                                if (i !== idx) return r
                                                return { ...r, tiers: r.tiers.map((tt, j) => (j === ti ? { ...tt, price: v } : tt)) }
                                              })
                                              updateSize(selected.id, { finishing: next })
                                            }}
                                          />
                                        </td>
                                        <td>
                                          <Button
                                            variant="error"
                                            size="sm"
                                            onClick={() => {
                                              const next = selected.finishing.map((r, i) => {
                                                if (i !== idx) return r
                                                return { ...r, tiers: r.tiers.filter((_, j) => j !== ti) }
                                              })
                                              updateSize(selected.id, { finishing: next })
                                            }}
                                          >
                                            ✕
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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


