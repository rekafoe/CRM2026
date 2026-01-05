import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import PricingManagement from '../../components/admin/PricingManagement';

export const PrintersPage: React.FC = () => {
  return (
    <AdminPageLayout
      title="Принтеры и типы печати"
      icon="🖨️"
      onBack={() => window.history.back()}
    >
      <PricingManagement initialTab="markup" mode="full" />
    </AdminPageLayout>
  );
};

export default PrintersPage;

