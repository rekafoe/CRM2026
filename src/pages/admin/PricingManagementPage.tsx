import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import PricingManagement from '../../components/admin/PricingManagement';

interface PricingManagementPageProps {
  onBack?: () => void;
}

const PricingManagementPage: React.FC<PricingManagementPageProps> = ({ onBack }) => {
  return (
    <AdminPageLayout
      title="Управление ценами"
      icon="💰"
      onBack={onBack}
      className="pricing-management-page"
    >
      <PricingManagement />
    </AdminPageLayout>
  );
};

export default PricingManagementPage;