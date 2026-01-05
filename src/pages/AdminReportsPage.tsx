// Переход на рефакторингованную архитектуру
// Старый компонент заменен на модульную структуру в features/adminReports

import { AdminReportsPage as RefactoredAdminReportsPage } from '../features/adminReports';

interface AdminReportsPageProps {
  onBack?: () => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = (props) => {
  return <RefactoredAdminReportsPage {...props} />;
};