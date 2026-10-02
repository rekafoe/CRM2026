import React from 'react';
import { Button, LoadingState, EmptyState } from '../../../common';
import { ProductSchema, Service } from '../../hooks/useCalculatorProductManagerState';
import { OperationsList } from './OperationsList';

interface ProductSchemaEditorProps {
  loading: boolean;
  schema: ProductSchema | null;
  services: Service[];
  onUpdateOperation: (index: number, field: string, value: any) => void;
  onRemoveOperation: (index: number) => void;
  onAddOperation: () => void;
  onSaveSchema: () => void;
  saving: boolean;
}

export const ProductSchemaEditor: React.FC<ProductSchemaEditorProps> = React.memo(({
  loading,
  schema,
  services,
  onUpdateOperation,
  onRemoveOperation,
  onAddOperation,
  onSaveSchema,
  saving,
}) => {
  return (
    <div className="schema-panel">
      <div className="panel-header">
        <h2>
          {schema ? `Схема: ${schema.name}` : 'Выберите тип продукта'}
        </h2>
      </div>
      
      <div className="panel-content">
        {loading && !schema ? (
          <LoadingState message="Загрузка схемы..." />
        ) : schema ? (
          <>
            <OperationsList
              operations={schema.operations}
              services={services}
              onUpdateOperation={onUpdateOperation}
              onRemoveOperation={onRemoveOperation}
              onAddOperation={onAddOperation}
            />
            
            <div className="operation-actions">
              <Button
                variant="success"
                onClick={onSaveSchema}
                loading={saving}
                disabled={saving}
              >
                Сохранить схему
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon=""
            title="Выберите тип продукта"
            description="Выберите тип продукта из списка слева для редактирования его схемы"
          />
        )}
      </div>
    </div>
  );
});


