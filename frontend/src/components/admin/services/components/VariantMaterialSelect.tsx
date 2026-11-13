/**
 * Линковка материала списания — только на листовых строках (где задаётся цена).
 */
import React, { useCallback } from 'react';
import type { VariantWithTiers } from './ServiceVariantsTable.types';

export type VariantMaterialPatch = {
  material_id: number | null;
  qty_per_item: number;
  consumption_mode?: 'fixed' | 'roll_feed';
  meter_basis?: 'knife_path' | 'feed';
};

export interface VariantMaterialSelectProps {
  variant: VariantWithTiers;
  materials: Array<{ id: number; name: string; sheet_width?: number | null }>;
  priceUnit?: string;
  onUpdate: (variantId: number, patch: VariantMaterialPatch) => void;
  /** Лист переплёта: имя склада без ширины, норма рядом, без режима рулона */
  bindingLeaf?: boolean;
}

function formatMaterialOption(m: { id: number; name: string; sheet_width?: number | null }): string {
  const w = m.sheet_width != null ? Number(m.sheet_width) : NaN;
  if (Number.isFinite(w) && w > 0) {
    return `${m.name} (${w} мм)`;
  }
  return m.name;
}

export const VariantMaterialSelect: React.FC<VariantMaterialSelectProps> = ({
  variant,
  materials,
  priceUnit,
  onUpdate,
  bindingLeaf = false,
}) => {
  const pu = String(priceUnit || '').toLowerCase();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value === '' ? null : Number(e.target.value);
      const mat = val != null ? materials.find((m) => m.id === val) : undefined;
      const hasRollWidth =
        mat?.sheet_width != null &&
        Number.isFinite(Number(mat.sheet_width)) &&
        Number(mat.sheet_width) > 0;
      const nextMode: 'fixed' | 'roll_feed' = bindingLeaf
        ? 'fixed'
        : val != null && (pu === 'per_m2' || pu === 'per_meter' || hasRollWidth)
          ? 'roll_feed'
          : ((variant.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed');
      onUpdate(variant.id, {
        material_id: val,
        qty_per_item: variant.qty_per_item ?? 1,
        consumption_mode: nextMode,
        ...(bindingLeaf ? {} : { meter_basis: (variant.meter_basis ?? 'feed') as 'knife_path' | 'feed' }),
      });
    },
    [bindingLeaf, materials, onUpdate, pu, variant]
  );

  if (materials.length === 0 && !bindingLeaf) return null;

  const commitQty = (raw: string) => {
    const parsed = Number(raw);
    onUpdate(variant.id, {
      material_id: variant.material_id ?? null,
      qty_per_item: Number.isFinite(parsed) && parsed >= 0 ? parsed : 1,
      consumption_mode: 'fixed',
    });
  };

  return (
    <div className={bindingLeaf ? 'variant-material-select variant-material-select--binding' : 'variant-material-select'}>
      <label className="variant-material-select__label" htmlFor={`variant-mat-${variant.id}`}>
        {bindingLeaf ? 'Материал листа' : 'Материал'}
      </label>
      <select
        id={`variant-mat-${variant.id}`}
        className="variant-material-select__control"
        value={variant.material_id ?? ''}
        onChange={handleChange}
        title={bindingLeaf ? 'Пусто — берётся материал услуги' : 'Материал для списания и ширины рулона (раскладка подачи)'}
      >
        <option value="">{bindingLeaf ? 'Как у услуги' : '— Без списания'}</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {bindingLeaf ? m.name : formatMaterialOption(m)}
          </option>
        ))}
      </select>
      {bindingLeaf && (
        <>
          <p className="variant-material-select__hint">Пусто — берётся материал услуги. Если выбран — в заказе этот.</p>
          <label className="variant-material-select__norm" htmlFor={`variant-qty-${variant.id}`}>
            <span>Норма</span>
            <input
              id={`variant-qty-${variant.id}`}
              type="number"
              min={0}
              step="0.01"
              defaultValue={variant.qty_per_item ?? 1}
              key={`${variant.id}:${variant.qty_per_item ?? 1}`}
              onBlur={(event) => commitQty(event.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
};
