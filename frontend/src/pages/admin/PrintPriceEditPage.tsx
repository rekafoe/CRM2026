import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Button, FormField, Alert } from '../../components/common';
import { api } from '../../api';
import type { PrintPrice, PrintPriceTier } from '../../components/admin/hooks/usePricingManagementState';
import '../../components/admin/PricingManagement.css';

const PRICE_MODES = [
  { key: 'color_single', label: 'Цвет, односторонняя' },
  { key: 'color_duplex', label: 'Цвет, двусторонняя' },
  { key: 'bw_single', label: 'ЧБ, односторонняя' },
  { key: 'bw_duplex', label: 'ЧБ, двусторонняя' },
] as const;

const DEFAULT_TIER_BOUNDARIES = [1, 5, 10, 50, 100, 500, 1000];

function buildDefaultTiers(priceMode: string): PrintPriceTier[] {
  return DEFAULT_TIER_BOUNDARIES.map((min, i) => ({
    price_mode: priceMode,
    min_sheets: min,
    max_sheets: i < DEFAULT_TIER_BOUNDARIES.length - 1 ? DEFAULT_TIER_BOUNDARIES[i + 1] - 1 : undefined,
    price_per_sheet: 0,
  }));
}

/** Поле цены: при вводе хранит строку для 3.05; число записывается по blur */
const PriceCell: React.FC<{
  value: number
  onChange: (v: number) => void
  className?: string
}> = ({ value, onChange, className }) => {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const displayValue = isFocused ? inputValue : String(value ?? 0)
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={displayValue}
      onFocus={() => {
        setInputValue(String(value ?? 0))
        setIsFocused(true)
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '' || /^\d*[.,]?\d*$/.test(raw)) setInputValue(raw)
      }}
      onBlur={() => {
        const normalized = inputValue.replace(',', '.')
        if (normalized === '') {
          onChange(0)
        } else {
          const num = parseFloat(normalized)
          if (!Number.isNaN(num) && num >= 0) onChange(num)
        }
        setIsFocused(false)
      }}
    />
  )
}

type SheetTier = { min_sheets: number; max_sheets?: number; price_per_sheet: number }

const addRangeBoundary = (tiers: SheetTier[], newBoundary: number): SheetTier[] => {
  if (tiers.length === 0) {
    return [
      { min_sheets: 1, max_sheets: newBoundary - 1, price_per_sheet: 0 },
      { min_sheets: newBoundary, max_sheets: undefined, price_per_sheet: 0 },
    ]
  }
  const sortedTiers = [...tiers].sort((a, b) => a.min_sheets - b.min_sheets)
  const existingBoundary = sortedTiers.find((t) => t.min_sheets === newBoundary)
  if (existingBoundary) return sortedTiers

  const targetIndex = sortedTiers.findIndex((t) => {
    const max = t.max_sheets !== undefined ? t.max_sheets + 1 : Infinity
    return newBoundary >= t.min_sheets && newBoundary < max
  })

  if (targetIndex === -1) {
    const lastTier = sortedTiers[sortedTiers.length - 1]
    if (lastTier.max_sheets === undefined) {
      const newTiers = [...sortedTiers]
      newTiers[newTiers.length - 1] = { ...lastTier, max_sheets: newBoundary - 1 }
      newTiers.push({ min_sheets: newBoundary, max_sheets: undefined, price_per_sheet: 0 })
      return normalizeSheetTiers(newTiers)
    }
    sortedTiers.push({ min_sheets: newBoundary, max_sheets: undefined, price_per_sheet: 0 })
    return normalizeSheetTiers(sortedTiers)
  }

  const targetTier = sortedTiers[targetIndex]
  if (newBoundary === targetTier.min_sheets) return sortedTiers

  const newTiers = [...sortedTiers]
  newTiers[targetIndex] = { ...targetTier, max_sheets: newBoundary - 1 }
  newTiers.splice(targetIndex + 1, 0, {
    min_sheets: newBoundary,
    max_sheets: targetTier.max_sheets,
    price_per_sheet: 0,
  })
  return normalizeSheetTiers(newTiers)
}

