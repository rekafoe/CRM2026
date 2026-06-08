import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui';
import PricingManagement from '../../components/admin/PricingManagement';
import './PrintersPage.css';

export const PrintersPage: React.FC = () => {
  return (
    <AdminPageLayout
      title="Принтеры и типы печати"
      icon={<AppIcon name="printer" size="md" />}
      description="Печать: типы, оборудование и центральные ставки. Ценообразование: услуги, наценки, скидки и типы цен."
      onBack={() => window.history.back()}
      className="pricing-page"
    >
      <div className="printers-page__inner">
        <PricingManagement initialTab="print" mode="full" variant="embedded" />
      </div>
    </AdminPageLayout>
  );
};

export default PrintersPage;
