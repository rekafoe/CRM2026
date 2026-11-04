import React from 'react';
import './Menu.css';

interface MenuProps {
  children: React.ReactNode;
  label?: string;
}

export const Menu: React.FC<MenuProps> = ({ children, label }) => (
  <div className="pc-menu" role="menu" aria-label={label}>
    {children}
  </div>
);

interface MenuItemProps {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
}

export const MenuItem: React.FC<MenuItemProps> = ({ children, onClick, selected = false }) => (
  <button
    type="button"
    className={selected ? 'pc-menu__item is-selected' : 'pc-menu__item'}
    role="menuitem"
    aria-current={selected ? 'true' : undefined}
    onClick={onClick}
  >
    {children}
  </button>
);
