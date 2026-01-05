import React from 'react';
import { Material } from '../../../../types/shared';

interface MovementsTableProps {
  materials: Material[];
  onMaterialAction: (material: Material, action: 'in' | 'out' | 'adjustment') => void;
}

export const MovementsTable: React.FC<MovementsTableProps> = React.memo(({
  materials,
  onMaterialAction,
}) => {
  return (
    <div className="materials-table-wrapper">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Материал</th>
            <th>Категория</th>
            <th>Остаток</th>
            <th>Ед.</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {materials.map(material => (
            <tr key={material.id}>
              <td>{material.name}</td>
              <td>{(material as any).category_name || '—'}</td>
              <td>{material.quantity || 0}</td>
              <td>{material.unit}</td>
              <td>
                <div className="inv-actions">
                  <button 
                    className="action-btn small"
                    onClick={() => onMaterialAction(material, 'in')}
                  >
                    📥
                  </button>
                  <button 
                    className="action-btn small"
                    onClick={() => onMaterialAction(material, 'out')}
                  >
                    📤
                  </button>
                  <button 
                    className="action-btn small"
                    onClick={() => onMaterialAction(material, 'adjustment')}
                  >
                    🔧
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

