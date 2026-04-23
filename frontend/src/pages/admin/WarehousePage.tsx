import React from 'react';
import { AppIcon } from '../../components/ui/AppIcon';
import { WarehouseDashboard } from '../../components/warehouse/WarehouseDashboard';
import '../../components/admin/ProductManagement.css';
import '../../styles/warehouse-embedded.css';

interface WarehousePageProps {
  onBack: () => void;
}

/**
 * Склад / материалы — тот же визуальный каркас, что /adminpanel/products.
 */
export const WarehousePage: React.FC<WarehousePageProps> = ({ onBack }) => {
  return (
    <div className="product-management">
      <div className="product-management__header">
        <div className="product-management__header-left">
          <button type="button" className="lg-btn" onClick={onBack}>
            ← Назад
          </button>
          <div className="product-management__title-row">
            <AppIcon name="package" size="lg" circle />
            <div>
              <h1 className="product-management__title">Склад и материалы</h1>
              <p className="product-management__subtitle">
                Остатки, поставщики, инвентаризация и отчёты
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="warehouse-page">
        <WarehouseDashboard />
      </div>
    </div>
  );
};
