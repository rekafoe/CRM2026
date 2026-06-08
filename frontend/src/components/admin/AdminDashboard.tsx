import React from 'react';
import ServicesManagement from './services/ServicesManagement';
import { AdminPageLayout } from './AdminPageLayout';

const AdminDashboard: React.FC = () => {
  return (
    <AdminPageLayout
      title="Настройка операций"
      icon="🔧"
    >
      <ServicesManagement showHeader={false} />
    </AdminPageLayout>
  );
};

export default AdminDashboard;
