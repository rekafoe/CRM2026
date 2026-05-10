import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import PlotterCuttingTariffsForm from './plotterCutting/PlotterCuttingTariffsForm';
import './PlotterCuttingSettingsPage.css';

export const PlotterCuttingSettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AdminPageLayout
      title="Плоттерная резка"
      icon={<AppIcon name="scissors" size="md" />}
      onBack={() => navigate('/adminpanel')}
      className="plotter-cutting-page"
    >
      <div className="plotter-cutting-page__inner">
        <PlotterCuttingTariffsForm />
      </div>
    </AdminPageLayout>
  );
};

export default PlotterCuttingSettingsPage;
