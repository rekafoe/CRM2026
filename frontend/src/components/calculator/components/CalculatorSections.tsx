import React from 'react';
import { ProductSpecs, CalculationResult } from '../types/calculator.types';
import { Product } from '../../../services/products';
import { ParamsSection, type ParamsSectionSpecs } from './ParamsSection';
import { MaterialsSection } from './MaterialsSection';
import { PrintingSettingsSection } from './PrintingSettingsSection';
import { DynamicFieldsSection } from './DynamicFieldsSection';
import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { OperationsSection } from './OperationsSection';
import { SelectedProductCard } from './SelectedProductCard';

interface CalculatorSectionsProps {
  specs: ProductSpecs;
  availableFormats: string[];
  validationErrors: Record<string, string>;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  setIsCustomFormat: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomFormat: React.Dispatch<React.SetStateAction<{ width: string; height: string }>>;
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
  currentConfig?: { name?: string } | null;
  onOpenProductSelector: () => void;
  effectiveSizes?: Array<{ id: string; label?: string; width_mm: number; height_mm: number; [key: string]: any }>;
  effectivePages?: { options?: number[]; default?: number };
  productTypes?: Array<{ id: string; name: string; default?: boolean }>;
  selectedTypeId?: string | null;
  onSelectType?: (typeId: string) => void;
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
  selectedProduct,
  currentConfig,
  onOpenProductSelector,
  effectiveSizes,
  productTypes,
  selectedTypeId,
  onSelectType,
}) => {
  const hasEffectiveSizes = Array.isArray(effectiveSizes) && effectiveSizes.length > 0;
  const showTypeSelector = Array.isArray(productTypes) && productTypes.length > 0 && onSelectType != null;

  return (
    <div className="calculator-section-group calculator-section-unified">
      <div className="section-group-header">
        <h3>📦 Основные параметры</h3>
      </div>
      <div className="section-group-content">
        <SelectedProductCard
          productType={specs.productType}
          displayName={selectedProduct?.name || (backendProductSchema?.type || currentConfig?.name || specs.productType) as string}
          onOpenSelector={onOpenProductSelector}
        />

        {showTypeSelector && (
          <div className="calculator-product-types">
            <label className="calculator-product-types__label">Тип продукта</label>
            <div className="calculator-product-types__tabs">
              {productTypes.map((t: { id: string; name: string; default?: boolean }) => (
                <button
                  key={t.id}
                  type="button"
                  className={`calculator-product-types__tab ${selectedTypeId === t.id ? 'calculator-product-types__tab--active' : ''}`}
                  onClick={() => onSelectType(t.id)}
                >
                  {t.name}
                  {t.default && <span className="calculator-product-types__badge">по умолчанию</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <ParamsSection
          specs={
            {
              productType: specs.productType,
              format: specs.format,
              quantity: specs.quantity,
              sides: specs.sides,
              size_id: (specs as any).size_id,
              pages: (specs as any).pages,
            } satisfies ParamsSectionSpecs
          }
          availableFormats={availableFormats}
          validationErrors={validationErrors}
          isCustomFormat={isCustomFormat}
          customFormat={customFormat}
          setIsCustomFormat={setIsCustomFormat}
          setCustomFormat={setCustomFormat}
          updateSpecs={updateSpecs}
          schema={backendProductSchema}
          effectiveSizes={effectiveSizes}
          itemsPerSheet={result?.layout?.itemsPerSheet}
        />

        <div className="unified-params-row">
          <PrintingSettingsSection
            printTechnology={printTechnology}
            printColorMode={printColorMode}
            sides={specs.sides}
            onPrintTechnologyChange={setPrintTechnology}
            onPrintColorModeChange={setPrintColorMode}
            onSidesChange={(value) => updateSpecs({ sides: value as 1 | 2 })}
            selectedProduct={selectedProduct}
            backendProductSchema={backendProductSchema}
            effectiveSizes={effectiveSizes}
            selectedSizeId={(specs as any).size_id}
            materialInFirstColumn={
              hasEffectiveSizes && (specs as any).size_id
                ? (
                    <MaterialsSection
                      specs={{
                        paperType: specs.paperType,
                        paperDensity: specs.paperDensity,
                        lamination: specs.lamination,
                        quantity: specs.quantity,
                        material_id: (specs as any).material_id,
                        size_id: (specs as any).size_id,
                      }}
                      warehousePaperTypes={warehousePaperTypes}
                      availableDensities={availableDensities.map(d => ({ value: d.value, label: d.label }))}
                      loadingPaperTypes={loadingPaperTypes}
                      getDefaultPaperDensity={getDefaultPaperDensity}
                      updateSpecs={updateSpecs}
                      schema={backendProductSchema}
                      result={result}
                      renderMaterialOnly
                      effectiveSizes={effectiveSizes}
                    />
                  )
                : undefined
            }
          />
          {!hasEffectiveSizes ? (
          <MaterialsSection
          specs={{ 
            paperType: specs.paperType, 
            paperDensity: specs.paperDensity, 
            lamination: specs.lamination, 
            quantity: specs.quantity,
            material_id: (specs as any).material_id,
            size_id: (specs as any).size_id
          }}
          warehousePaperTypes={warehousePaperTypes}
          availableDensities={availableDensities.map(d => ({ value: d.value, label: d.label }))}
          loadingPaperTypes={loadingPaperTypes}
          getDefaultPaperDensity={getDefaultPaperDensity}
          updateSpecs={updateSpecs}
          schema={backendProductSchema}
          result={result}
          effectiveSizes={effectiveSizes}
        />
          ) : null}
        </div>

        <DynamicFieldsSection
          schema={backendProductSchema}
          specs={specs as any}
          updateSpecs={updateSpecs as any}
        />

        <OperationsSection
          backendProductSchema={backendProductSchema}
          specs={specs as any}
          updateSpecs={updateSpecs as any}
        />

        <AdvancedSettingsSection
          specs={{ priceType: specs.priceType, customerType: specs.customerType, pages: specs.pages, productionDays: specs.productionDays, magnetic: specs.magnetic, cutting: specs.cutting, folding: specs.folding, roundCorners: specs.roundCorners } as any}
          updateSpecs={updateSpecs as any}
          backendProductSchema={backendProductSchema}
        />
      </div>
    </div>
  );
});

CalculatorSections.displayName = 'CalculatorSections';

