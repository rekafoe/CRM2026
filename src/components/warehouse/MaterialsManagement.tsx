import React from 'react';
import { Material } from '../../types/shared';
import { MaterialsManagementRefactored } from './materials/MaterialsManagementRefactored';
import './materials/MaterialsManagement.css';

interface MaterialsManagementProps {
  materials: Material[];
  selectedMaterials: number[];
  onMaterialSelect: (id: number) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
}

export const MaterialsManagement: React.FC<MaterialsManagementProps> = ({
  materials,
  selectedMaterials,
  onMaterialSelect,
  onSelectAll,
  onRefresh
}) => {
  return (
    <MaterialsManagementRefactored
      materials={materials}
      selectedMaterials={selectedMaterials}
      onMaterialSelect={onMaterialSelect}
      onSelectAll={onSelectAll}
      onRefresh={onRefresh}
    />
  );
};