const editRangeBoundary = (tiers: SheetTier[], tierIndex: number, newBoundary: number): SheetTier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_sheets - b.min_sheets)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers
  const existingBoundary = sortedTiers.find((t, i) => i !== tierIndex && t.min_sheets === newBoundary)
  if (existingBoundary) return sortedTiers

  const editedTier = sortedTiers[tierIndex]
  const newTiers = [...sortedTiers]
  newTiers[tierIndex] = { ...editedTier, min_sheets: newBoundary }
  if (tierIndex > 0) {
    newTiers[tierIndex - 1] = { ...newTiers[tierIndex - 1], max_sheets: newBoundary - 1 }
  }
  return normalizeSheetTiers(newTiers)
}

const removeRange = (tiers: SheetTier[], tierIndex: number): SheetTier[] => {
  const sortedTiers = [...tiers].sort((a, b) => a.min_sheets - b.min_sheets)
  if (tierIndex < 0 || tierIndex >= sortedTiers.length) return tiers
  if (sortedTiers.length <= 1) return sortedTiers

  const newTiers = [...sortedTiers]
  const removedTier = newTiers[tierIndex]
  if (tierIndex > 0) {
    const prevTier = newTiers[tierIndex - 1]
    newTiers[tierIndex - 1] = { ...prevTier, max_sheets: removedTier.max_sheets }
  } else if (tierIndex < newTiers.length - 1) {
    const nextTier = newTiers[tierIndex + 1]
    newTiers[tierIndex + 1] = { ...nextTier, min_sheets: 1 }
  }
  newTiers.splice(tierIndex, 1)
  return normalizeSheetTiers(newTiers)
}

const normalizeSheetTiers = (tiers: SheetTier[]): SheetTier[] => {
  if (tiers.length === 0) return [{ min_sheets: 1, max_sheets: undefined, price_per_sheet: 0 }]
  const sorted = [...tiers].sort((a, b) => a.min_sheets - b.min_sheets)
  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i] = { ...sorted[i], max_sheets: sorted[i + 1].min_sheets - 1 }
  }
  if (sorted.length > 0) {
    sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max_sheets: undefined }
  }
  return sorted
}

type TierModalState = {
  type: 'add' | 'edit'
  tierIndex?: number
  isOpen: boolean
  boundary: string
  anchorElement?: HTMLElement
}

