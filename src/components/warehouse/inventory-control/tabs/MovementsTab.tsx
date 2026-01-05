import React from 'react';
import { Material } from '../../../../types/shared';
import { MovementsTable } from '../components/MovementsTable';

interface MovementsTabProps {
  materials: Material[];
  onMaterialAction: (material: Material, action: 'in' | 'out' | 'adjustment') => void;
}

export const MovementsTab: React.FC<MovementsTabProps> = React.memo(({
  materials,
  onMaterialAction,
}) => {
  return (
    <div className="movements-view">
      <MovementsTable
        materials={materials}
        onMaterialAction={onMaterialAction}
      />
    </div>
  );
});

