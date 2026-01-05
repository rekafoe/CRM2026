import React, { useState, useEffect } from 'react';
import { api } from '../../api';

interface DailyActivity {
  date: string;
  activeUsers: number;
  totalPages: number;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  users: Array<{
    id: number;
    name: string;
    pagesCount: number;
    ordersCount: number;
    completedCount: number;
    revenue: number;
  }>;
}

interface DailyActivityOverviewProps {
  onDateSelect?: (date: string) => void;
}

export const DailyActivityOverview: React.FC<DailyActivityOverviewProps> = ({ 
  onDateSelect 
}) => {
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadDailyActivities();
  }, []);

  const loadDailyActivities = async () => {
    try {
      setLoading(true);
      // Генерируем последние 30 дней для демонстрации
      const activities: DailyActivity[] = [];
      const today = new Date();
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Генерируем случайные данные для демонстрации
        const activeUsers = Math.floor(Math.random() * 5) + 1; // 1-5 пользователей
        const users = [];
        
        for (let j = 0; j < activeUsers; j++) {
          users.push({
            id: j + 1,
            name: `Пользователь ${j + 1}`,
            pagesCount: Math.floor(Math.random() * 3) + 1,
            ordersCount: Math.floor(Math.random() * 10) + 1,
            completedCount: Math.floor(Math.random() * 8) + 1,
            revenue: Math.floor(Math.random() * 50000) + 10000
          });
        }
        
        const totalPages = users.reduce((sum, user) => sum + user.pagesCount, 0);
        const totalOrders = users.reduce((sum, user) => sum + user.ordersCount, 0);
        const completedOrders = users.reduce((sum, user) => sum + user.completedCount, 0);
        const totalRevenue = users.reduce((sum, user) => sum + user.revenue, 0);
        
        activities.push({
          date: dateStr,
          activeUsers,
          totalPages,
          totalOrders,
          completedOrders,
          totalRevenue,
          users
        });
      }
      
      setActivities(activities);
    } catch (error: unknown) {
      console.error('Error loading daily activities:', error);
      setError('Ошибка при загрузке данных');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateString === today.toISOString().split('T')[0]) {
      return 'Сегодня';
    } else if (dateString === yesterday.toISOString().split('T')[0]) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short' 
      });
    }
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(selectedDate === date ? null : date);
    if (onDateSelect) {
      onDateSelect(date);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-red-600 text-center">
          <p>❌ {error}</p>
          <button 
            onClick={loadDailyActivities}
            className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        📊 Активность пользователей по дням
      </h3>
      
      <div className="space-y-3">
        {activities.slice(0, 14).map((activity) => (
          <div key={activity.date}>
            <button
              onClick={() => handleDateClick(activity.date)}
              className={`w-full p-3 rounded-lg border transition-colors text-left ${
                selectedDate === activity.date
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {formatDate(activity.date)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {activity.date}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    👥 {activity.activeUsers} пользователей
                  </div>
                  <div className="text-xs text-gray-500">
                    📄 {activity.totalPages} страниц • 📦 {activity.totalOrders} заказов
                  </div>
                </div>
              </div>
            </button>
            
            {selectedDate === activity.date && (
              <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">
                  Детали за {formatDate(activity.date)}
                </h4>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="text-sm">
                    <span className="text-gray-600">Всего страниц:</span>
                    <span className="ml-2 font-medium">{activity.totalPages}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Всего заказов:</span>
                    <span className="ml-2 font-medium">{activity.totalOrders}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Завершено:</span>
                    <span className="ml-2 font-medium">{activity.completedOrders}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Выручка:</span>
                    <span className="ml-2 font-medium">{activity.totalRevenue.toLocaleString()} BYN</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-blue-900">Пользователи:</div>
                  {activity.users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                      <span className="font-medium">{user.name}</span>
                      <div className="text-gray-600">
                        {user.pagesCount} стр. • {user.ordersCount} зак. • {user.completedCount} вып.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
