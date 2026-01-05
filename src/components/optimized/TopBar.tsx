import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../Logo';
import './TopBar.css';

interface TopBarProps {
  contextDate: string;
  currentUserName: string;
  isAdmin: boolean;
  onShowPageSwitcher: () => void;
  onShowOrderPool: () => void;
  onShowUserOrderPage: () => void;
  onShowCountersPage: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  contextDate,
  currentUserName,
  isAdmin,
  onShowPageSwitcher,
  onShowOrderPool,
  onShowUserOrderPage,
  onShowCountersPage,
  onLogout,
}) => {
  const navigate = useNavigate();
  return (
    <div className="app-topbar">
      <div className="topbar-logo">
        <Logo size="small" showText={false} />
      </div>
      <div className="topbar-info">
        <button 
          className="chip chip--clickable" 
          onClick={onShowPageSwitcher} 
          title="Переключиться между страницами заказов" 
          aria-label="Переключиться между страницами заказов"
        >
          📅 {contextDate} · 👤 {currentUserName}
        </button>
      </div>
      <div className="topbar-actions">
        <button 
          onClick={() => navigate('/order-pool')}
          title="Пул заказов" 
          aria-label="Пул заказов" 
          className="app-icon-btn app-icon-btn--blue"
        >
          📋
        </button>
        <button 
          onClick={onShowUserOrderPage}
          title="Мои заказы" 
          aria-label="Мои заказы" 
          className="app-icon-btn app-icon-btn--green"
        >
          📄
        </button>
        <button 
          onClick={onShowCountersPage}
          title="Счётчики принтеров и кассы" 
          aria-label="Счётчики принтеров и кассы" 
          className="app-icon-btn app-icon-btn--purple"
        >
          📊
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={() => window.location.href = '/adminpanel/reports'}
              title="Ежедневные отчёты" 
              aria-label="Ежедневные отчёты" 
              className="app-icon-btn"
            >
              📊
            </button>
            <button 
              onClick={() => window.location.href = '/adminpanel'}
              title="Админ панель" 
              aria-label="Админ панель" 
              className="app-icon-btn"
            >
              ⚙️
            </button>
          </>
        )}
        <button onClick={onLogout} title="Выйти" aria-label="Выйти" className="app-icon-btn">⎋</button>
      </div>
      
    </div>
  );
};
