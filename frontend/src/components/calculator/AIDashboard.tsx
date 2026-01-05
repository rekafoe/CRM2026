import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIService, AIModelMetrics, PricePrediction, ProductRecommendation } from '../../services/aiService';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import './AIDashboard.css';

interface AIDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyRecommendation?: (recommendation: ProductRecommendation) => void;
}

export const AIDashboard: React.FC<AIDashboardProps> = ({
  isOpen,
  onClose,
  onApplyRecommendation
}) => {
  const toast = useToastNotifications();
  const log = useLogger('AIDashboard');
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'predictions' | 'recommendations' | 'training'>('overview');
  const [modelMetrics, setModelMetrics] = useState<AIModelMetrics | null>(null);
  const [predictions, setPredictions] = useState<PricePrediction[]>([]);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [retraining, setRetraining] = useState(false);

  // Загрузка метрик модели
  const loadModelMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const metrics = AIService.getModelMetrics();
      setModelMetrics(metrics);
      log.info('Метрики ИИ модели загружены');
    } catch (error) {
      log.error('Ошибка загрузки метрик ИИ');
      toastRef.current.error('Ошибка загрузки метрик модели');
    } finally {
      setLoading(false);
    }
  }, []);

  // Переобучение модели
  const handleRetrainModel = useCallback(async () => {
    try {
      setRetraining(true);
      const newMetrics = AIService.retrainModel();
      setModelMetrics(newMetrics);
      toastRef.current.success('Модель успешно переобучена');
      log.info('Модель ИИ переобучена');
    } catch (error) {
      log.error('Ошибка переобучения модели ИИ');
      toastRef.current.error('Ошибка переобучения модели');
    } finally {
      setRetraining(false);
    }
  }, []);

  // Генерация рекомендаций
  const generateRecommendations = useCallback(async (budget: number, quantity: number) => {
    try {
      setLoading(true);
      const recs = await AIService.getOptimalRecommendations({
        budget,
        quantity,
        urgency: 'standard',
        quality: 'standard'
      });
      setRecommendations(recs);
      log.info('Рекомендации ИИ сгенерированы');
    } catch (error) {
      log.error('Ошибка генерации рекомендаций ИИ');
      toastRef.current.error('Ошибка генерации рекомендаций');
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка данных при открытии
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (isOpen && !didLoadRef.current) {
      didLoadRef.current = true;
      loadModelMetrics();
    }
    if (!isOpen) {
      didLoadRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="ai-dashboard-overlay" onClick={onClose}>
      <div className="ai-dashboard" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="ai-dashboard-header">
          <div className="header-content">
            <h2>🤖 ИИ Дашборд</h2>
            <p>Машинное обучение для ценообразования и рекомендаций</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-sm btn-primary"
              onClick={handleRetrainModel}
              disabled={retraining}
            >
              {retraining ? '🔄 Переобучение...' : '🔄 Переобучить'}
            </button>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Вкладки */}
        <div className="ai-tabs">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📊 Обзор
          </button>
          <button
            className={`tab-btn ${activeTab === 'predictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('predictions')}
          >
            🔮 Предсказания
          </button>
          <button
            className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
          >
            💡 Рекомендации
          </button>
          <button
            className={`tab-btn ${activeTab === 'training' ? 'active' : ''}`}
            onClick={() => setActiveTab('training')}
          >
            🎓 Обучение
          </button>
        </div>

        {/* Контент */}
        <div className="ai-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Загрузка данных ИИ...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab metrics={modelMetrics} />
              )}
              {activeTab === 'predictions' && (
                <PredictionsTab 
                  predictions={predictions}
                  onGenerate={setPredictions}
                />
              )}
              {activeTab === 'recommendations' && (
                <RecommendationsTab
                  recommendations={recommendations}
                  onGenerate={generateRecommendations}
                  onApply={onApplyRecommendation}
                />
              )}
              {activeTab === 'training' && (
                <TrainingTab
                  onRetrain={handleRetrainModel}
                  retraining={retraining}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Компонент обзора
const OverviewTab: React.FC<{ metrics: AIModelMetrics | null }> = ({ metrics }) => {
  if (!metrics) {
    return <div className="no-data">Нет данных о модели</div>;
  }

  return (
    <div className="overview-tab">
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">🎯</div>
          <div className="metric-content">
            <h3>Точность</h3>
            <div className="metric-value">
              {(metrics.accuracy * 100).toFixed(1)}%
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill" 
                style={{ width: `${metrics.accuracy * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <h3>Precision</h3>
            <div className="metric-value">
              {(metrics.precision * 100).toFixed(1)}%
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill" 
                style={{ width: `${metrics.precision * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🔄</div>
          <div className="metric-content">
            <h3>Recall</h3>
            <div className="metric-value">
              {(metrics.recall * 100).toFixed(1)}%
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill" 
                style={{ width: `${metrics.recall * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚖️</div>
          <div className="metric-content">
            <h3>F1 Score</h3>
            <div className="metric-value">
              {(metrics.f1Score * 100).toFixed(1)}%
            </div>
            <div className="metric-bar">
              <div 
                className="metric-fill" 
                style={{ width: `${metrics.f1Score * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="model-info">
        <h3>Информация о модели</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Размер данных:</span>
            <span className="info-value">{metrics.trainingDataSize} записей</span>
          </div>
          <div className="info-item">
            <span className="info-label">Последнее обучение:</span>
            <span className="info-value">
              {new Date(metrics.lastTraining).toLocaleString()}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Статус:</span>
            <span className={`info-value status ${metrics.accuracy > 0.8 ? 'good' : 'warning'}`}>
              {metrics.accuracy > 0.8 ? 'Отлично' : 'Требует улучшения'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Компонент предсказаний
const PredictionsTab: React.FC<{
  predictions: PricePrediction[];
  onGenerate: (predictions: PricePrediction[]) => void;
}> = ({ predictions, onGenerate }) => {
  const [testParams, setTestParams] = useState({
    productType: 'flyers',
    format: 'A6',
    quantity: 1000,
    paperType: 'semi-matte',
    paperDensity: 120,
    lamination: 'none',
    urgency: 'standard',
    customerType: 'regular'
  });

  const handleTestPrediction = async () => {
    const prediction = await AIService.predictPrice(testParams);
    onGenerate([prediction]);
  };

  return (
    <div className="predictions-tab">
      <div className="prediction-form">
        <h3>Тестирование предсказаний</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Тип продукта:</label>
            <select
              value={testParams.productType}
              onChange={(e) => setTestParams({...testParams, productType: e.target.value})}
            >
              <option value="flyers">Листовки</option>
              <option value="business_cards">Визитки</option>
              <option value="posters">Постеры</option>
            </select>
          </div>
          <div className="form-group">
            <label>Формат:</label>
            <select
              value={testParams.format}
              onChange={(e) => setTestParams({...testParams, format: e.target.value})}
            >
              <option value="A6">A6</option>
              <option value="A5">A5</option>
              <option value="A4">A4</option>
            </select>
          </div>
          <div className="form-group">
            <label>Количество:</label>
            <input
              type="number"
              value={testParams.quantity}
              onChange={(e) => setTestParams({...testParams, quantity: parseInt(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>Тип бумаги:</label>
            <select
              value={testParams.paperType}
              onChange={(e) => setTestParams({...testParams, paperType: e.target.value})}
            >
              <option value="semi-matte">Полуматовая</option>
              <option value="coated">Мелованная</option>
              <option value="premium">Премиум</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleTestPrediction}>
          🔮 Предсказать цену
        </button>
      </div>

      {predictions.length > 0 && (
        <div className="predictions-results">
          <h3>Результаты предсказаний</h3>
          {predictions.map((prediction, index) => (
            <div key={index} className="prediction-card">
              <div className="prediction-header">
                <h4>Предсказание #{index + 1}</h4>
                <div className="confidence-badge">
                  Уверенность: {(prediction.confidence * 100).toFixed(1)}%
                </div>
              </div>
              <div className="prediction-content">
                <div className="price-display">
                  <span className="price-label">Предсказанная цена:</span>
                  <span className="price-value">{prediction.predictedPrice.toFixed(2)} BYN</span>
                </div>
                <div className="factors">
                  <h5>Факторы влияния:</h5>
                  <div className="factor-item">
                    <span>Исторические данные:</span>
                    <span>{prediction.factors.historical.toFixed(2)} BYN</span>
                  </div>
                  <div className="factor-item">
                    <span>Рыночные условия:</span>
                    <span>{(prediction.factors.market * 100).toFixed(1)}%</span>
                  </div>
                  <div className="factor-item">
                    <span>Сезонность:</span>
                    <span>{(prediction.factors.seasonality * 100).toFixed(1)}%</span>
                  </div>
                  <div className="factor-item">
                    <span>Конкуренция:</span>
                    <span>{(prediction.factors.competition * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="recommendations">
                  <h5>Рекомендации:</h5>
                  <ul>
                    {prediction.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Компонент рекомендаций
const RecommendationsTab: React.FC<{
  recommendations: ProductRecommendation[];
  onGenerate: (budget: number, quantity: number) => void;
  onApply?: (recommendation: ProductRecommendation) => void;
}> = ({ recommendations, onGenerate, onApply }) => {
  const [budget, setBudget] = useState(1000);
  const [quantity, setQuantity] = useState(1000);

  const handleGenerate = () => {
    onGenerate(budget, quantity);
  };

  return (
    <div className="recommendations-tab">
      <div className="recommendation-form">
        <h3>Генерация рекомендаций</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Бюджет (BYN):</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value))}
              min="100"
              step="100"
            />
          </div>
          <div className="form-group">
            <label>Количество:</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              min="100"
              step="100"
            />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate}>
            💡 Получить рекомендации
          </button>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="recommendations-results">
          <h3>Рекомендации ИИ</h3>
          <div className="recommendations-grid">
            {recommendations.map((rec, index) => (
              <div key={index} className="recommendation-card">
                <div className="rec-header">
                  <h4>{rec.productType}</h4>
                  <div className="rec-confidence">
                    {(rec.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rec-content">
                  <div className="rec-params">
                    <div className="param">
                      <span>Формат:</span>
                      <span>{rec.format}</span>
                    </div>
                    <div className="param">
                      <span>Количество:</span>
                      <span>{rec.quantity}</span>
                    </div>
                    <div className="param">
                      <span>Ожидаемая прибыль:</span>
                      <span className="profit">{rec.expectedProfit.toFixed(2)} BYN</span>
                    </div>
                  </div>
                  <div className="rec-reasoning">
                    <strong>Обоснование:</strong>
                    <p>{rec.reasoning}</p>
                  </div>
                  {onApply && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => onApply(rec)}
                    >
                      ✅ Применить
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент обучения
const TrainingTab: React.FC<{
  onRetrain: () => void;
  retraining: boolean;
}> = ({ onRetrain, retraining }) => {
  return (
    <div className="training-tab">
      <div className="training-info">
        <h3>Обучение модели</h3>
        <p>
          Модель машинного обучения автоматически обучается на исторических данных заказов.
          Вы можете запустить переобучение для улучшения точности предсказаний.
        </p>
      </div>

      <div className="training-actions">
        <button
          className="btn btn-primary"
          onClick={onRetrain}
          disabled={retraining}
        >
          {retraining ? '🔄 Переобучение...' : '🔄 Переобучить модель'}
        </button>
      </div>

      <div className="training-tips">
        <h4>Советы по улучшению модели:</h4>
        <ul>
          <li>Добавляйте больше исторических данных о заказах</li>
          <li>Регулярно переобучайте модель (раз в неделю)</li>
          <li>Следите за метриками точности</li>
          <li>Анализируйте ошибки предсказаний</li>
        </ul>
      </div>
    </div>
  );
};

