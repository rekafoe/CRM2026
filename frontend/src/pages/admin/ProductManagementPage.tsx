import React from 'react';
import { useNavigate } from 'react-router-dom';
import ProductManagement from '../../components/admin/ProductManagement';
import { Button } from '../../components/common';
import '../../styles/admin-page-layout.css';

const ProductManagementPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div style={{ marginBottom: 12 }}>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => navigate('/adminpanel')}
          >
            ← Назад
          </Button>
        </div>
        <div>
          <h1>Управление продуктами</h1>
          <p>Создание и настройка продуктов, категорий и параметров</p>
        </div>
      </div>
      
      <div className="admin-page-content">
        <ProductManagement />
      </div>
    </div>
  );
};

export default ProductManagementPage;

