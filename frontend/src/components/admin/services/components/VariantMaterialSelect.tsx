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
      const nextMode: 'fixed' | 'roll_feed' =
        val != null && (pu === 'per_m2' || hasRollWidth)
          ? 'roll_feed'
          : ((variant.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed');
      onUpdate(variant.id, {
        material_id: val,
        qty_per_item: variant.qty_per_item ?? 1,
        consumption_mode: nextMode,
        meter_basis: (variant.meter_basis ?? 'feed') as 'knife_path' | 'feed',
      });
    },
    [materials, onUpdate, pu, variant]
  );

  if (materials.length === 0) return null;

  return (
    <div className="variant-material-select">
      <label className="variant-material-select__label" htmlFor={`variant-mat-${variant.id}`}>
        Материал
      </label>
      <select
        id={`variant-mat-${variant.id}`}
        className="variant-material-select__control"
        value={variant.material_id ?? ''}
        onChange={handleChange}
        title="Материал для списания и ширины биллинга per_m2"
      >
        <option value="">— Без списания</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {formatMaterialOption(m)}
          </option>
        ))}
      </select>
    </div>
  );
};
