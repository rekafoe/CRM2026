import React, { useState, useEffect } from 'react';
import { Supplier } from '../../types/shared';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { MoneyAmount } from '../ui';
import './SupplierAnalyticsModal.css';

interface SupplierAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
}

interface SupplierAnalytics {
  supplier_id: number;
  supplier_name: string;
  delivery_stats: {
    total_deliveries: number;
    total_quantity: number;
    total_value: number;
    average_delivery_value: number;
    last_delivery_date: string | null;
    first_delivery_date: string | null;
    delivery_frequency_days: number;
    reliability_score: number;
  };
  financial_stats: {
    total_spent: number;
    average_order_value: number;
    largest_delivery_value: number;
    smallest_delivery_value: number;
    price_trend: 'increasing' | 'decreasing' | 'stable';
    price_change_percent: number;
  };
  usage_stats: {
    materials_count: number;
    most_used_material: string;
    least_used_material: string;
    consumption_trend: 'increasing' | 'decreasing' | 'stable';
    consumption_change_percent: number;
    seasonal_pattern: boolean;
  };
  overall_score: number;
  recommendations: string[];
}

interface DeliveryHistoryItem {
  id: number;
  materialId: number;
  material_name: string;
  delta: number;
  reason: string;
  delivery_number: string | null;
  invoice_number: string | null;
  delivery_date: string | null;
  delivery_notes: string | null;
  created_at: string;
}

