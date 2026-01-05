import React, { useEffect } from 'react';
import { CalculatorModalProps, CalculationResult } from '../types/calculator.types';
import { useCalculatorState } from '../hooks/useCalculatorState';
import { useCalculatorData } from '../hooks/useCalculatorData';
import { useCalculatorValidation } from '../hooks/useCalculatorValidation';
import { useCalculatorLogic } from '../hooks/useCalculatorLogic';
import { SpecificationsForm } from './SpecificationsForm';
import { CalculationResultComponent } from './CalculationResult';
import { CalculatorToolbar } from './CalculatorToolbar';
import { ProductSelectionModal } from './ProductSelectionModal';
import { CalculatorHeader } from './CalculatorHeader';
import { CalculatorMainContent } from './CalculatorMainContent';
import { QuickTemplates } from '../QuickTemplates';
import { LoadingSpinner } from '../../LoadingSpinner';
import { ErrorDisplay } from '../../ErrorStates';
import { useLogger } from '../../../utils/logger';
import { useToastNotifications } from '../../Toast';
import { productConfigs as defaultProductConfigs } from '../../../config/calculatorConfig';
import '../styles/index.css';

export const CalculatorModal: React.FC<CalculatorModalProps> = ({
  isOpen,
  onClose,
  onAddToOrder,
  initialProductType
}) => {
  const logger = useLogger('RefactoredCalculatorModal');
  const toast = useToastNotifications();

  // Хуки для управления состоянием
  const calculatorState = useCalculatorState(initialProductType);
  const calculatorData = useCalculatorData();
  const calculatorValidation = useCalculatorValidation();
  const calculatorLogic = useCalculatorLogic();

  // Инициализация при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      // Принудительно загружаем данные при открытии калькулятора
      calculatorData.loadAllData();
      
      if (initialProductType) {
        calculatorState.updateSpecs({ productType: initialProductType });
        calculatorState.setShowProductSelection(false);
      }
    }
  }, [isOpen, initialProductType]);

  // Валидация при изменении спецификаций
  useEffect(() => {
    const validation = calculatorValidation.validateSpecs(calculatorState.specs);
    calculatorState.setIsValid(validation.isValid);
    calculatorState.updateValidationErrors(validation.errors);
  }, [calculatorState.specs]);

  // Загрузка плотностей при изменении типа бумаги
  useEffect(() => {
    if (calculatorState.specs.paperType) {
      calculatorData.loadDensitiesForPaperType(calculatorState.specs.paperType);
    }
  }, [calculatorState.specs.paperType]);

  // Обработчики событий
  const handleCalculate = async () => {
    const validation = calculatorValidation.validateSpecs(calculatorState.specs);
    if (!validation.isValid) {
      calculatorState.updateValidationErrors(validation.errors);
      toast.error('Пожалуйста, исправьте ошибки в форме');
      return;
    }

    calculatorState.setIsCalculating(true);
    calculatorState.clearError();

    try {
      const result = await calculatorLogic.calculateCost(calculatorState.specs);
      if (result) {
        calculatorState.setCalculationResult(result as CalculationResult);
        calculatorState.addToCalculationHistory(result as CalculationResult);
      }
    } catch (error) {
      logger.error('Error calculating cost', error);
      calculatorState.setError('Ошибка расчета стоимости');
    } finally {
      calculatorState.setIsCalculating(false);
    }
  };

  const handleAddToOrder = (customDescription?: string) => {
    if (!calculatorState.result) {
      toast.error('Сначала выполните расчет');
      return;
    }

    const orderItem = {
      productType: calculatorState.result.specifications.productType,
      format: calculatorState.result.specifications.format,
      quantity: calculatorState.result.specifications.quantity,
      sides: calculatorState.result.specifications.sides,
      paperType: calculatorState.result.specifications.paperType,
      paperDensity: calculatorState.result.specifications.paperDensity,
      lamination: calculatorState.result.specifications.lamination,
      priceType: calculatorState.result.specifications.priceType,
      customerType: calculatorState.result.specifications.customerType,
      totalCost: calculatorState.result.totalCost,
      pricePerItem: calculatorState.result.pricePerItem,
      productionTime: calculatorState.result.productionTime,
      description: customDescription || calculatorState.result.productName
    };

    onAddToOrder(orderItem);
    toast.success('Товар добавлен в заказ');
    onClose();
  };

  const handleAddToComparison = () => {
    if (!calculatorState.result) {
      toast.error('Сначала выполните расчет');
      return;
    }

    const comparisonItem = {
      id: Date.now().toString(),
      specs: calculatorState.result.specifications,
      result: calculatorState.result,
      name: calculatorState.result.productName
    };

    calculatorState.addToComparison(comparisonItem);
    toast.success('Добавлено к сравнению');
  };

  const handleSavePreset = () => {
    if (!calculatorState.result) {
      toast.error('Сначала выполните расчет');
      return;
    }

    const presetName = prompt('Введите название шаблона:');
    if (presetName) {
      const newPreset = { ...calculatorState.result.specifications, name: presetName };
      calculatorState.setSavedPresets(prev => [...prev, newPreset]);
      toast.success('Шаблон сохранен');
    }
  };

  const handleApplyTemplate = (templateSpecs: any) => {
    calculatorState.applyTemplate(templateSpecs);
    calculatorState.setShowQuickTemplates(false);
    toast.success('Шаблон применен');
  };

  const handleSelectProductType = (productType: string) => {
    const defaultFormat = calculatorLogic.getDefaultFormat(productType, calculatorData.productConfigs);
    const defaultDensity = calculatorLogic.getDefaultPaperDensity(calculatorState.specs.paperType, calculatorData.warehousePaperTypes);
    
    calculatorState.updateSpecs({
      productType,
      format: defaultFormat,
      paperDensity: defaultDensity
    });
    calculatorState.setShowProductSelection(false);
    logger.info('Выбран тип продукта', { productType });
  };

  if (!isOpen) return null;

  return (
    <div className="calculator-container">
      <div className="calculator-content">
        <CalculatorHeader 
          title="Калькулятор печати"
          onClose={onClose}
        />

        <div className="calculator-body">
          {/* Выбор продукта */}
          {calculatorState.showProductSelection && (
            <ProductSelectionModal
              productConfigs={defaultProductConfigs}
              onSelectProduct={handleSelectProductType}
              onClose={() => calculatorState.setShowProductSelection(false)}
            />
          )}

          {/* Основной интерфейс */}
          {!calculatorState.showProductSelection && (
            <CalculatorMainContent
              // Toolbar props
              onCalculate={handleCalculate}
              onShowPresets={() => calculatorState.setShowPresets(true)}
              onShowQuickTemplates={() => calculatorState.setShowQuickTemplates(true)}
              onShowComparison={() => calculatorState.setShowComparison(true)}
              onShowAIDashboard={() => calculatorState.setShowAIDashboard(true)}
              onShowDynamicPricingManager={() => calculatorState.setShowDynamicPricingManager(true)}
              onUpdatePrices={calculatorData.updatePrices}
              onReloadData={calculatorData.loadAllData}
              onShowProductSelection={() => calculatorState.setShowProductSelection(true)}
              isCalculating={calculatorState.isCalculating}
              lastPriceUpdate={calculatorData.lastPriceUpdate}
              comparisonItemsCount={calculatorState.comparisonItems.length}

              // Form props
              specs={calculatorState.specs}
              onSpecsChange={calculatorState.updateSpecs}
              productConfigs={calculatorData.productConfigs || defaultProductConfigs}
              warehousePaperTypes={calculatorData.warehousePaperTypes}
              dynamicDensities={calculatorData.dynamicDensities}
              validationErrors={calculatorState.validationErrors}
              customFormat={calculatorState.customFormat}
              isCustomFormat={calculatorState.isCustomFormat}
              formatValidation={calculatorState.formatValidation}
              onCustomFormatChange={calculatorState.setCustomFormat}
              onCustomFormatToggle={calculatorState.setIsCustomFormat}

              // Result props
              result={calculatorState.result}
              onAddToOrder={handleAddToOrder}
              onAddToComparison={handleAddToComparison}
              onSavePreset={handleSavePreset}

              // Loading states
              isLoadingMaterials={calculatorData.materialsState.loading}
              isLoadingPaperTypes={calculatorData.loadingPaperTypes}
              materialsError={calculatorData.materialsState.error}
              paperTypesError={calculatorData.paperTypesState.error}
              calculatorError={calculatorState.error}
            />
          )}
        </div>

        {/* Модальное окно пресетов */}
        {calculatorState.showPresets && (
          <div className="presets-modal" onClick={() => calculatorState.setShowPresets(false)}>
            <div className="presets-content" onClick={(e) => e.stopPropagation()}>
              <div className="presets-header">
                <h3>⭐ Пресеты</h3>
                <button className="presets-close-btn" onClick={() => calculatorState.setShowPresets(false)}>×</button>
              </div>
              <div className="presets-body">
                {calculatorState.savedPresets.length === 0 ? (
                  <div className="no-presets">
                    <div className="no-presets-icon">⭐</div>
                    <h4>Сохраненных пресетов нет</h4>
                    <p>Создайте пресет, чтобы быстро загружать настройки</p>
                  </div>
                ) : (
                  <div className="presets-grid">
                    {calculatorState.savedPresets.map((preset, index) => (
                      <div key={`preset-${index}-${preset.productType}-${preset.format}`} className="preset-card" onClick={() => {
                        calculatorState.updateSpecs(preset);
                        calculatorState.setShowPresets(false);
                        toast.success('Пресет загружен');
                      }}>
                        <div className="preset-header">
                          <h4>{(preset as any).name || `${calculatorData.productConfigs[preset.productType]?.name} ${preset.format}`}</h4>
                          <div className="preset-actions">
                            <button 
                              className="btn btn-sm btn-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Удалить пресет?')) {
                                  const newPresets = calculatorState.savedPresets.filter((_, i) => i !== index);
                                  calculatorState.setSavedPresets(newPresets);
                                  localStorage.setItem('printing-calculator-presets', JSON.stringify(newPresets));
                                  toast.success('Пресет удален');
                                }
                              }}
                              title="Удалить пресет"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div className="preset-details">
                          <div className="preset-detail">
                            <span>Количество:</span>
                            <span>{preset.quantity.toLocaleString()} шт</span>
                          </div>
                          <div className="preset-detail">
                            <span>Материал:</span>
                            <span>{preset.paperType} {preset.paperDensity}г/м²</span>
                          </div>
                          <div className="preset-detail">
                            <span>Стороны:</span>
                            <span>{preset.sides === 1 ? 'Односторонние' : 'Двусторонние'}</span>
                          </div>
                          {preset.lamination !== 'none' && (
                            <div className="preset-detail">
                              <span>Ламинация:</span>
                              <span>{preset.lamination}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно выбора продукта */}
        {calculatorState.showProductSelection && (
          <div className="product-selection-modal">
            <div className="product-selection-content">
              <div className="product-selection-header">
                <h2>Выбор продукта</h2>
                <button className="product-selection-close-btn" onClick={() => calculatorState.setShowProductSelection(false)}>×</button>
              </div>
              <div className="product-selection-body">
                <p>Загрузка списка продуктов...</p>
                <button className="calculator-btn calculator-btn-outline" onClick={() => calculatorState.setShowProductSelection(false)}>Закрыть</button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно быстрых шаблонов - временно отключено */}
        {/* {calculatorState.showQuickTemplates && (
          <QuickTemplates
            onApplyTemplate={handleApplyTemplate}
            onClose={() => calculatorState.setShowQuickTemplates(false)}
          />
        )} */}

        {/* Модальные окна - временно отключены */}
        {/* 

        {calculatorState.showComparison && (
          <ComparisonModal
            items={calculatorState.comparisonItems}
            onClose={() => calculatorState.setShowComparison(false)}
            onRemoveItem={calculatorState.removeFromComparison}
            onClearAll={calculatorState.clearComparison}
          />
        )}

        {calculatorState.showAIDashboard && (
          <AIDashboard
            onClose={() => calculatorState.setShowAIDashboard(false)}
            calculationHistory={calculatorState.calculationHistory}
            currentSpecs={calculatorState.specs}
          />
        )}

        {calculatorState.showDynamicPricingManager && (
          <DynamicPricingManager
            onClose={() => calculatorState.setShowDynamicPricingManager(false)}
            onApplyRecommendation={(recommendation) => {
              calculatorState.updateSpecs(recommendation);
              calculatorState.setShowDynamicPricingManager(false);
            }}
          />
        )} */}
      </div>
    </div>
  );
};
