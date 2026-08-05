/**
 * Блок «Списание материалов по вариантам» — иерархия по типам.
 */
import React from 'react';
import { VariantWithTiers, VariantsByType } from './ServiceVariantsTable.types';

export interface ServiceVariantsMaterialsSectionProps {
  typeNames: string[];
  groupedVariants: VariantsByType;
  materials: Array<{ id: number; name: string }>;
  onUpdateMaterial: (
    variantId: number,
    patch: {
      material_id: number | null;
      qty_per_item: number;
      consumption_mode?: 'fixed' | 'roll_feed';
      meter_basis?: 'knife_path' | 'feed';
    }
  ) => void;
}

export const ServiceVariantsMaterialsSection: React.FC<ServiceVariantsMaterialsSectionProps> = ({
  typeNames,
  groupedVariants,
  materials,
  onUpdateMaterial,
}) => {
  const consumptionModeOptions: Array<{ value: 'fixed' | 'roll_feed'; label: string }> = [
    { value: 'fixed', label: 'fixed' },
    { value: 'roll_feed', label: 'roll_feed' },
  ];
  const meterBasisOptions: Array<{ value: 'feed' | 'knife_path'; label: string }> = [
    { value: 'feed', label: 'feed' },
    { value: 'knife_path', label: 'knife_path' },
  ];

  const materialsByType = typeNames.map((typeName) => {
    const typeGroup = groupedVariants[typeName];
    const flat: Array<{ variant: VariantWithTiers; label: string }> = [];
    typeGroup.level0.forEach((v) => flat.push({ variant: v, label: '—' }));
    typeGroup.level1.forEach((children) => children.forEach((v) => flat.push({ variant: v, label: v.variantName })));
    typeGroup.level2.forEach((children) => children.forEach((v) => flat.push({ variant: v, label: (v.parameters?.subType as string) || v.variantName })));
    return { typeName, rows: flat };
  });

  return (
    <div className="service-variants-materials-section" style={{ marginBottom: 12, padding: 8, background: '#f8f9fa', borderRadius: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Списание материалов по вариантам</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {materialsByType.map(({ typeName, rows }) => (
          <div key={typeName} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>{typeName}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingLeft: 12 }}>
              {rows.map(({ variant: v, label }) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ minWidth: 100, fontSize: 13 }} title={v.variantName}>{label}:</span>
                  <select
                    value={v.material_id ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      onUpdateMaterial(v.id, {
                        material_id: val,
                        qty_per_item: v.qty_per_item ?? 1,
                        consumption_mode: (v.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed',
                        meter_basis: (v.meter_basis ?? 'feed') as 'knife_path' | 'feed',
                      });
                    }}
                    style={{ padding: 4, minWidth: 140 }}
                  >
                    <option value="">— Без списания</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.qty_per_item ?? 1}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      if (!Number.isNaN(num) && num >= 0) {
                        onUpdateMaterial(v.id, {
                          material_id: v.material_id ?? null,
                          qty_per_item: num,
                          consumption_mode: (v.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed',
                          meter_basis: (v.meter_basis ?? 'feed') as 'knife_path' | 'feed',
                        });
                      }
                    }}
                    style={{ width: 60, padding: 4 }}
                    title="Норма на ед. операции"
                  />
                  <select
                    value={(v.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed'}
                    onChange={(e) => {
                      onUpdateMaterial(v.id, {
                        material_id: v.material_id ?? null,
                        qty_per_item: v.qty_per_item ?? 1,
                        consumption_mode: e.target.value as 'fixed' | 'roll_feed',
                        meter_basis: (v.meter_basis ?? 'feed') as 'knife_path' | 'feed',
                      });
                    }}
                    style={{ padding: 4, minWidth: 95 }}
                    title="Режим расхода"
                  >
                    {consumptionModeOptions.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                  <select
                    value={(v.meter_basis ?? 'feed') as 'knife_path' | 'feed'}
                    onChange={(e) => {
                      onUpdateMaterial(v.id, {
                        material_id: v.material_id ?? null,
                        qty_per_item: v.qty_per_item ?? 1,
                        consumption_mode: (v.consumption_mode ?? 'fixed') as 'fixed' | 'roll_feed',
                        meter_basis: e.target.value as 'knife_path' | 'feed',
                      });
                    }}
                    style={{ padding: 4, minWidth: 105 }}
                    title="База metering"
                  >
                    {meterBasisOptions.map((basis) => (
                      <option key={basis.value} value={basis.value}>{basis.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
