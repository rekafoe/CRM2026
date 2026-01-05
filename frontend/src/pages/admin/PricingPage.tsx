import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
// import { DynamicPricingManager } from '../../components/calculator/DynamicPricingManager'; // архивировано
import { CostCalculation } from '../../components/warehouse/CostCalculation';
import { Button, Alert, LoadingState } from '../../components/common';
import { getEnhancedProductTypes } from '../../api';
import { listOperationNorms } from '../../api/pricing';
import '../../styles/admin-cards.css';
import './PricingPage.css';

interface PricingPageProps {
  onBack: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<'pricing' | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [productTypesCount, setProductTypesCount] = useState(0);
  const [operationRulesCount, setOperationRulesCount] = useState(0);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      // Загружаем количество типов продуктов
      const productTypesResponse = await getEnhancedProductTypes();
      const productTypes = productTypesResponse.data || productTypesResponse;
      setProductTypesCount(Array.isArray(productTypes) ? productTypes.length : 0);

      // Загружаем количество активных операций/формул
      try {
        const operations = await listOperationNorms();
        setOperationRulesCount(Array.isArray(operations) ? operations.length : 0);
      } catch (err) {
        console.error('Error loading operation norms:', err);
        setOperationRulesCount(0);
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const pricingModules = [
    {
      id: 'products',
      title: '🧩 Управление продуктами калькулятора',
      description: 'Создание и настройка типов продуктов, операций и формул расчета для калькулятора',
      icon: '🧩',
      features: ['Типы продуктов', 'Операции производства', 'Формулы расчета', 'Привязка услуг'],
      action: () => navigate('/adminpanel/products'),
      color: 'primary'
    },
    // Модуль динамического прайсинга архивирован
    {
      id: 'cost-analysis',
      title: '📊 Расчет себестоимости',
      description: 'Анализ затрат и прибыльности товаров',
      icon: '📊',
      features: ['Анализ затрат', 'Маржинальность', 'Отчеты по прибыли', 'Оптимизация'],
      action: null,
      color: 'success'
    }
  ];

  return (
    <AdminPageLayout
      title="Ценообразование"
      icon="💰"
      onBack={onBack}
      className="pricing-page"
    >
      <div className="pricing-content">
        {/* Инструкции */}
        <div className="pricing-instructions">
          <div className="instructions-header">
            <h2>💡 Как работать с системой ценообразования</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              {showInstructions ? 'Скрыть' : 'Показать'} инструкции
            </Button>
          </div>
          
          {showInstructions && (
            <div className="instructions-content">
              <div className="instruction-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h4>Настройте услуги</h4>
                    <p>Опишите доступные услуги и себестоимость в разделе "Услуги"</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h4>Опишите операции</h4>
                    <p>Добавьте технологические операции и формулы расчёта в разделе "Операции"</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h4>Свяжите с продуктами</h4>
                    <p>Создайте типы продуктов и привяжите к ним операции в модуле калькулятора</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h4>Протестируйте расчёт</h4>
                    <p>Запустите тестовые расчёты и убедитесь, что калькулятор выдаёт корректную структуру цены</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Модули ценообразования */}
        <div className="pricing-modules">
          <h3>Модули системы ценообразования</h3>
          <div className="pricing-grid">
            {pricingModules.map((module) => (
              <div key={module.id} className={`pricing-card pricing-card-${module.color}`}>
                <div className="pricing-card-header">
                  <div className="pricing-card-icon">{module.icon}</div>
                  <h3>{module.title}</h3>
                </div>
                
                <div className="pricing-card-content">
                  <p className="pricing-card-description">{module.description}</p>
                  
                  <div className="pricing-card-features">
                    <h4>Возможности:</h4>
                    <ul>
                      {module.features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="pricing-card-actions">
                    {module.action ? (
                      <Button
                        variant={module.color as any}
                        onClick={module.action}
                        className="w-full"
                      >
                        Открыть модуль
                      </Button>
                    ) : (
                      <div className="pricing-card-embedded">
                        <CostCalculation />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Быстрые действия */}
        <div className="pricing-quick-actions">
          <h3>Быстрые действия</h3>
          <div className="quick-actions-grid">
            <Button
              variant="primary"
              onClick={() => navigate('/adminpanel/products')}
              icon={<span>🧩</span>}
            >
              Управление продуктами
            </Button>
            <Button
              variant="success"
              onClick={() => setActiveModal('pricing')}
              icon={<span>⚡</span>}
            >
              Настроить цены
            </Button>
          </div>
        </div>

        {/* Статистика */}
        <div className="pricing-stats">
          <h3>Статистика ценообразования</h3>
          {loading ? (
            <LoadingState message="Загрузка статистики..." />
          ) : (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <div className="stat-value">{productTypesCount}</div>
                  <div className="stat-label">Типов продуктов</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚙️</div>
                <div className="stat-content">
                  <div className="stat-value">{operationRulesCount}</div>
                  <div className="stat-label">Операций и формул</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модальные окна */}
      {/* DynamicPricingManager архивирован */}
    </AdminPageLayout>
  );
};