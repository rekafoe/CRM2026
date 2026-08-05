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
  onReceive: (material: Material) => void;
  onViewHistory: (material: Material) => void;
  onOpenAutoOrder?: () => void;
}

export const AlertsTab: React.FC<AlertsTabProps> = React.memo(({
  alerts,
  onReceive,
  onViewHistory,
  onOpenAutoOrder,
}) => {
  return (
    <div className="alerts-view">
      <AlertsTable
        alerts={alerts}
        onReceive={onReceive}
        onViewHistory={onViewHistory}
        onOpenAutoOrder={onOpenAutoOrder}
      />
    </div>
  );
});
