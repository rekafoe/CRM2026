import React, { useState, useEffect } from 'react';
import { Product, ProductConfiguration, CalculatedPrice, ProductParameter } from '../../types';
import { api, validateProductSize } from '../../api';
import { calculatePrice as unifiedCalculatePrice } from '../../services/pricing';
import './ProductCalculator.css';

interface ProductCalculatorProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onAddToOrder: (configuration: ProductConfiguration, price: CalculatedPrice) => void;
  initialConfiguration?: ProductConfiguration;
}

const ProductCalculator: React.FC<ProductCalculatorProps> = ({
  product,
  isOpen,
  onClose,
  onAddToOrder,
  initialConfiguration
}) => {
  const [configuration, setConfiguration] = useState<ProductConfiguration>({
    product_id: product.id,
    parameters: {},
    quantity: 1,
    post_processing: [],
    production_terms: 'online'
  });
  
  const [calculatedPrice, setCalculatedPrice] = useState<CalculatedPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [parameters, setParameters] = useState<ProductParameter[]>([]);
  const [layoutInfo, setLayoutInfo] = useState<any>(null);
  const [sizeValidation, setSizeValidation] = useState<any>(null);

  useEffect(() => {
    if (isOpen && product) {
      loadProductDetails();
      if (initialConfiguration) {
        setConfiguration(initialConfiguration);
      }
    }
  }, [isOpen, product, initialConfiguration]);

  useEffect(() => {
    if (configuration.parameters && Object.keys(configuration.parameters).length > 0) {
      calculatePrice();
    }
  }, [configuration]);

  const loadProductDetails = async () => {
    try {
      const response = await api.get(`/products/${product.id}`);
      
      const productParameters = response.data.parameters || [];
      setParameters(productParameters);
      
      // Устанавливаем значения по умолчанию
      const defaultParams: Record<string, any> = {};
      productParameters.forEach((param: ProductParameter) => {
        if (param.default_value) {
          defaultParams[param.name] = param.default_value;
        }
      });
      
      setConfiguration(prev => ({
        ...prev,
        parameters: { ...defaultParams, ...prev.parameters }
      }));
    } catch (error) {
      // Ошибка обрабатывается через UI
    }
  };

  const calculatePrice = async () => {
    try {
      setLoading(true);
      const data = await unifiedCalculatePrice({
        product_id: product.id,
        quantity: configuration.quantity,
        channel: configuration.production_terms as any,
        params: configuration.parameters as any
      } as any);
      // адаптация к старому интерфейсу CalculatedPrice
      const total = (data as any)?.finalPrice ?? (data as any)?.final ?? 0;
      const ppu = configuration.quantity > 0 ? total / configuration.quantity : 0;
      setCalculatedPrice({ total_price: total, price_per_unit: ppu } as any);
    } catch (error) {
      // Ошибка обрабатывается через UI
    } finally {
      setLoading(false);
    }
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setConfiguration(prev => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [paramName]: value
      }
    }));

    // Если изменились размеры, валидируем их
    if (paramName === 'width' || paramName === 'height') {
      validateSize();
    }
  };

  const validateSize = async () => {
    const width = configuration.parameters.width;
    const height = configuration.parameters.height;
    
    if (width && height) {
      try {
        const validation = await validateProductSize(product.id, Number(width), Number(height));
        setSizeValidation(validation);
        if (validation.isValid) {
          setLayoutInfo(validation.layout);
        }
      } catch (error) {
        // Ошибка валидации обрабатывается через UI
      }
    }
  };

  const handleQuantityChange = (quantity: number) => {
    setConfiguration(prev => ({
      ...prev,
      quantity: Math.max(1, quantity)
    }));
  };

  const handlePostProcessingChange = (serviceId: number, checked: boolean) => {
    setConfiguration(prev => ({
      ...prev,
      post_processing: checked
        ? [...prev.post_processing, serviceId]
        : prev.post_processing.filter(id => id !== serviceId)
    }));
  };

  const handleProductionTermsChange = (terms: 'urgent' | 'online' | 'promo') => {
    setConfiguration(prev => ({
      ...prev,
      production_terms: terms
    }));
  };

  const handleAddToOrder = () => {
    if (calculatedPrice) {
      onAddToOrder(configuration, calculatedPrice);
      onClose();
    }
  };

  const renderParameterInput = (param: ProductParameter) => {
    const value = configuration.parameters[param.name] || param.default_value || '';

    switch (param.type) {
      case 'select':
        let options: string[] = [];
        try {
          options = param.options ? JSON.parse(param.options) : [];
        } catch (e) {
          options = [];
        }
        return (
          <select
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            className="parameter-input"
          >
            <option value="">Выберите...</option>
            {options.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'range':
        return (
          <div className="range-input">
            <input
              type="range"
              min={param.min_value || 0}
              max={param.max_value || 100}
              step={param.step || 1}
              value={value}
              onChange={(e) => handleParameterChange(param.name, Number(e.target.value))}
              className="range-slider"
            />
            <span className="range-value">{value}</span>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            min={param.min_value || 0}
            max={param.max_value || 1000}
            step={param.step || 1}
            value={value}
            onChange={(e) => handleParameterChange(param.name, Number(e.target.value))}
            className="parameter-input"
          />
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleParameterChange(param.name, e.target.checked)}
            className="parameter-checkbox"
          />
        );

      case 'multiselect':
        let multiOptions: string[] = [];
        try {
          multiOptions = param.options ? JSON.parse(param.options) : [];
        } catch (e) {
          multiOptions = [];
        }
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="multiselect-input">
            {multiOptions.map((option: string) => (
              <label key={option} className="multiselect-option">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v: string) => v !== option);
                    handleParameterChange(param.name, newValues);
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            className="parameter-input"
          />
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="product-calculator-overlay">
      <div className="product-calculator-modal">
        <div className="product-calculator-header">
          <div className="product-info">
            <span className="product-icon">{product.icon}</span>
            <div>
              <h2>{product.name}</h2>
              {product.description && <p>{product.description}</p>}
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="product-calculator-content">
          <div className="calculator-form">
            {/* Параметры продукта */}
            {parameters.length === 0 ? (
              <div className="no-parameters">
                <p>У этого продукта нет параметров для настройки.</p>
              </div>
            ) : (
              parameters.map(param => (
                <div key={param.id} className="parameter-group">
                <label className="parameter-label">
                  {param.label}
                  {param.is_required && <span className="required">*</span>}
                </label>
                {renderParameterInput(param)}
              </div>
              ))
            )}

            {/* Количество */}
            <div className="parameter-group">
              <label className="parameter-label">Количество</label>
              <div className="quantity-input">
                <button 
                  onClick={() => handleQuantityChange(configuration.quantity - 1)}
                  className="quantity-btn"
                >
                  -
                </button>
                <input
                  type="number"
                  value={configuration.quantity}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  className="quantity-field"
                  min="1"
                />
                <button 
                  onClick={() => handleQuantityChange(configuration.quantity + 1)}
                  className="quantity-btn"
                >
                  +
                </button>
              </div>
            </div>

            {/* Послепечатные услуги */}
            {product.post_processing_services && product.post_processing_services.length > 0 && (
              <div className="parameter-group">
                <label className="parameter-label">Послепечатные услуги</label>
                <div className="post-processing-options">
                  {product.post_processing_services.map(service => (
                    <label key={service.id} className="post-processing-option">
                      <input
                        type="checkbox"
                        checked={configuration.post_processing.includes(service.id)}
                        onChange={(e) => handlePostProcessingChange(service.id, e.target.checked)}
                      />
                      <span className="service-name">{service.name}</span>
                      <span className="service-price">+{service.price} BYN</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Сроки изготовления */}
            <div className="parameter-group">
              <label className="parameter-label">Сроки изготовления</label>
              <div className="production-terms">
                <button
                  className={`terms-btn ${configuration.production_terms === 'urgent' ? 'selected' : ''}`}
                  onClick={() => handleProductionTermsChange('urgent')}
                >
                  Срочно
                </button>
                <button
                  className={`terms-btn ${configuration.production_terms === 'online' ? 'selected' : ''}`}
                  onClick={() => handleProductionTermsChange('online')}
                >
                  Онлайн
                </button>
                <button
                  className={`terms-btn ${configuration.production_terms === 'promo' ? 'selected' : ''}`}
                  onClick={() => handleProductionTermsChange('promo')}
                >
                  Промо
                </button>
              </div>
            </div>
          </div>

          {/* Информация о раскладке */}
          {sizeValidation && (
            <div className="layout-info">
              {!sizeValidation.isValid ? (
                <div className="validation-error">
                  <h4>❌ Неверный размер</h4>
                  <p>{sizeValidation.message}</p>
                  {sizeValidation.recommendedSize && (
                    <p>Рекомендуемый размер: {sizeValidation.recommendedSize.width}×{sizeValidation.recommendedSize.height} мм</p>
                  )}
                </div>
              ) : layoutInfo && (
                <div className="layout-details">
                  <h4>📐 Раскладка</h4>
                  <div className="layout-stats">
                    <div className="stat">
                      <span className="label">Лист:</span>
                      <span className="value">{layoutInfo.sheetSize.width}×{layoutInfo.sheetSize.height} мм</span>
                    </div>
                    <div className="stat">
                      <span className="label">На листе:</span>
                      <span className="value">{layoutInfo.itemsPerSheet} шт</span>
                    </div>
                    <div className="stat">
                      <span className="label">Отходы:</span>
                      <span className="value">{layoutInfo.wastePercentage}%</span>
                    </div>
                    <div className="stat">
                      <span className="label">Раскладка:</span>
                      <span className="value">{layoutInfo.layout.cols}×{layoutInfo.layout.rows}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Расчет цены */}
          <div className="price-calculation">
            {loading ? (
              <div className="loading">Расчет цены...</div>
            ) : calculatedPrice ? (
              <div className="price-result">
                <div className="total-price">
                  {calculatedPrice.total_price.toFixed(2)} BYN
                </div>
                <div className="price-per-unit">
                  За 1 ед. {calculatedPrice.price_per_unit.toFixed(2)} BYN
                </div>
                <button 
                  className="add-to-order-btn"
                  onClick={handleAddToOrder}
                >
                  Добавить в заказ
                </button>
              </div>
            ) : (
              <div className="no-price">
                Настройте параметры для расчета цены
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCalculator;