export const PrintPriceEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // На маршруте /print-prices/new параметр id отсутствует (undefined),
  // поэтому это тоже режим создания.
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printTechnologies, setPrintTechnologies] = useState<{ code: string; name: string }[]>([]);

  const [form, setForm] = useState({
    technology_code: '',
    counter_unit: 'sheets' as 'sheets' | 'meters',
    sheet_width_mm: 320,
    sheet_height_mm: 450,
    price_bw_single: 0,
    price_bw_duplex: 0,
    price_color_single: 0,
    price_color_duplex: 0,
    price_bw_per_meter: null as number | null,
    price_color_per_meter: null as number | null,
    tiers: [] as PrintPriceTier[],
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [techRes, priceRes] = await Promise.all([
        api.get<{ code: string; name: string }[]>('/printing-technologies'),
        isNew ? null : api.get<PrintPrice & { tiers?: PrintPriceTier[] }>(`/pricing/print-prices/${id}`),
      ]);
      setPrintTechnologies(Array.isArray(techRes.data) ? techRes.data : []);

      if (!isNew && priceRes?.data) {
        const item = priceRes.data as PrintPrice & { tiers?: PrintPriceTier[] };
        const loadedTiers = (item.tiers ?? []) as PrintPriceTier[];
        setForm({
          technology_code: item.technology_code || '',
          counter_unit: (item.counter_unit as 'sheets' | 'meters') || 'sheets',
          sheet_width_mm: (item as any).sheet_width_mm ?? 320,
          sheet_height_mm: (item as any).sheet_height_mm ?? 450,
          price_bw_single: item.price_bw_single ?? 0,
          price_bw_duplex: item.price_bw_duplex ?? 0,
          price_color_single: item.price_color_single ?? 0,
          price_color_duplex: item.price_color_duplex ?? 0,
          price_bw_per_meter: item.price_bw_per_meter ?? null,
          price_color_per_meter: item.price_color_per_meter ?? null,
          tiers: loadedTiers.length > 0 ? loadedTiers : PRICE_MODES.flatMap((m) => buildDefaultTiers(m.key)),
        });
      } else if (isNew) {
        setForm((prev) => ({
          ...prev,
          tiers: PRICE_MODES.flatMap((m) => buildDefaultTiers(m.key)),
        }));
      }
    } catch (e) {
      setError('Ошибка загрузки данных');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateForm = useCallback((patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTierPrice = useCallback((priceMode: string, minSheets: number, price: number) => {
    setForm((prev) => {
      const existing = prev.tiers.find((t) => t.price_mode === priceMode && t.min_sheets === minSheets)
      if (existing) {
        return {
          ...prev,
          tiers: prev.tiers.map((t) =>
            t.price_mode === priceMode && t.min_sheets === minSheets ? { ...t, price_per_sheet: price } : t
          ),
        }
      }
      const allMins = [...new Set(prev.tiers.map((t) => t.min_sheets))].sort((a, b) => a - b)
      const nextIdx = allMins.indexOf(minSheets) + 1
      const max_sheets = nextIdx < allMins.length ? allMins[nextIdx] - 1 : undefined
      return {
        ...prev,
        tiers: [...prev.tiers, { price_mode: priceMode, min_sheets: minSheets, max_sheets, price_per_sheet: price }],
      }
    })
  }, [])

  const ensureTiersForMode = useCallback((priceMode: string) => {
    setForm((prev) => {
      const hasMode = prev.tiers.some((t) => t.price_mode === priceMode);
      if (hasMode) return prev;
      return { ...prev, tiers: [...prev.tiers, ...buildDefaultTiers(priceMode)] };
    });
  }, []);

  const [tierModal, setTierModal] = useState<TierModalState>({
    type: 'add',
    isOpen: false,
    boundary: '',
  });
  const tierModalRef = useRef<HTMLDivElement>(null);

  const getCommonRanges = useCallback((): SheetTier[] => {
    const allMinSheets = [...new Set(form.tiers.map((t) => t.min_sheets))].sort((a, b) => a - b)
    if (allMinSheets.length === 0) {
      return DEFAULT_TIER_BOUNDARIES.map((min, i) => ({
        min_sheets: min,
        max_sheets: i < DEFAULT_TIER_BOUNDARIES.length - 1 ? DEFAULT_TIER_BOUNDARIES[i + 1] - 1 : undefined,
        price_per_sheet: 0,
      }))
    }
    return allMinSheets.map((min, i) => ({
      min_sheets: min,
      max_sheets: i < allMinSheets.length - 1 ? allMinSheets[i + 1] - 1 : undefined,
      price_per_sheet: 0,
    }))
  }, [form.tiers])

  const updateAllModesRanges = useCallback((newRanges: SheetTier[]) => {
    setForm((prev) => {
      const priceMap = new Map<string, number>()
      for (const t of prev.tiers) {
        priceMap.set(`${t.price_mode}:${t.min_sheets}`, t.price_per_sheet)
      }
      const newTiers: PrintPriceTier[] = []
      for (const mode of PRICE_MODES) {
        for (const r of newRanges) {
          newTiers.push({
            price_mode: mode.key,
            min_sheets: r.min_sheets,
            max_sheets: r.max_sheets,
            price_per_sheet: priceMap.get(`${mode.key}:${r.min_sheets}`) ?? 0,
          })
        }
      }
      return { ...prev, tiers: newTiers }
    })
  }, [])

  const handleSave = async () => {
    if (!form.technology_code) {
      setError('Выберите технологию печати');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        ...form,
        sheet_width_mm: form.counter_unit === 'sheets' ? form.sheet_width_mm : undefined,
        sheet_height_mm: form.counter_unit === 'sheets' ? form.sheet_height_mm : undefined,
        tiers: form.counter_unit === 'sheets' ? form.tiers : undefined,
      };
      if (isNew) {
        await api.post('/pricing/print-prices', payload);
      } else {
        await api.put(`/pricing/print-prices/${id}`, payload);
      }
      navigate('/adminpanel/printers');
    } catch (e) {
      setError('Ошибка сохранения');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminPageLayout title="Загрузка..." icon="📄" onBack={() => navigate('/adminpanel/printers')}>
        <div className="p-4">Загрузка...</div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={isNew ? 'Новая цена печати' : `Редактирование: ${form.technology_code}`}
      icon="📄"
      onBack={() => navigate('/adminpanel/printers')}
      headerExtra={
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Сохранить
        </Button>
      }
    >
      <div className="print-price-edit-page">
        {error && (
          <Alert type="error" onClose={() => setError(null)} className="mb-4">
            {error}
          </Alert>
        )}

        <div className="data-card mb-4">
          <div className="card-header">
            <h4>Основные параметры</h4>
          </div>
          <div className="card-content">
            <div className="form-grid">
              <FormField label="Технология печати">
                <select
                  className="form-control"
                  value={form.technology_code}
                  onChange={(e) => updateForm({ technology_code: e.target.value })}
                  disabled={!isNew}
                >
                  <option value="">— выберите —</option>
                  {printTechnologies.map((t) => (
                    <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Единица учёта">
                <select
                  className="form-control"
                  value={form.counter_unit}
                  onChange={(e) => updateForm({ counter_unit: e.target.value as 'sheets' | 'meters' })}
                >
                  <option value="sheets">Листы</option>
                  <option value="meters">Пог. метры</option>
                </select>
              </FormField>
            </div>

            {form.counter_unit === 'sheets' && (
              <FormField label="Размер печатного листа (мм)" className="mt-3">
                <div className="flex gap-2 align-center">
                  <input
                    type="number"
                    className="form-control"
                    value={form.sheet_width_mm}
                    onChange={(e) => updateForm({ sheet_width_mm: Number(e.target.value) || 320 })}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    className="form-control"
                    value={form.sheet_height_mm}
                    onChange={(e) => updateForm({ sheet_height_mm: Number(e.target.value) || 450 })}
                  />
                  <span className="text-muted">SRA3 = 320×450</span>
                </div>
              </FormField>
            )}

            {form.counter_unit === 'meters' && (
              <div className="form-grid mt-3">
                <FormField label="ЧБ, пог. метр">
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={form.price_bw_per_meter ?? ''}
                    onChange={(e) => updateForm({ price_bw_per_meter: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </FormField>
                <FormField label="Цвет, пог. метр">
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={form.price_color_per_meter ?? ''}
                    onChange={(e) => updateForm({ price_color_per_meter: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </FormField>
              </div>
            )}
          </div>
        </div>

        {form.counter_unit === 'sheets' && (
          <div className="data-card">
            <div className="card-header">
              <h4>Цены за лист по диапазонам тиража</h4>
              <p className="text-muted text-sm">Укажите цену за 1 лист для каждого диапазона листов</p>
            </div>
            <div className="card-content">
              {(() => {
                const commonRanges = getCommonRanges()
                const hasTiers = commonRanges.length > 0
                if (!hasTiers) {
                  return (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        updateAllModesRanges(
                          DEFAULT_TIER_BOUNDARIES.map((min, i) => ({
                            min_sheets: min,
                            max_sheets: i < DEFAULT_TIER_BOUNDARIES.length - 1 ? DEFAULT_TIER_BOUNDARIES[i + 1] - 1 : undefined,
                            price_per_sheet: 0,
                          }))
                        )
                      }
                    >
                      Добавить диапазоны
                    </Button>
                  )
                }
                return (
                  <div className="simplified-tiers-table">
                    <table className="simplified-table simplified-table--compact">
                      <thead>
                        <tr>
                          <th>Параметры печати (цена за лист)</th>
                          {commonRanges.map((t, ti) => {
                            const rangeLabel = t.max_sheets == null ? `${t.min_sheets} - ∞` : String(t.min_sheets)
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
                                        boundary: String(t.min_sheets),
                                        anchorElement: undefined,
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
                                      onClick={() => updateAllModesRanges(removeRange(commonRanges, ti))}
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
                                  type="button"
                                  className="el-button el-button--info el-button--mini is-plain"
                                  style={{ width: '100%', marginLeft: '0px' }}
                                  onClick={(e) => {
                                    const button = e.currentTarget as HTMLElement
                                    setTierModal({
                                      type: 'add',
                                      isOpen: true,
                                      boundary: '',
                                      anchorElement: button,
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
                        {/* Полноцветная - родительская строка */}
                        <tr className="simplified-table__parent-row">
                          <td className="simplified-table__parent-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="полноцветная"
                                  style={{ cursor: 'default', backgroundColor: '#f5f7fa' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((_, ti) => (
                            <td key={`color-empty-${ti}`} style={{ backgroundColor: '#f5f7fa' }}></td>
                          ))}
                          <td style={{ backgroundColor: '#f5f7fa' }}></td>
                        </tr>
                        {/* Цвет, односторонняя */}
                        <tr className="simplified-table__child-row">
                          <td className="simplified-table__child-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="односторонняя"
                                  style={{ cursor: 'default' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((t, ti) => {
                            const priceTier = form.tiers.find((rt) => rt.price_mode === 'color_single' && rt.min_sheets === t.min_sheets)
                            return (
                              <td key={ti}>
                                <PriceCell
                                  className="form-input form-input--compact-table"
                                  value={priceTier?.price_per_sheet ?? 0}
                                  onChange={(v) => updateTierPrice('color_single', t.min_sheets, v)}
                                />
                              </td>
                            )
                          })}
                          <td></td>
                        </tr>
                        {/* Цвет, двусторонняя */}
                        <tr className="simplified-table__child-row">
                          <td className="simplified-table__child-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="двухсторонняя"
                                  style={{ cursor: 'default' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((t, ti) => {
                            const priceTier = form.tiers.find((rt) => rt.price_mode === 'color_duplex' && rt.min_sheets === t.min_sheets)
                            return (
                              <td key={ti}>
                                <PriceCell
                                  className="form-input form-input--compact-table"
                                  value={priceTier?.price_per_sheet ?? 0}
                                  onChange={(v) => updateTierPrice('color_duplex', t.min_sheets, v)}
                                />
                              </td>
                            )
                          })}
                          <td></td>
                        </tr>
                        {/* Черно-белая - родительская строка */}
                        <tr className="simplified-table__parent-row">
                          <td className="simplified-table__parent-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="черно-белая"
                                  style={{ cursor: 'default', backgroundColor: '#f5f7fa' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((_, ti) => (
                            <td key={`bw-empty-${ti}`} style={{ backgroundColor: '#f5f7fa' }}></td>
                          ))}
                          <td style={{ backgroundColor: '#f5f7fa' }}></td>
                        </tr>
                        {/* ЧБ, односторонняя */}
                        <tr className="simplified-table__child-row">
                          <td className="simplified-table__child-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="односторонняя"
                                  style={{ cursor: 'default' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((t, ti) => {
                            const priceTier = form.tiers.find((rt) => rt.price_mode === 'bw_single' && rt.min_sheets === t.min_sheets)
                            return (
                              <td key={ti}>
                                <PriceCell
                                  className="form-input form-input--compact-table"
                                  value={priceTier?.price_per_sheet ?? 0}
                                  onChange={(v) => updateTierPrice('bw_single', t.min_sheets, v)}
                                />
                              </td>
                            )
                          })}
                          <td></td>
                        </tr>
                        {/* ЧБ, двусторонняя */}
                        <tr className="simplified-table__child-row">
                          <td className="simplified-table__child-cell">
                            <div className="el-select el-select--small" style={{ width: '100%' }}>
                              <div className="el-input el-input--small el-input--suffix">
                                <input
                                  type="text"
                                  readOnly
                                  className="el-input__inner"
                                  value="двухсторонняя"
                                  style={{ cursor: 'default' }}
                                />
                                <span className="el-input__suffix">
                                  <span className="el-input__suffix-inner">
                                    <i className="el-select__caret el-input__icon el-icon-arrow-up"></i>
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                          {commonRanges.map((t, ti) => {
                            const priceTier = form.tiers.find((rt) => rt.price_mode === 'bw_duplex' && rt.min_sheets === t.min_sheets)
                            return (
                              <td key={ti}>
                                <PriceCell
                                  className="form-input form-input--compact-table"
                                  value={priceTier?.price_per_sheet ?? 0}
                                  onChange={(v) => updateTierPrice('bw_duplex', t.min_sheets, v)}
                                />
                              </td>
                            )
                          })}
                          <td></td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Модалка для добавления/редактирования диапазонов */}
                    {tierModal.isOpen && (
                      <div
                        ref={tierModalRef}
                        className="simplified-tier-modal"
                        style={
                          tierModal.anchorElement
                            ? {
                                position: 'absolute',
                                top: `${tierModal.anchorElement.getBoundingClientRect().bottom + 5}px`,
                                left: `${tierModal.anchorElement.getBoundingClientRect().left}px`,
                                zIndex: 2003,
                              }
                            : {
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                zIndex: 2003,
                              }
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="simplified-tier-modal__content" onClick={(e) => e.stopPropagation()}>
                          <div className="simplified-tier-modal__header">
                            <strong>{tierModal.type === 'add' ? 'Добавить диапазон' : 'Редактировать диапазон'}</strong>
                            <button
                              type="button"
                              className="simplified-tier-modal__close"
                              onClick={() => setTierModal({ type: 'add', isOpen: false, boundary: '' })}
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
                                onChange={(e) => setTierModal({ ...tierModal, boundary: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.stopPropagation()}
                              />
                            </FormField>
                            <div className="simplified-tier-modal__actions" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setTierModal({ type: 'add', isOpen: false, boundary: '' })}
                              >
                                Отменить
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  const boundary = Number(tierModal.boundary)
                                  if (!boundary || boundary < 1) return

                                  const currentRanges = getCommonRanges()
                                  let newRanges: SheetTier[]

                                  if (tierModal.type === 'add') {
                                    newRanges = addRangeBoundary(currentRanges, boundary)
                                  } else if (tierModal.tierIndex !== undefined) {
                                    newRanges = editRangeBoundary(currentRanges, tierModal.tierIndex, boundary)
                                  } else {
                                    return
                                  }

                                  updateAllModesRanges(newRanges)
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
                )
              })()}
            </div>
          </div>
        )}

        {form.counter_unit === 'sheets' && (
          <div className="data-card mt-4">
            <div className="card-header">
              <h4>Плоские цены (запасной вариант)</h4>
              <p className="text-muted text-sm">Используются, если диапазоны не заданы</p>
            </div>
            <div className="card-content form-grid">
              <FormField label="ЧБ, односторонняя">
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={form.price_bw_single}
                  onChange={(e) => updateForm({ price_bw_single: parseFloat(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="ЧБ, двусторонняя">
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={form.price_bw_duplex}
                  onChange={(e) => updateForm({ price_bw_duplex: parseFloat(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="Цвет, односторонняя">
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={form.price_color_single}
                  onChange={(e) => updateForm({ price_color_single: parseFloat(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="Цвет, двусторонняя">
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={form.price_color_duplex}
                  onChange={(e) => updateForm({ price_color_duplex: parseFloat(e.target.value) || 0 })}
                />
              </FormField>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
};

export default PrintPriceEditPage;
