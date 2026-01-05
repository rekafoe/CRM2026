/**
 * Шаг 5: Проверка данных перед созданием
 */

import React from 'react';
import { ProductCategory } from '../../../../services/products';
import { FormState } from '../../hooks/useProductCreationWizardState';

interface Step5ReviewProps {
  form: FormState;
  categories: ProductCategory[];
}

export const Step5Review: React.FC<Step5ReviewProps> = ({ form, categories }) => {
  return (
    <div className="wizard-step flex flex-col gap-4">
      <h4 className="text-lg font-semibold text-primary">Проверка данных</h4>
      <div className="wizard-summary">
        <div className="summary-item">
          <strong>Название:</strong> {form.name}
        </div>
        <div className="summary-item">
          <strong>Категория:</strong> {categories.find((category) => category.id === form.category_id)?.name || '—'}
        </div>
        <div className="summary-item">
          <strong>Операций:</strong> {form.selectedOperations.length}
        </div>
        <div className="summary-item">
          <strong>Материалов:</strong> {form.selectedMaterials.length}
        </div>
        <div className="summary-item">
          <strong>Параметров:</strong> {form.parameters.length}
        </div>
      </div>
    </div>
  );
};

