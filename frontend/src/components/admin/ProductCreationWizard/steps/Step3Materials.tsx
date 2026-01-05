/**
 * Шаг 3: Выбор материалов
 */

import React from 'react';
import type { Material } from '../../../../types/shared';
import { FormState } from '../../hooks/useProductCreationWizardState';

interface Step3MaterialsProps {
  form: FormState;
  materials: Material[];
  materialsLoading: boolean;
  resolveMaterialId: (material: Material) => number;
  resolveMaterialName: (material: Material) => string;
  resolveMaterialUnit: (material: Material) => string;
  toggleMaterial: (materialId: number) => void;
}

export const Step3Materials: React.FC<Step3MaterialsProps> = ({
  form,
  materials,
  materialsLoading,
  resolveMaterialId,
  resolveMaterialName,
  resolveMaterialUnit,
  toggleMaterial,
}) => {
  return (
    <div className="wizard-step flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-primary">Материалы</h4>
      {materialsLoading ? (
        <p className="text-secondary">Загрузка материалов…</p>
      ) : (
        <div className="materials-grid">
          {materials.map((material) => {
            const materialId = resolveMaterialId(material);
            if (!materialId) {
              return null;
            }
            const isSelected = form.selectedMaterials.includes(materialId);
            return (
              <label key={materialId} className={`material-item ${isSelected ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleMaterial(materialId)}
                />
                <span className="material-name">{resolveMaterialName(material)}</span>
                <span className="material-meta">{resolveMaterialUnit(material)}</span>
              </label>
            );
          })}
          {!materials.length && <p className="text-secondary">Материалы не найдены.</p>}
        </div>
      )}
    </div>
  );
};

