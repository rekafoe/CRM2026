import React from 'react';

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
  const sortedUserDates = [...userDates].sort((a, b) => b.date.localeCompare(a.date));

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
      <h3 className="date-switcher-title">📅 Выберите дату</h3>

      <div className="date-switcher-grid">
        {sortedUserDates.length > 0 ? (
          sortedUserDates.map(({ date, orderCount }) => (
            <button
              key={date}
              onClick={() => handleDateSelect(date)}
              className={`date-switcher-option ${
                date === currentDate
                  ? 'date-switcher-option--active'
                  : 'date-switcher-option--inactive'
              }`}
            >
              <div className="date-switcher-option__title">{formatDate(date)}</div>
              <div className="date-switcher-option__meta">
                {date} • {orderCount} заказ{orderCount === 1 ? '' : orderCount < 5 ? 'а' : 'ов'}
              </div>
            </button>
          ))
        ) : (
          <div className="date-switcher-empty">
            <div className="date-switcher-empty__title">📅 Нет данных о работе</div>
            <div className="date-switcher-empty__subtitle">Вы еще не создавали заказы</div>
          </div>
        )}
      </div>

      <div className="date-switcher-footer">
        <button
          onClick={onClose}
          className="date-switcher-cancel"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
