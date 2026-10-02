import React, { useState, useEffect } from 'react';
import { OrderPool } from '../components/orders/OrderPool';
import { UserOrderPage } from '../components/orders/UserOrderPage';
import { getCurrentUser } from '../api';

export const OrderManagementPage: React.FC = () => {
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'pool' | 'page'>('pool');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orderAssigned, setOrderAssigned] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await getCurrentUser();
        setUser(response.data);
      } catch (error) {
        console.error('Failed to load user:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    loadUser();
  }, []);

  useEffect(() => {
    if (orderAssigned) {
      setActiveTab('page');
      setOrderAssigned(false);
    }
  }, [orderAssigned]);

  const handleOrderAssigned = () => {
    setOrderAssigned(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getDateOptions = () => {
    const options = [];
    const today = new Date();
    const maxDays = isAdmin ? 90 : 14;

    for (let i = 0; i < maxDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      options.push({
        value: dateString,
        label: formatDate(dateString)
      });
    }

    return options;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Необходима авторизация</h2>
          <p className="text-gray-600">Пожалуйста, войдите в систему для доступа к управлению заказами.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Заголовок */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333', margin: '0 0 10px 0' }}>
             Новая система заказов
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            Добро пожаловать, {user.name}! Управляйте заказами и отслеживайте свою работу.
          </p>
        </div>

        {/* Навигация */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e0e0e0' }}>
            <button
              onClick={() =>setActiveTab('pool')}
              style={{
                padding: '12px 20px',
                border: 'none',
                backgroundColor: activeTab === 'pool' ? '#4CAF50' : 'transparent',
                color: activeTab === 'pool' ? 'white' : '#666',
                cursor: 'pointer',
                borderRadius: '4px 4px 0 0',
                fontWeight: '500'
              }}
            >
               Пул заказов
            </button>
            <button
              onClick={() =>setActiveTab('page')}
              style={{
                padding: '12px 20px',
                border: 'none',
                backgroundColor: activeTab === 'page' ? '#4CAF50' : 'transparent',
                color: activeTab === 'page' ? 'white' : '#666',
                cursor: 'pointer',
                borderRadius: '4px 4px 0 0',
                fontWeight: '500'
              }}
            >
               Моя страница заказов
            </button>
          </div>
        </div>

        {/* Выбор даты для страницы заказов */}
        {activeTab === 'page' && (
          <div className="mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center space-x-4">
                <label htmlFor="date-select" className="text-sm font-medium text-gray-700">
                  Выберите дату:
                </label>
                <select
                  id="date-select"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {getDateOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="text-sm text-gray-500">
                  {isAdmin ? 'Доступно 90 дней' : 'Доступно 14 дней'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Контент */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {activeTab === 'pool' && (
            <div className="p-6">
              <OrderPool 
                currentUserId={user.id}
                currentUserName={user.name}
                onOrderAssigned={handleOrderAssigned}
              />
            </div>
          )}

          {activeTab === 'page' && (
            <div className="p-6">
              <div style={{ 
                padding: '20px', 
                backgroundColor: '#f9f9f9', 
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <p style={{ color: '#666', margin: 0 }}>
                   Компонент UserOrderPage в разработке...
                </p>
                <p style={{ color: '#999', fontSize: '14px', margin: '10px 0 0 0' }}>
                  Выбранная дата: {selectedDate}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Информация о правах */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-blue-600 mr-3"></div>
            <div>
              <h3 className="text-blue-800 font-medium">Информация о правах</h3>
              <p className="text-blue-600 text-sm">
                {isAdmin 
                  ? 'Вы администратор. Можете просматривать страницы заказов всех пользователей за последние 90 дней.'
                  : 'Вы можете просматривать только свои страницы заказов за последние 14 дней.'
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
