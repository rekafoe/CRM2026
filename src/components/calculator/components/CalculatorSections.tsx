import React from 'react';
import { ProductSpecs, CalculationResult } from '../types/calculator.types';
import { Product } from '../../../services/products';
import { ParamsSection } from './ParamsSection';
import { MaterialsSection } from './MaterialsSection';
import { PrintingSettingsSection } from './PrintingSettingsSection';
import { DynamicFieldsSection } from './DynamicFieldsSection';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { QuantityDiscountsSection } from './QuantityDiscountsSection';
import { SelectedProductCard } from './SelectedProductCard';

interface CalculatorSectionsProps {
  specs: ProductSpecs;
  availableFormats: string[];
  validationErrors: Record<string, string>;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  setIsCustomFormat: (value: boolean) => void;
  setCustomFormat: (value: { width: string; height: string }) => void;
  updateSpecs: (updates: Partial<ProductSpecs>) => void;
  backendProductSchema: any;
  warehousePaperTypes: Array<{ name: string; display_name: string }>;
  availableDensities: Array<{ value: number; label: string }>;
  loadingPaperTypes: boolean;
  getDefaultPaperDensity: (paperType: string) => number;
  printTechnology: string;
  printColorMode: 'bw' | 'color' | null;
  setPrintTechnology: (value: string) => void;
  setPrintColorMode: (value: 'bw' | 'color' | null) => void;
  selectedProduct: (Product & { resolvedProductType?: string }) | null;
  result: CalculationResult | null;
  setAppliedDiscount: (value: number) => void;
  currentConfig?: { name?: string } | null;
  onOpenProductSelector: () => void;
}

export const CalculatorSections: React.FC<CalculatorSectionsProps> = React.memo(({
  specs,
  availableFormats,
  validationErrors,
  isCustomFormat,
  customFormat,
  setIsCustomFormat,
  setCustomFormat,
  updateSpecs,
  backendProductSchema,
  warehousePaperTypes,
  availableDensities,
  loadingPaperTypes,
  getDefaultPaperDensity,
  printTechnology,
  printColorMode,
  setPrintTechnology,
  setPrintColorMode,
  result,
  setAppliedDiscount,
  selectedProduct,
  currentConfig,
  onOpenProductSelector,
}) => {
  return (
    <>
      {/* Основные параметры */}
      <div className="calculator-section-group">
        <div className="section-group-header">
          <h3>📦 Основные параметры</h3>
        </div>
        <div className="section-group-content">
          <SelectedProductCard
            productType={specs.productType}
            displayName={selectedProduct?.name || (backendProductSchema?.type || currentConfig?.name || specs.productType) as string}
            onOpenSelector={onOpenProductSelector}
          />

          <ParamsSection
            specs={{ productType: specs.productType, format: specs.format, quantity: specs.quantity, sides: specs.sides }}
            availableFormats={availableFormats}
            validationErrors={validationErrors}
            isCustomFormat={isCustomFormat}
            customFormat={customFormat}
            setIsCustomFormat={setIsCustomFormat}
            setCustomFormat={setCustomFormat}
            updateSpecs={updateSpecs}
            schema={backendProductSchema}
          />
        </div>
      </div>

      {/* Материалы */}
      <div className="calculator-section-group">
        <div className="section-group-header">
          <h3>📄 Материалы</h3>
        </div>
        <div className="section-group-content">
          <MaterialsSection
            specs={{ 
              paperType: specs.paperType, 
              paperDensity: specs.paperDensity, 
              lamination: specs.lamination, 
              quantity: specs.quantity,
              material_id: specs.material_id // 🆕 Передаем material_id
            }}
            warehousePaperTypes={warehousePaperTypes}
            availableDensities={availableDensities.map(d => ({ value: d.value, label: d.label }))}
            loadingPaperTypes={loadingPaperTypes}
            getDefaultPaperDensity={getDefaultPaperDensity}
            updateSpecs={updateSpecs}
            schema={backendProductSchema}
            result={result} // 🆕 Передаем результат расчета с реальными данными
          />
        </div>
      </div>

      {/* Печать */}
      <div className="calculator-section-group">
        <div className="section-group-header">
          <h3>🖨️ Печать</h3>
        </div>
        <div className="section-group-content">
          <PrintingSettingsSection
            printTechnology={printTechnology}
            printColorMode={printColorMode}
            sides={specs.sides}
            onPrintTechnologyChange={setPrintTechnology}
            onPrintColorModeChange={setPrintColorMode}
            onSidesChange={(value) => updateSpecs({ sides: value })}
            selectedProduct={selectedProduct}
            backendProductSchema={backendProductSchema}
          />
        </div>
      </div>

      {/* Дополнительные параметры */}
      <DynamicFieldsSection
        schema={backendProductSchema}
        specs={specs as any}
        updateSpecs={updateSpecs as any}
      />

      {/* Дополнительные настройки */}
      <div className="calculator-section-group">
        <div className="section-group-header">
          <h3>⚙️ Дополнительные настройки</h3>
        </div>
        <div className="section-group-content">
          <AdvancedSettingsSection
            specs={{ priceType: specs.priceType, customerType: specs.customerType, pages: specs.pages, magnetic: specs.magnetic, cutting: specs.cutting, folding: specs.folding, roundCorners: specs.roundCorners } as any}
            updateSpecs={updateSpecs as any}
            backendProductSchema={backendProductSchema}
          />
        </div>
      </div>

      {/* Скидки по тиражам */}
      {result && (
        <div className="calculator-section-group">
          <div className="section-group-header">
            <h3>💰 Скидки</h3>
          </div>
          <div className="section-group-content">
            <QuantityDiscountsSection
              quantity={specs.quantity}
              basePrice={result.pricePerItem}
              onDiscountChange={setAppliedDiscount}
            />
          </div>
        </div>
      )}
    </>
  );
});

CalculatorSections.displayName = 'CalculatorSections';

