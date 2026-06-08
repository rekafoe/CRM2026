import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui';
import PricingManagement from '../../components/admin/PricingManagement';

interface PricingManagementPageProps {
  onBack?: () => void;
}

const PricingManagementPage: React.FC<PricingManagementPageProps> = ({ onBack }) => {
  return (
    <AdminPageLayout
      title="Управление ценами"
      icon={<AppIcon name="receipt" size="md" />}
      onBack={onBack ?? (() => window.history.back())}
      className="pricing-page"
    >
      <PricingManagement />
    </AdminPageLayout>
  );
};

export default PricingManagementPage;