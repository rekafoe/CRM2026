import React from 'react';
import { ProductType, ProductSchema, Service } from '../../hooks/useCalculatorProductManagerState';
import { ProductTypesList } from '../components/ProductTypesList';
import { ProductSchemaEditor } from '../components/ProductSchemaEditor';

interface ProductsTabProps {
  loading: boolean;
  productTypes: ProductType[];
  selectedType: string | null;
  schema: ProductSchema | null;
  services: Service[];
  onSelectType: (key: string) => void;
  onDeleteType: (key: string) => void;
  onAddType: () => void;
  onUpdateOperation: (index: number, field: string, value: any) => void;
  onRemoveOperation: (index: number) => void;
  onAddOperation: () => void;
  onSaveSchema: () => void;
  saving: boolean;
}

export const ProductsTab: React.FC<ProductsTabProps> = React.memo(({
  loading,
  productTypes,
  selectedType,
  schema,
  services,
  onSelectType,
  onDeleteType,
  onAddType,
  onUpdateOperation,
  onRemoveOperation,
  onAddOperation,
  onSaveSchema,
  saving,
}) => {
  return (
    <>
      <div className="instruction-box">
        <div className="instruction-box-title">
          <span>💡</span>
          <span>Как работать с продуктами калькулятора</span>
        </div>
        <div className="instruction-box-content">
          <ol>
            <li><strong>Выберите тип продукта</strong> из списка слева или создайте новый</li>
            <li><strong>Настройте операции</strong> для выбранного типа - каждая операция описывает этап производства</li>
            <li><strong>Укажите формулу расчета</strong> - как вычисляется количество единиц для операции (например: <code>quantity</code> или <code>sheets * sides</code>)</li>
            <li><strong>Привяжите услугу</strong> - выберите услугу из справочника, тариф и единица измерения подставятся автоматически</li>
            <li><strong>Сохраните схему</strong> - все изменения вступят в силу после сохранения</li>
          </ol>
        </div>
      </div>

      <div className="products-grid">
        <ProductTypesList
          loading={loading}
          productTypes={productTypes}
          selectedType={selectedType}
          onSelectType={onSelectType}
          onDeleteType={onDeleteType}
          onAddType={onAddType}
        />

        <ProductSchemaEditor
          loading={loading}
          schema={schema}
          services={services}
          onUpdateOperation={onUpdateOperation}
          onRemoveOperation={onRemoveOperation}
          onAddOperation={onAddOperation}
          onSaveSchema={onSaveSchema}
          saving={saving}
        />
      </div>
    </>
  );
});


