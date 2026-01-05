import React, { useState, useEffect } from 'react';

interface DateSwitcherProps {
  currentDate: string;
  onDateChange: (newDate: string) => void;
  onClose: () => void;
  userDates: Array<{ date: string; orderCount: number }>;
}

export const DateSwitcher: React.FC<DateSwitcherProps> = ({ 
  currentDate, 
  onDateChange, 
  onClose,
  userDates
}) => {
  // Сортируем даты пользователя по убыванию (новые сначала)
  const sortedUserDates = userDates.sort((a, b) => b.date.localeCompare(a.date));

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

  const handleDateSelect = (date: string) => {
    onDateChange(date);
    onClose();
  };

  return (
    <div className="date-switcher">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-base font-medium text-gray-900 mb-3">
          📅 Выберите дату
        </h3>
        
        <div className="grid grid-cols-2 gap-2">
          {sortedUserDates.length > 0 ? (
            sortedUserDates.map(({ date, orderCount }) => (
              <button
                key={date}
                onClick={() => handleDateSelect(date)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                  date === currentDate
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                }`}
              >
                <div className="font-medium">{formatDate(date)}</div>
                <div className="text-xs text-gray-500">
                  {date} • {orderCount} заказ{orderCount === 1 ? '' : orderCount < 5 ? 'а' : 'ов'}
                </div>
              </button>
            ))
          ) : (
            <div className="col-span-2 text-center py-4 text-gray-500">
              <div className="text-sm">📅 Нет данных о работе</div>
              <div className="text-xs mt-1">Вы еще не создавали заказы</div>
            </div>
          )}
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            ❌ Отмена
          </button>
        </div>
      </div>
    </div>
  );
};
