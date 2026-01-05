import React from 'react';
import { Material } from '../../../../types/shared';
import { AlertsTable } from '../components/AlertsTable';

interface Alert {
  id: number;
  material_id: number;
  alert_type: 'out_of_stock' | 'low_stock';
  threshold_value: number;
  material?: Material;
}

interface AlertsTabProps {
  alerts: Alert[];
  onAdjustStock: (material: Material, newQuantity: number) => void;
  onMaterialAction: (material: Material, action: 'out') => void;
}

export const AlertsTab: React.FC<AlertsTabProps> = React.memo(({
  alerts,
  onAdjustStock,
  onMaterialAction,
}) => {
  return (
    <div className="alerts-view">
      <AlertsTable
        alerts={alerts}
        onAdjustStock={onAdjustStock}
        onMaterialAction={onMaterialAction}
      />
    </div>
  );
});

