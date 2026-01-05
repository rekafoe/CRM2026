import React from 'react';
import { CalculatorToolbar } from './CalculatorToolbar';
import { SpecificationsForm } from './SpecificationsForm';
import { CalculationResultComponent } from './CalculationResult';
import { LoadingSpinner } from '../../LoadingSpinner';
import { ErrorDisplay } from '../../ErrorStates';
import { CalculationResult } from '../types/calculator.types';

interface CalculatorMainContentProps {
  // Toolbar props
  onCalculate: () => void;
  onShowPresets: () => void;
  onShowQuickTemplates: () => void;
  onShowComparison: () => void;
  onShowAIDashboard: () => void;
  onShowDynamicPricingManager: () => void;
  onUpdatePrices: () => void;
  onReloadData: () => void;
  onShowProductSelection: () => void;
  isCalculating: boolean;
  lastPriceUpdate: string;
  comparisonItemsCount: number;

  // Form props
  specs: any;
  onSpecsChange: (updates: any) => void;
  productConfigs: Record<string, any>;
  warehousePaperTypes: any[];
  dynamicDensities: any[];
  validationErrors: Record<string, string>;
  customFormat: { width: string; height: string };
  isCustomFormat: boolean;
  formatValidation: { isValid: boolean; message: string };
  onCustomFormatChange: (format: { width: string; height: string }) => void;
  onCustomFormatToggle: (isCustom: boolean) => void;

  // Result props
  result: CalculationResult | null;
  onAddToOrder: (customDescription?: string) => void;
  onAddToComparison: () => void;
  onSavePreset: () => void;

  // Loading states
  isLoadingMaterials: boolean;
  isLoadingPaperTypes: boolean;
  materialsError: string | null;
  paperTypesError: string | null;
  calculatorError: string | null;
}

export const CalculatorMainContent: React.FC<CalculatorMainContentProps> = ({
  // Toolbar
  onCalculate,
  onShowPresets,
  onShowQuickTemplates,
  onShowComparison,
  onShowAIDashboard,
  onShowDynamicPricingManager,
  onUpdatePrices,
  onReloadData,
  onShowProductSelection,
  isCalculating,
  lastPriceUpdate,
  comparisonItemsCount,

  // Form
  specs,
  onSpecsChange,
  productConfigs,
  warehousePaperTypes,
  dynamicDensities,
  validationErrors,
  customFormat,
  isCustomFormat,
  formatValidation,
  onCustomFormatChange,
  onCustomFormatToggle,

  // Result
  result,
  onAddToOrder,
  onAddToComparison,
  onSavePreset,

  // Loading
  isLoadingMaterials,
  isLoadingPaperTypes,
  materialsError,
  paperTypesError,
  calculatorError
}) => {
  return (
    <>
      {/* Панель инструментов */}
      <CalculatorToolbar
        onCalculate={onCalculate}
        onShowPresets={onShowPresets}
        onShowQuickTemplates={onShowQuickTemplates}
        onShowComparison={onShowComparison}
        onShowAIDashboard={onShowAIDashboard}
        onShowDynamicPricingManager={onShowDynamicPricingManager}
        onUpdatePrices={onUpdatePrices}
        onReloadData={onReloadData}
        onShowProductSelection={onShowProductSelection}
        isCalculating={isCalculating}
        lastPriceUpdate={lastPriceUpdate}
        comparisonItemsCount={comparisonItemsCount}
      />

      {/* Состояния загрузки и ошибок */}
      {(isLoadingMaterials || isLoadingPaperTypes) && (
        <LoadingSpinner text="Загрузка данных калькулятора..." />
      )}

      {materialsError && (
        <ErrorDisplay error={materialsError} />
      )}

      {paperTypesError && (
        <ErrorDisplay error={paperTypesError} />
      )}

      {calculatorError && (
        <ErrorDisplay error={calculatorError} />
      )}

      {/* Основной контент */}
      <div className="calculator-main">
        <div className="calculator-section">
          <h3>Основные параметры</h3>
          <SpecificationsForm
            specs={specs}
            onSpecsChange={onSpecsChange}
            productConfigs={productConfigs}
            warehousePaperTypes={warehousePaperTypes}
            dynamicDensities={dynamicDensities}
            validationErrors={validationErrors}
            customFormat={customFormat}
            isCustomFormat={isCustomFormat}
            formatValidation={formatValidation}
            onCustomFormatChange={onCustomFormatChange}
            onCustomFormatToggle={onCustomFormatToggle}
          />
        </div>
      </div>

      {/* Сайдбар с результатами */}
      <div className="calculator-sidebar">
        <CalculationResultComponent
          result={result}
          specs={specs}
          onAddToOrder={onAddToOrder}
        />
      </div>
    </>
  );
};
