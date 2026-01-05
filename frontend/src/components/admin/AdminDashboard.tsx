import React from 'react';
import { useNavigate } from 'react-router-dom';
import ServicesManagement from './services/ServicesManagement';
import { Button } from '../common';
import '../../styles/admin-page-layout.css';

const AdminDashboard: React.FC = () => {
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
          <h1>Настройка операций</h1>
          <p>Управление послепечатными операциями и их ценами</p>
        </div>
      </div>

      {/* Контент */}
      <div className="admin-page-content">
        <ServicesManagement />
      </div>
    </div>
  );
};

export default AdminDashboard;
