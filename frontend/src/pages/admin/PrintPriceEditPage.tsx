import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Button, FormField, Alert, LoadingState } from '../../components/common';
import { AppIcon } from '../../components/ui';
import { api } from '../../api';
import type {
  PrintPrice,
  PrintPriceTier,
  PrintPriceRollM2Tier,
} from '../../components/admin/hooks/usePricingManagementState';
import '../../components/admin/PricingManagement.css';
import { useTierRangeFloating, TIER_RANGE_POPOVER_Z_INDEX, tierModalFloatingRef } from '../../features/productTemplate/hooks/useTierRangeFloating';
import { PriceCell } from '../../features/productTemplate/components/PriceCell';
import { MoneyAmount } from '../../components/ui';
import {
  formatCounterUnit,
  formatM2PricingKind,
  PRINTERS_PRINT_TAB_URL,
  resolveTechnologyName,
} from '../../components/admin/pricing/printPriceDisplay';

const M2_LAYER_KEYS = ['color', 'white', 'varnish'] as const;
type M2LayerKey = (typeof M2_LAYER_KEYS)[number];
const M2_LAYER_LABELS: Record<M2LayerKey, string> = {
  color: 'Цвет',
  white: 'Белый',
  varnish: 'Лак',
};

const PrintPriceModeLabel: React.FC<{ children: string; muted?: boolean; child?: boolean }> = ({
  children,
  muted,
  child,
}) => (
  <span
    className={`print-price-mode-label${muted ? ' print-price-mode-label--muted' : ''}${child ? ' print-price-mode-label--child' : ''}`}
  >
    {children}
  </span>
);

const PRICE_MODES = [
  { key: 'color_single', label: 'Цвет, односторонняя' },
  { key: 'color_duplex', label: 'Цвет, двусторонняя' },
  { key: 'bw_single', label: 'ЧБ, односторонняя' },
  { key: 'bw_duplex', label: 'ЧБ, двусторонняя' },
] as const;
const PRICE_MODES_COLOR_ONLY = PRICE_MODES.filter((mode) => !mode.key.startsWith('bw_'));

const DEFAULT_TIER_BOUNDARIES = [1, 5, 10, 50, 100, 500, 1000];

