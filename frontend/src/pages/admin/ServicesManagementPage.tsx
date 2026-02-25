import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import ServicesManagement from '../../components/admin/services/ServicesManagement';
import './CountersServicePage.css';

/**
 * Страница управления услугами в стиле CountersServicePage (счётчики касс).
 */
export const ServicesManagementPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="cnt-page">
      {/* Header */}
      <div className="cnt-page__header">
        <div className="cnt-page__header-left">
          <Button variant="secondary" size="sm" onClick={() => navigate('/adminpanel')}>
            ← Назад
          </Button>
          <div className="cnt-page__title-row">
            <AppIcon name="wrench" size="lg" circle />
            <div>
              <h1 className="cnt-page__title">Управление услугами</h1>
              <p className="cnt-page__subtitle">Создание услуг и установка базовой стоимости</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <ServicesManagement showHeader={false} />
    </div>
  );
};

export default ServicesManagementPage;
