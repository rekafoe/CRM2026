import React from 'react'
import '../productTemplate/components/admin/ProductManagement.css'
import PricingQuickTest from './components/PricingQuickTest'

const PricingServicePage: React.FC = () => {
  return (
    <div className="product-management">
      <div className="management-header">
        <div>
          <h2>💰 Pricing Service</h2>
          <p className="subtitle">Единый центр ценообразования (Unified + Flexible)</p>
        </div>
      </div>

      <div className="management-content">
        <div className="tab-content">
          <PricingQuickTest />

          <div className="form-section">
            <h3>Настройки и источники</h3>
            <ul>
              <li>UnifiedPricingService как источник истины</li>
              <li>Поддержка FlexiblePricingService (операции)</li>
              <li>Констрейнты и автоподбор материалов</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PricingServicePage


