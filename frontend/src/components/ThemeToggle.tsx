import React from 'react'
import { useTheme } from '../hooks/useTheme'
import './ThemeToggle.css'

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme()

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Переключить на ${isDark ? 'светлую' : 'темную'} тему`}
      aria-label={`Переключить на ${isDark ? 'светлую' : 'темную'} тему`}
    >
      <span className="theme-toggle-icon">
        {isDark ? '🌙' : '☀️'}
      </span>
      <span className="theme-toggle-text">
        {isDark ? 'Темная' : 'Светлая'}
      </span>
    </button>
  )
}
