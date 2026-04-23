import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '../../components/ui/AppIcon';
import { CustomerDetailView } from '../../components/admin/clients/CustomerDetailView';
import '../../components/admin/ProductManagement.css';

/**
 * Полноэкранная карточка клиента — тот же UI/UX, что /adminpanel/products.
 */
const CustomerDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [headerClientName, setHeaderClientName] = useState<string | null>(null);
  const parsed = id ? parseInt(id, 10) : NaN;
  if (!id || Number.isNaN(parsed) || parsed < 1) {
    return <Navigate to="/adminpanel/clients" replace />;
  }

  const subtitle = headerClientName?.trim() || 'Загрузка данных…';

  return (
    <div className="product-management">
      <div className="product-management__header">
        <div className="product-management__header-left">
          <button type="button" className="lg-btn" onClick={() => navigate('/adminpanel/clients')}>
            ← Назад
          </button>
          <div className="product-management__title-row">
            <AppIcon name="user" size="lg" circle />
            <div>
              <h1 className="product-management__title">Карточка клиента</h1>
              <p className="product-management__subtitle">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <CustomerDetailView customerId={parsed} onDisplayNameChange={setHeaderClientName} />
    </div>
  );
};

export default CustomerDetailPage;
