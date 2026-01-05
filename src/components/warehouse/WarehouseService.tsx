import React, { useState } from 'react';
import { User } from '../../types';
import { UserRoles } from './UserRoles';

interface WarehouseServiceProps {
  currentUser: User | null;
  onNavigate: (page: string) => void;
  onOpenModal: (modal: string) => void;
  lowStockCount: number;
  totalOrders: number;
  totalRevenue: number;
}

type WarehouseSection = 'materials' | 'inventory' | 'suppliers' | 'reports' | 'settings' | 'alerts' | 'analytics' | 'automation' | 'mobile' | 'cost-calculation' | 'user-roles';

export const WarehouseService: React.FC<WarehouseServiceProps> = ({
  currentUser,
  onNavigate,
  onOpenModal,
  lowStockCount,
  totalOrders,
  totalRevenue,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<WarehouseSection>('materials');

  if (currentUser?.role !== 'admin') return null;

  const warehouseSections = [
    { 
      id: 'materials' as WarehouseSection, 
      title: '📦 Материалы', 
      icon: '📦', 
      description: 'Управление материалами и расходниками',
      color: '#4CAF50'
    },
    { 
      id: 'inventory' as WarehouseSection, 
      title: '📋 Инвентарь', 
      icon: '📋', 
      description: 'Учет и контроль инвентаря',
      color: '#2196F3'
    },
    { 
      id: 'suppliers' as WarehouseSection, 
      title: '🏭 Поставщики', 
      icon: '🏭', 
      description: 'Управление поставщиками и закупками',
      color: '#FF9800'
    },
    { 
      id: 'alerts' as WarehouseSection, 
      title: '🚨 Алерты', 
      icon: '🚨', 
      description: 'Уведомления о низких остатках и проблемах',
      color: '#F44336',
      badge: lowStockCount
    },
  { 
    id: 'cost-calculation' as WarehouseSection, 
    title: '💰 Себестоимость', 
    icon: '💰', 
    description: 'Расчет себестоимости и прибыльности товаров',
    color: '#28a745'
  },
  { 
    id: 'user-roles' as WarehouseSection, 
    title: '👥 Роли пользователей', 
    icon: '👥', 
    description: 'Управление ролями и разрешениями пользователей',
    color: '#6f42c1'
  },
    { 
      id: 'analytics' as WarehouseSection, 
      title: '📈 Аналитика', 
      icon: '📈', 
      description: 'Умная аналитика и прогнозы',
      color: '#9C27B0'
    },
    { 
      id: 'automation' as WarehouseSection, 
      title: '🤖 Автоматизация', 
      icon: '🤖', 
      description: 'Автозаказы и умные процессы',
      color: '#00BCD4'
    },
    { 
      id: 'mobile' as WarehouseSection, 
      title: '📱 Мобильное', 
      icon: '📱', 
      description: 'QR-коды и мобильные операции',
      color: '#795548'
    },
    { 
      id: 'reports' as WarehouseSection, 
      title: '📊 Отчеты склада', 
      icon: '📊', 
      description: 'Аналитика и отчетность по складу',
      color: '#9C27B0'
    },
    { 
      id: 'settings' as WarehouseSection, 
      title: '⚙️ Настройки', 
      icon: '⚙️', 
      description: 'Конфигурация складских процессов',
      color: '#607D8B'
    },
    { 
      id: 'user-roles' as WarehouseSection, 
      title: '👥 Роли пользователей', 
      icon: '👥', 
      description: 'Управление ролями и разрешениями пользователей',
      color: '#6f42c1'
    },
  ];

  const handleSectionClick = (section: WarehouseSection) => {
    setActiveSection(section);
    if (section === 'materials') {
      onNavigate('materials');
    } else if (section === 'reports') {
      onNavigate('reports');
    } else if (section === 'alerts') {
      onOpenModal('warehouse-alerts');
  } else if (section === 'cost-calculation') {
    onOpenModal('warehouse-cost-calculation');
  } else if (section === 'user-roles') {
    onOpenModal('warehouse-user-roles');
  } else if (section === 'analytics') {
    onOpenModal('warehouse-analytics');
  } else if (section === 'automation') {
      onOpenModal('warehouse-automation');
    } else if (section === 'mobile') {
      onOpenModal('warehouse-mobile');
    }
    // Для других разделов можно добавить навигацию или модальные окна
  };

  return (
    <div className="warehouse-service">
      <button 
        className={`warehouse-service-toggle-btn ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="Сервис управления складом"
      >
        🏪 Склад
        {lowStockCount > 0 && (
          <span className="warehouse-notification-badge">{lowStockCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="warehouse-service-dropdown">
          <div className="warehouse-service-header">
            <h3>🏪 Управление складом</h3>
            <div className="warehouse-stats">
              <div className="stat-item">
                <span className="stat-icon">📦</span>
                <span className="stat-value">{totalOrders}</span>
                <span className="stat-label">Заказов</span>
              </div>
              <div className="stat-item">
                <span className="stat-icon">⚠️</span>
                <span className="stat-value">{lowStockCount}</span>
                <span className="stat-label">Низкий запас</span>
              </div>
              <div className="stat-item">
                <span className="stat-icon">💰</span>
                <span className="stat-value">{totalRevenue.toFixed(0)}BYN</span>
                <span className="stat-label">Оборот</span>
              </div>
            </div>
          </div>

          <div className="warehouse-sections">
            {warehouseSections.map(section => (
              <button
                key={section.id}
                className={`warehouse-section-btn ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => handleSectionClick(section.id)}
                style={{ '--section-color': section.color } as React.CSSProperties}
              >
                <div className="section-icon">{section.icon}</div>
                <div className="section-content">
                  <div className="section-title">{section.title}</div>
                  <div className="section-description">{section.description}</div>
                </div>
                <div className="section-arrow">
                  {section.badge && section.badge > 0 && (
                    <span className="section-badge">{section.badge}</span>
                  )}
                  →
                </div>
              </button>
            ))}
          </div>

          <div className="warehouse-service-footer">
            <button 
              className="warehouse-close-btn" 
              onClick={() => setIsOpen(false)}
            >
              ✕ Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