export const SupplierAnalyticsModal: React.FC<SupplierAnalyticsModalProps> = ({
  isOpen,
  onClose,
  supplier
}) => {
  const [analytics, setAnalytics] = useState<SupplierAnalytics | null>(null);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'deliveries' | 'financial' | 'usage'>('overview');

  useEffect(() => {
    if (isOpen && supplier) {
      loadAnalytics();
      loadDeliveryHistory();
    }
  }, [isOpen, supplier]);

  const loadAnalytics = async () => {
    if (!supplier) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get<SupplierAnalytics>(`${ENDPOINTS.SUPPLIERS.GET(supplier.id)}/analytics`);
      setAnalytics(response.data);
    } catch (error: any) {
      console.error('Ошибка загрузки аналитики:', error);
      setError('Ошибка загрузки аналитики поставщика');
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveryHistory = async () => {
    if (!supplier) return;
    
    try {
      const response = await api.get<DeliveryHistoryItem[]>(`${ENDPOINTS.SUPPLIERS.GET(supplier.id)}/delivery-history`);
      setDeliveryHistory(response.data);
    } catch (error: any) {
      console.error('Ошибка загрузки истории поставок:', error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Нет данных';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'average';
    return 'poor';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="supplier-analytics-modal-overlay" onClick={onClose}>
      <div className="supplier-analytics-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Аналитика поставщика: {supplier?.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              Загрузка аналитики...
            </div>
          )}

          {error && (
            <div className="error-state">
              {error}
            </div>
          )}

          {analytics && !loading && (
            <>
              {/* Общий рейтинг */}
              <div className="overall-score">
                <div className={`score-circle ${getScoreColor(analytics.overall_score)}`}>
                  <span className="score-value">{analytics.overall_score}</span>
                  <span className="score-label">Рейтинг</span>
                </div>
                <div className="score-description">
                  <h3>Общая оценка поставщика</h3>
                  <p>
                    {analytics.overall_score >= 80 && 'Отличный поставщик с высоким рейтингом надежности'}
                    {analytics.overall_score >= 60 && analytics.overall_score < 80 && 'Хороший поставщик с стабильными показателями'}
                    {analytics.overall_score >= 40 && analytics.overall_score < 60 && 'Средний поставщик, требует внимания'}
                    {analytics.overall_score < 40 && 'Поставщик с низким рейтингом, рекомендуется пересмотр условий'}
                  </p>
                </div>
              </div>

              {/* Рекомендации */}
              {analytics.recommendations.length > 0 && (
                <div className="recommendations">
                  <h3>💡 Рекомендации</h3>
                  <ul>
                    {analytics.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Табы */}
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  📋 Обзор
                </button>
                <button 
                  className={`tab ${activeTab === 'deliveries' ? 'active' : ''}`}
                  onClick={() => setActiveTab('deliveries')}
                >
                  🚚 Поставки
                </button>
                <button 
                  className={`tab ${activeTab === 'financial' ? 'active' : ''}`}
                  onClick={() => setActiveTab('financial')}
                >
                  💰 Финансы
                </button>
                <button 
                  className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
                  onClick={() => setActiveTab('usage')}
                >
                  📦 Использование
                </button>
              </div>

              {/* Контент табов */}
              <div className="tab-content">
                {activeTab === 'overview' && (
                  <div className="overview-tab">
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-icon">🚚</div>
                        <div className="stat-content">
                          <div className="stat-value">{analytics.delivery_stats.total_deliveries}</div>
                          <div className="stat-label">Всего поставок</div>
                        </div>
                      </div>
                      
                      <div className="stat-card">
                        <div className="stat-icon">💰</div>
                        <div className="stat-content">
                          <div className="stat-value"><MoneyAmount value={analytics.delivery_stats.total_value} /></div>
                          <div className="stat-label">Общая стоимость</div>
                        </div>
                      </div>
                      
                      <div className="stat-card">
                        <div className="stat-icon">⭐</div>
                        <div className="stat-content">
                          <div className="stat-value">{analytics.delivery_stats.reliability_score}%</div>
                          <div className="stat-label">Надежность</div>
                        </div>
                      </div>
                      
                      <div className="stat-card">
                        <div className="stat-icon">📦</div>
                        <div className="stat-content">
                          <div className="stat-value">{analytics.usage_stats.materials_count}</div>
                          <div className="stat-label">Материалов</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'deliveries' && (
                  <div className="deliveries-tab">
                    <div className="delivery-stats">
                      <div className="stat-item">
                        <strong>Всего поставок:</strong> {analytics.delivery_stats.total_deliveries}
                      </div>
                      <div className="stat-item">
                        <strong>Общий объем:</strong> {analytics.delivery_stats.total_quantity.toFixed(2)} ед.
                      </div>
                      <div className="stat-item">
                        <strong>Средняя стоимость поставки:</strong> <MoneyAmount value={analytics.delivery_stats.average_delivery_value} />
                      </div>
                      <div className="stat-item">
                        <strong>Частота поставок:</strong> каждые {analytics.delivery_stats.delivery_frequency_days} дней
                      </div>
                      <div className="stat-item">
                        <strong>Последняя поставка:</strong> {formatDate(analytics.delivery_stats.last_delivery_date)}
                      </div>
                    </div>

                    {deliveryHistory.length > 0 && (
                      <div className="delivery-history">
                        <h4>История поставок</h4>
                        <div className="history-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Дата</th>
                                <th>Материал</th>
                                <th>Количество</th>
                                <th>Номер поставки</th>
                                <th>Причина</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deliveryHistory.slice(0, 10).map(item => (
                                <tr key={item.id}>
                                  <td>{formatDate(item.created_at)}</td>
                                  <td>{item.material_name}</td>
                                  <td>+{item.delta}</td>
                                  <td>{item.delivery_number || '-'}</td>
                                  <td>{item.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'financial' && (
                  <div className="financial-tab">
                    <div className="financial-stats">
                      <div className="stat-item">
                        <strong>Общие расходы:</strong> <MoneyAmount value={analytics.financial_stats.total_spent} />
                      </div>
                      <div className="stat-item">
                        <strong>Средний размер заказа:</strong> <MoneyAmount value={analytics.financial_stats.average_order_value} />
                      </div>
                      <div className="stat-item">
                        <strong>Самая крупная поставка:</strong> <MoneyAmount value={analytics.financial_stats.largest_delivery_value} />
                      </div>
                      <div className="stat-item">
                        <strong>Самая мелкая поставка:</strong> <MoneyAmount value={analytics.financial_stats.smallest_delivery_value} />
                      </div>
                      <div className="stat-item">
                        <strong>Тренд цен:</strong> 
                        <span className={`trend ${analytics.financial_stats.price_trend}`}>
                          {getTrendIcon(analytics.financial_stats.price_trend)} 
                          {analytics.financial_stats.price_trend === 'increasing' && ' Рост'}
                          {analytics.financial_stats.price_trend === 'decreasing' && ' Снижение'}
                          {analytics.financial_stats.price_trend === 'stable' && ' Стабильно'}
                          ({analytics.financial_stats.price_change_percent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'usage' && (
                  <div className="usage-tab">
                    <div className="usage-stats">
                      <div className="stat-item">
                        <strong>Количество материалов:</strong> {analytics.usage_stats.materials_count}
                      </div>
                      <div className="stat-item">
                        <strong>Самый используемый материал:</strong> {analytics.usage_stats.most_used_material}
                      </div>
                      <div className="stat-item">
                        <strong>Наименее используемый материал:</strong> {analytics.usage_stats.least_used_material}
                      </div>
                      <div className="stat-item">
                        <strong>Тренд потребления:</strong>
                        <span className={`trend ${analytics.usage_stats.consumption_trend}`}>
                          {getTrendIcon(analytics.usage_stats.consumption_trend)} 
                          {analytics.usage_stats.consumption_trend === 'increasing' && ' Рост'}
                          {analytics.usage_stats.consumption_trend === 'decreasing' && ' Снижение'}
                          {analytics.usage_stats.consumption_trend === 'stable' && ' Стабильно'}
                          ({analytics.usage_stats.consumption_change_percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="stat-item">
                        <strong>Сезонность:</strong> {analytics.usage_stats.seasonal_pattern ? 'Есть сезонные колебания' : 'Стабильное потребление'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

