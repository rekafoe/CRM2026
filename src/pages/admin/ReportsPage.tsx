import React from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';

interface ReportsPageProps {
  onBack: () => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onBack }) => {
  return (
    <AdminPageLayout
      title="Отчеты и аналитика"
      icon="📊"
      onBack={onBack}
      className="reports-page"
    >
      <div className="reports-content">
        <div className="reports-grid">
          <div className="report-card">
            <h3>📅 Ежедневные отчеты</h3>
            <p>Просмотр и анализ ежедневной статистики</p>
            <button className="btn btn-primary">Открыть</button>
          </div>
          
          <div className="report-card">
            <h3>📈 Аналитика</h3>
            <p>Графики, метрики и тренды</p>
            <button className="btn btn-primary">Открыть</button>
          </div>
          
          <div className="report-card">
            <h3>📋 Архив отчетов</h3>
            <p>Исторические данные и архивы</p>
            <button className="btn btn-primary">Открыть</button>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
};