function buildDefaultTiers(priceMode: string): PrintPriceTier[] {
  return DEFAULT_TIER_BOUNDARIES.map((min, i) => ({
    price_mode: priceMode,
    min_sheets: min,
    max_sheets: i < DEFAULT_TIER_BOUNDARIES.length - 1 ? DEFAULT_TIER_BOUNDARIES[i + 1] - 1 : undefined,
    price_per_sheet: 0,
  }));
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

type PrintTechnologyOption = {
  code: string
  name: string
  supports_bw?: number | boolean
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
  const [printTechnologies, setPrintTechnologies] = useState<PrintTechnologyOption[]>([]);
  const [m2LayerTab, setM2LayerTab] = useState<M2LayerKey>('color');
  const [m2PreviewLoading, setM2PreviewLoading] = useState(false);
  const [m2Preview, setM2Preview] = useState<{
    unit_price: number;
    total_price: number;
    min_charge_applied: boolean;
  } | null>(null);

  const [form, setForm] = useState({
    technology_code: '',
    counter_unit: 'sheets' as 'sheets' | 'meters' | 'm2',
    m2_pricing_kind: 'uv_flatbed' as 'uv_flatbed' | 'roll_wide',
    sheet_width_mm: 320,
    sheet_height_mm: 450,
    price_bw_per_meter: null as number | null,
    price_color_per_meter: null as number | null,
    price_color_per_m2: null as number | null,
    price_white_per_m2: null as number | null,
    price_varnish_per_m2: null as number | null,
    min_charge: 0,
    max_width_mm: 600,
    max_height_mm: 900,
    tiers: [] as PrintPriceTier[],
    m2_tiers: [] as Array<{ layer: string; min_m2: number; max_m2?: number | null; price_per_m2: number }>,
    roll_m2_tiers: [] as PrintPriceRollM2Tier[],
  });

  const selectedTech = printTechnologies.find((t) => t.code === form.technology_code);
  const technologySupportsBw = selectedTech ? selectedTech.supports_bw !== 0 && selectedTech.supports_bw !== false : true;
  const activeSheetModes = technologySupportsBw ? PRICE_MODES : PRICE_MODES_COLOR_ONLY;
  const isRollWideM2Profile = form.counter_unit === 'm2' && form.m2_pricing_kind === 'roll_wide';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [techRes, priceRes] = await Promise.all([
        api.get<PrintTechnologyOption[]>('/printing-technologies'),
        isNew
          ? null
          : api.get<
              PrintPrice & {
                tiers?: PrintPriceTier[];
                m2_tiers?: typeof form.m2_tiers;
                roll_m2_tiers?: PrintPriceRollM2Tier[];
              }
            >(`/pricing/print-prices/${id}`),
      ]);
      setPrintTechnologies(Array.isArray(techRes.data) ? techRes.data : []);

      if (!isNew && priceRes?.data) {
        const item = priceRes.data as PrintPrice & {
          tiers?: PrintPriceTier[];
          m2_tiers?: typeof form.m2_tiers;
          roll_m2_tiers?: PrintPriceRollM2Tier[];
        };
        const loadedTiers = (item.tiers ?? []) as PrintPriceTier[];
        setForm({
          technology_code: item.technology_code || '',
          counter_unit: (item.counter_unit as 'sheets' | 'meters' | 'm2') || 'sheets',
          m2_pricing_kind:
            (item.m2_pricing_kind as 'uv_flatbed' | 'roll_wide' | undefined) ??
            (item.technology_code === 'uv' ? 'uv_flatbed' : 'roll_wide'),
          sheet_width_mm: (item as any).sheet_width_mm ?? 320,
          sheet_height_mm: (item as any).sheet_height_mm ?? 450,
          price_bw_per_meter: item.price_bw_per_meter ?? null,
          price_color_per_meter: item.price_color_per_meter ?? null,
          price_color_per_m2: (item as any).price_color_per_m2 ?? null,
          price_white_per_m2: (item as any).price_white_per_m2 ?? null,
          price_varnish_per_m2: (item as any).price_varnish_per_m2 ?? null,
          min_charge: (item as any).min_charge ?? 0,
          max_width_mm: (item as any).max_width_mm ?? 600,
          max_height_mm: (item as any).max_height_mm ?? 900,
          tiers: loadedTiers.length > 0 ? loadedTiers : PRICE_MODES.flatMap((m) => buildDefaultTiers(m.key)),
          m2_tiers: Array.isArray((item as any).m2_tiers) ? (item as any).m2_tiers : [],
          roll_m2_tiers: Array.isArray((item as any).roll_m2_tiers) ? (item as any).roll_m2_tiers : [],
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

  useEffect(() => {
    if (technologySupportsBw) return;
    setForm((prev) => ({
      ...prev,
      price_bw_per_meter: null,
      tiers: prev.tiers.filter((tier) => !String(tier.price_mode).startsWith('bw_')),
    }));
  }, [technologySupportsBw]);

  useEffect(() => {
    if (form.counter_unit !== 'm2' || form.m2_pricing_kind !== 'roll_wide') return;
    setM2Preview(null);
    setForm((prev) => ({
      ...prev,
      price_white_per_m2: null,
      price_varnish_per_m2: null,
    }));
  }, [form.counter_unit, form.m2_pricing_kind]);

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
  const tierRangeFloating = useTierRangeFloating(
    tierModal.anchorElement ?? null,
    Boolean(tierModal.isOpen && tierModal.anchorElement)
  );

  useEffect(() => {
    const el = tierModalRef.current;
    if (!el || !tierModal.isOpen) return;

    el.style.zIndex = String(TIER_RANGE_POPOVER_Z_INDEX);

    if (tierModal.anchorElement && tierRangeFloating.floatingStyles) {
      const fs = tierRangeFloating.floatingStyles;
      el.style.position = (fs.position as string) ?? 'fixed';
      el.style.top = fs.top != null ? String(fs.top) : '';
      el.style.left = fs.left != null ? String(fs.left) : '';
      el.style.transform = fs.transform != null ? String(fs.transform) : '';
    } else {
      el.style.position = 'fixed';
      el.style.top = '50%';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%, -50%)';
    }
  }, [tierModal.isOpen, tierModal.anchorElement, tierRangeFloating.floatingStyles]);

  useEffect(() => {
    if (!tierModal.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!tierModalRef.current) return;
      const target = e.target as HTMLElement;

      if (tierModalRef.current.contains(target)) return;

      const button = target.closest('button');
      if (button) {
        const buttonText = button.textContent || '';
        if (buttonText.includes('Диапазон')) return;
      }

      setTierModal((prev) => ({ ...prev, isOpen: false, tierIndex: undefined, anchorElement: undefined }));
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [tierModal.isOpen]);

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
      for (const mode of activeSheetModes) {
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
  }, [activeSheetModes])

  const techDisplayName = form.technology_code
    ? resolveTechnologyName(form.technology_code, printTechnologies)
    : '';

  const fetchM2Preview = async () => {
    if (form.counter_unit !== 'm2' || form.m2_pricing_kind !== 'uv_flatbed' || !form.technology_code) return;
    setM2PreviewLoading(true);
    setError(null);
    try {
      const res = await api.get('/pricing/print-prices/derive-m2', {
        params: {
          technology_code: form.technology_code,
          width_mm: 100,
          height_mm: 100,
          quantity: 1,
          uv_print: JSON.stringify({ color: { enabled: true, passes: 1 } }),
        },
      });
      setM2Preview({
        unit_price: res.data.unit_price,
        total_price: res.data.total_price,
        min_charge_applied: res.data.min_charge_applied,
      });
    } catch {
      setM2Preview(null);
      setError('Превью недоступно: проверьте сохранённые центральные ставки для этой технологии.');
    } finally {
      setM2PreviewLoading(false);
    }
  };

  const addM2TierForLayer = (layer: M2LayerKey) => {
    const layerTiers = form.m2_tiers.filter((t) => t.layer === layer);
    const maxMin = layerTiers.reduce((m, t) => Math.max(m, t.min_m2), -1);
    const nextMin = maxMin >= 0 ? maxMin + 0.001 : 0;
    updateForm({
      m2_tiers: [
        ...form.m2_tiers,
        { layer, min_m2: nextMin, max_m2: null, price_per_m2: 0 },
      ],
    });
  };

  const addRollM2Tier = () => {
    const maxMin = form.roll_m2_tiers.reduce((m, t) => Math.max(m, t.min_total_m2), -1);
    const nextMin = maxMin >= 0 ? Number((maxMin + 0.001).toFixed(3)) : 0;
    updateForm({
      roll_m2_tiers: [
        ...form.roll_m2_tiers,
        { min_total_m2: nextMin, max_total_m2: null, price_per_m2: 0 },
      ],
    });
  };

  const m2TiersForActiveLayer = form.m2_tiers
    .map((tier, idx) => ({ tier, idx }))
    .filter(({ tier }) => tier.layer === m2LayerTab);

  const handleSave = async () => {
    if (!form.technology_code) {
      setError('Выберите технологию печати');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const normalizedSheetTiers = (form.tiers || []).filter((tier) =>
        activeSheetModes.some((mode) => mode.key === tier.price_mode),
      );
      const payload = {
        ...form,
        m2_pricing_kind: form.counter_unit === 'm2' ? form.m2_pricing_kind : undefined,
        sheet_width_mm: form.counter_unit === 'sheets' ? form.sheet_width_mm : undefined,
        sheet_height_mm: form.counter_unit === 'sheets' ? form.sheet_height_mm : undefined,
        tiers: form.counter_unit === 'sheets' ? normalizedSheetTiers : undefined,
        m2_tiers:
          form.counter_unit === 'm2' && form.m2_pricing_kind === 'uv_flatbed' ? form.m2_tiers : undefined,
        roll_m2_tiers:
          form.counter_unit === 'm2' && form.m2_pricing_kind === 'roll_wide' ? form.roll_m2_tiers : undefined,
        price_bw_per_meter: technologySupportsBw ? form.price_bw_per_meter : null,
        price_white_per_m2:
          form.counter_unit === 'm2' && form.m2_pricing_kind === 'uv_flatbed' ? form.price_white_per_m2 : null,
        price_varnish_per_m2:
          form.counter_unit === 'm2' && form.m2_pricing_kind === 'uv_flatbed' ? form.price_varnish_per_m2 : null,
      };
      if (isNew) {
        await api.post('/pricing/print-prices', payload);
      } else {
        await api.put(`/pricing/print-prices/${id}`, payload);
      }
      navigate(PRINTERS_PRINT_TAB_URL);
    } catch (e) {
      setError('Ошибка сохранения');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminPageLayout
        title="Загрузка..."
        icon={<AppIcon name="document" size="md" />}
        onBack={() => navigate(PRINTERS_PRINT_TAB_URL)}
        className="pricing-page"
      >
        <LoadingState message="Загрузка цены печати..." />
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={isNew ? 'Новая цена печати' : `Редактирование: ${form.technology_code}`}
      icon={<AppIcon name="document" size="md" />}
      onBack={() => navigate(PRINTERS_PRINT_TAB_URL)}
      className="pricing-page"
      headerExtra={
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Сохранить
        </Button>
      }
    >
      <div className="print-price-edit-page pricing-glass">
        {error && (
          <Alert type="error" onClose={() => setError(null)} className="mb-4">
            {error}
          </Alert>
        )}

        <div className="print-price-edit-page__breadcrumb">
          Принтеры → Цены печати
          {form.technology_code ? ` → ${techDisplayName}` : ''}
        </div>

        {form.technology_code && (
          <div className="print-price-edit-page__chips">
            <span className="pricing-chip">{form.technology_code}</span>
            <span className="pricing-chip">{formatCounterUnit(form.counter_unit)}</span>
            {form.counter_unit === 'm2' && (
              <span className="pricing-chip">{formatM2PricingKind(form.m2_pricing_kind)}</span>
            )}
            {form.counter_unit === 'm2' && form.m2_pricing_kind === 'uv_flatbed' && (
              <span className="pricing-chip">
                стол {form.max_width_mm}×{form.max_height_mm} мм
              </span>
            )}
          </div>
        )}

        <div className="data-card mb-4">
          <div className="card-header">
            <h4>Основное</h4>
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
                  onChange={(e) => updateForm({ counter_unit: e.target.value as 'sheets' | 'meters' | 'm2' })}
                >
                  <option value="sheets">Листы</option>
                  <option value="meters">Пог. метры</option>
                  <option value="m2">Кв. метры</option>
                </select>
              </FormField>
              {form.counter_unit === 'm2' && (
                <FormField label="m² профиль">
                  <select
                    className="form-control"
                    value={form.m2_pricing_kind}
                    onChange={(e) =>
                      updateForm({ m2_pricing_kind: e.target.value as 'uv_flatbed' | 'roll_wide' })
                    }
                  >
                    <option value="uv_flatbed">УФ-планшет</option>
                    <option value="roll_wide">ШФП рулон</option>
                  </select>
                </FormField>
              )}
            </div>

            {!technologySupportsBw && (
              <Alert type="info" className="mt-3">
                Для выбранной технологии отключён Ч/Б режим: доступны только цветные ставки.
              </Alert>
            )}

            {form.counter_unit === 'sheets' && (
              <FormField label="Размер печатного листа (мм)" className="mt-3">
                <div className="flex gap-2 items-center">
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

          </div>
        </div>

        {(form.counter_unit === 'm2' || form.counter_unit === 'meters') && (
          <div className="data-card mb-4">
            <div className="card-header">
              <h4>Ставки</h4>
              <p className="text-muted text-sm">
                {form.counter_unit === 'm2'
                  ? isRollWideM2Profile
                    ? 'Базовая цветная ставка руб/м² + минимум на позицию (профиль ШФП рулон).'
                    : 'Базовые руб/м² по слоям и минимум на позицию заказа (профиль УФ).'
                  : 'Плоские ставки за погонный метр.'}
              </p>
            </div>
            <div className="card-content">
              {form.counter_unit === 'm2' && (
                <>
                  <div className="form-grid">
                    <FormField label="Цвет, руб/м² (база)">
                      <input type="number" step="0.01" className="form-control" value={form.price_color_per_m2 ?? ''} onChange={(e) => updateForm({ price_color_per_m2: e.target.value ? parseFloat(e.target.value) : null })} />
                    </FormField>
                    {form.m2_pricing_kind === 'uv_flatbed' && (
                      <>
                        <FormField label="Белый, руб/м² (база)">
                          <input type="number" step="0.01" className="form-control" value={form.price_white_per_m2 ?? ''} onChange={(e) => updateForm({ price_white_per_m2: e.target.value ? parseFloat(e.target.value) : null })} />
                        </FormField>
                        <FormField label="Лак, руб/м² (база)">
                          <input type="number" step="0.01" className="form-control" value={form.price_varnish_per_m2 ?? ''} onChange={(e) => updateForm({ price_varnish_per_m2: e.target.value ? parseFloat(e.target.value) : null })} />
                        </FormField>
                      </>
                    )}
                    <FormField label="Мин. заказ на печать">
                      <input type="number" step="0.01" className="form-control" value={form.min_charge} onChange={(e) => updateForm({ min_charge: parseFloat(e.target.value) || 0 })} />
                    </FormField>
                    {form.m2_pricing_kind === 'uv_flatbed' && (
                      <>
                        <FormField label="Макс. ширина стола (мм)">
                          <input type="number" className="form-control" value={form.max_width_mm} onChange={(e) => updateForm({ max_width_mm: Number(e.target.value) || 600 })} />
                        </FormField>
                        <FormField label="Макс. высота стола (мм)">
                          <input type="number" className="form-control" value={form.max_height_mm} onChange={(e) => updateForm({ max_height_mm: Number(e.target.value) || 900 })} />
                        </FormField>
                      </>
                    )}
                  </div>
                  {form.m2_pricing_kind === 'uv_flatbed' ? (
                    <>
                      <div className="mt-3">
                        <Button variant="secondary" size="sm" onClick={fetchM2Preview} loading={m2PreviewLoading}>
                          Превью расчёта (100×100 мм, цвет 1 проход)
                        </Button>
                      </div>
                      {m2Preview && (
                        <div className="print-price-m2-preview">
                          <div>
                            За 1 шт.: <MoneyAmount value={m2Preview.unit_price} />
                            {' · '}
                            Позиция: <MoneyAmount value={m2Preview.total_price} />
                          </div>
                          {m2Preview.min_charge_applied && (
                            <div className="text-muted text-sm">Применён минимальный заказ на печать</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted text-sm mt-3">
                      Для профиля «ШФП рулон» используются только цветные ставки и ступени по total_m².
                    </div>
                  )}
                </>
              )}
              {form.counter_unit === 'meters' && (
                <div className="form-grid">
                  {technologySupportsBw && (
                    <FormField label="ЧБ, пог. метр">
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={form.price_bw_per_meter ?? ''}
                        onChange={(e) => updateForm({ price_bw_per_meter: e.target.value ? parseFloat(e.target.value) : null })}
                      />
                    </FormField>
                  )}
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
        )}

        {form.counter_unit === 'meters' && (
          <div className="data-card mb-4">
            <div className="card-header">
              <h4>Ступени</h4>
            </div>
            <div className="card-content text-muted text-sm">
              Для погонного метра ступени по тиражу не настраиваются — используются плоские ставки выше.
            </div>
          </div>
        )}

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
                                    className="simplified-table__range-cell--clickable"
                                    onClick={(e) => {
                                      setTierModal({
                                        type: 'edit',
                                        tierIndex: ti,
                                        isOpen: true,
                                        boundary: String(t.min_sheets),
                                        anchorElement: e.currentTarget as HTMLElement,
                                      })
                                    }}
                                  >
                                    {rangeLabel}
                                  </span>
                                  <span>
                                    <button
                                      type="button"
                                      className="simplified-table__remove-range"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateAllModesRanges(removeRange(commonRanges, ti));
                                      }}
                                      aria-label="Удалить диапазон"
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
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="simplified-row__add-range-btn"
                                  onClick={(e) => {
                                    if (!e) return;
                                    e.stopPropagation();
                                    setTierModal({
                                      type: 'add',
                                      isOpen: true,
                                      boundary: '',
                                      anchorElement: e.currentTarget as HTMLElement,
                                    })
                                  }}
                                >
                                  + Диапазон
                                </Button>
                              </div>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Полноцветная - родительская строка */}
                        <tr className="simplified-table__parent-row">
                          <td className="simplified-table__parent-cell">
                            <PrintPriceModeLabel muted>полноцветная</PrintPriceModeLabel>
                          </td>
                          {commonRanges.map((_, ti) => (
                            <td key={`color-empty-${ti}`} className="simplified-table__parent-fill"></td>
                          ))}
                          <td className="simplified-table__parent-fill"></td>
                        </tr>
                        {/* Цвет, односторонняя */}
                        <tr className="simplified-table__child-row">
                          <td className="simplified-table__child-cell">
                            <PrintPriceModeLabel child>односторонняя</PrintPriceModeLabel>
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
                            <PrintPriceModeLabel child>двухсторонняя</PrintPriceModeLabel>
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
                        {technologySupportsBw && (
                          <>
                            {/* Черно-белая - родительская строка */}
                            <tr className="simplified-table__parent-row">
                              <td className="simplified-table__parent-cell">
                                <PrintPriceModeLabel muted>черно-белая</PrintPriceModeLabel>
                              </td>
                              {commonRanges.map((_, ti) => (
                                <td key={`bw-empty-${ti}`} className="simplified-table__parent-fill"></td>
                              ))}
                              <td className="simplified-table__parent-fill"></td>
                            </tr>
                            {/* ЧБ, односторонняя */}
                            <tr className="simplified-table__child-row">
                              <td className="simplified-table__child-cell">
                                <PrintPriceModeLabel child>односторонняя</PrintPriceModeLabel>
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
                                <PrintPriceModeLabel child>двухсторонняя</PrintPriceModeLabel>
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
                          </>
                        )}
                      </tbody>
                    </table>

                    {/* Модалка для добавления/редактирования диапазонов */}
                    {tierModal.isOpen && createPortal(
                      <div
                        ref={tierModalFloatingRef(tierModalRef, tierRangeFloating.setFloating, Boolean(tierModal.anchorElement))}
                        className="simplified-tier-modal pricing-glass"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="simplified-tier-modal__content" onClick={(e) => e.stopPropagation()}>
                          <div className="simplified-tier-modal__header">
                            <strong>{tierModal.type === 'add' ? 'Добавить диапазон' : 'Редактировать диапазон'}</strong>
                            <button
                              type="button"
                              className="simplified-tier-modal__close"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTierModal({ type: 'add', isOpen: false, boundary: '', tierIndex: undefined, anchorElement: undefined });
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
                                onClick={(e) => {
                                  e?.stopPropagation();
                                  setTierModal({ type: 'add', isOpen: false, boundary: '', tierIndex: undefined, anchorElement: undefined });
                                }}
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
                                  setTierModal({ type: 'add', isOpen: false, boundary: '', tierIndex: undefined, anchorElement: undefined })
                                }}
                              >
                                {tierModal.type === 'add' ? 'Добавить' : 'Сохранить'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {form.counter_unit === 'm2' && (
          <div className="data-card mt-4">
            <div className="card-header">
              <h4>Ступени по объёму (total_m²)</h4>
              {form.m2_pricing_kind === 'uv_flatbed' ? (
                <p className="text-muted text-sm">
                  Для каждого слоя — своя шкала; если ступеней нет, применяются базовые ставки из блока «Ставки».
                </p>
              ) : (
                <p className="text-muted text-sm">
                  Ось: total_m² = площадь изделия × тираж. Профиль ШФП рулон использует только цветные ступени.
                </p>
              )}
            </div>
            <div className="card-content">
              {form.m2_pricing_kind === 'uv_flatbed' ? (
                <>
                  <div className="print-price-m2-layer-tabs">
                    {M2_LAYER_KEYS.map((layer) => (
                      <button
                        key={layer}
                        type="button"
                        className={`print-price-m2-layer-tab ${m2LayerTab === layer ? 'print-price-m2-layer-tab--active' : ''}`}
                        onClick={() => setM2LayerTab(layer)}
                      >
                        {M2_LAYER_LABELS[layer]}
                        {' '}
                        ({form.m2_tiers.filter((t) => t.layer === layer).length})
                      </button>
                    ))}
                  </div>
                  <table className="simplified-table simplified-table--compact">
                    <thead>
                      <tr>
                        <th>От м²</th>
                        <th>До м²</th>
                        <th>Руб/м²</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {m2TiersForActiveLayer.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-sm">
                            Нет ступеней для слоя «{M2_LAYER_LABELS[m2LayerTab]}» — используется базовая ставка.
                          </td>
                        </tr>
                      ) : (
                        m2TiersForActiveLayer.map(({ tier, idx }) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="number"
                                step="0.001"
                                min={0}
                                className="form-control"
                                value={tier.min_m2}
                                onChange={(e) => {
                                  const next = [...form.m2_tiers];
                                  next[idx] = { ...next[idx], min_m2: parseFloat(e.target.value) || 0 };
                                  updateForm({ m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.001"
                                className="form-control"
                                placeholder="∞"
                                value={tier.max_m2 ?? ''}
                                onChange={(e) => {
                                  const next = [...form.m2_tiers];
                                  next[idx] = {
                                    ...next[idx],
                                    max_m2: e.target.value ? parseFloat(e.target.value) : null,
                                  };
                                  updateForm({ m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                className="form-control"
                                value={tier.price_per_m2}
                                onChange={(e) => {
                                  const next = [...form.m2_tiers];
                                  next[idx] = { ...next[idx], price_per_m2: parseFloat(e.target.value) || 0 };
                                  updateForm({ m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => updateForm({ m2_tiers: form.m2_tiers.filter((_, i) => i !== idx) })}
                              >
                                Удалить
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => addM2TierForLayer(m2LayerTab)}
                  >
                    + Добавить ступень ({M2_LAYER_LABELS[m2LayerTab]})
                  </Button>
                </>
              ) : (
                <>
                  <table className="simplified-table simplified-table--compact">
                    <thead>
                      <tr>
                        <th>От total_m²</th>
                        <th>До total_m²</th>
                        <th>Руб/м²</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {form.roll_m2_tiers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-sm">
                            Нет ступеней total_m² — используется базовая цветная ставка.
                          </td>
                        </tr>
                      ) : (
                        form.roll_m2_tiers.map((tier, idx) => (
                          <tr key={idx}>
                            <td>
                              <input
                                type="number"
                                step="0.001"
                                min={0}
                                className="form-control"
                                value={tier.min_total_m2}
                                onChange={(e) => {
                                  const next = [...form.roll_m2_tiers];
                                  next[idx] = { ...next[idx], min_total_m2: parseFloat(e.target.value) || 0 };
                                  updateForm({ roll_m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.001"
                                className="form-control"
                                placeholder="∞"
                                value={tier.max_total_m2 ?? ''}
                                onChange={(e) => {
                                  const next = [...form.roll_m2_tiers];
                                  next[idx] = {
                                    ...next[idx],
                                    max_total_m2: e.target.value ? parseFloat(e.target.value) : null,
                                  };
                                  updateForm({ roll_m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                className="form-control"
                                value={tier.price_per_m2}
                                onChange={(e) => {
                                  const next = [...form.roll_m2_tiers];
                                  next[idx] = { ...next[idx], price_per_m2: parseFloat(e.target.value) || 0 };
                                  updateForm({ roll_m2_tiers: next });
                                }}
                              />
                            </td>
                            <td>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  updateForm({ roll_m2_tiers: form.roll_m2_tiers.filter((_, i) => i !== idx) })
                                }
                              >
                                Удалить
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={addRollM2Tier}>
                    + Добавить ступень
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </AdminPageLayout>
  );
};

export default PrintPriceEditPage;
