import React from 'react'

interface HeaderSectionProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ title, subtitle, onBack }) => {
  return (
    <div className="management-header">
      <div className="header-content">
        <button onClick={onBack} className="btn-quick-action" style={{ marginRight: 12 }}>
          ← Назад к списку
        </button>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  )
}

export default HeaderSection


