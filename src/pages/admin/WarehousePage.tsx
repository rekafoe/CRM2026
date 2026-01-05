import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { WarehouseDashboard } from '../../components/warehouse/WarehouseDashboard';

interface WarehousePageProps {
  onBack: () => void;
}

export const WarehousePage: React.FC<WarehousePageProps> = ({ onBack }) => {
  return (
    <AdminPageLayout
      title="Складской сервис"
      icon="🏪"
      onBack={onBack}
      className="warehouse-page"
    >
      <div className="warehouse-content">
        <WarehouseDashboard onClose={onBack} />
      </div>
    </AdminPageLayout>
  );
};
