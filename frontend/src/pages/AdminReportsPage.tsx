import React from 'react';
import { AdminReportsPage as RefactoredAdminReportsPage } from '../features/adminReports';

interface AdminReportsPageProps {
  onBack?: () => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = (props) => {
  return <RefactoredAdminReportsPage {...props} />;
};