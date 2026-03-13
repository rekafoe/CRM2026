/**
 * Блок «Списание материалов по вариантам» — иерархия по типам.
 */
import React from 'react';
import { VariantWithTiers, VariantsByType } from './ServiceVariantsTable.types';

export interface ServiceVariantsMaterialsSectionProps {
  typeNames: string[];
  groupedVariants: VariantsByType;
  materials: Array<{ id: number; name: string }>;
  onUpdateMaterial: (variantId: number, materialId: number | null, qtyPerItem: number) => void;
}

export const ServiceVariantsMaterialsSection: React.FC<ServiceVariantsMaterialsSectionProps> = ({
  typeNames,
  groupedVariants,
  materials,
  onUpdateMaterial,
}) => {
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
                      onUpdateMaterial(v.id, val, v.qty_per_item ?? 1);
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
                        onUpdateMaterial(v.id, v.material_id ?? null, num);
                      }
                    }}
                    style={{ width: 60, padding: 4 }}
                    title="Норма на ед. операции"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
