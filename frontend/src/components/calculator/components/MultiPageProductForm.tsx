import React, { useEffect } from 'react';
import { useMultiPageCalculation, BindingType } from '../hooks/useMultiPageCalculation';
import './MultiPageProductForm.css';

interface MultiPageProductFormProps {
  onCalculate?: (result: any) => void;
  onParamsChange?: (params: any) => void;
}

export const MultiPageProductForm: React.FC<MultiPageProductFormProps> = ({
  onCalculate,
  onParamsChange,
}) => {
  const {
    params,
    result,
    loading,
    error,
    bindingTypes,
    validation,
    calculate,
    updateParam,
    getSelectOptions,
  } = useMultiPageCalculation();

  // Уведомляем родителя об изменении параметров
  useEffect(() => {
    onParamsChange?.(params);
  }, [params, onParamsChange]);

  // Автоматический расчёт при изменении параметров
  useEffect(() => {
    if (validation.isValid) {
      const timer = setTimeout(() => {
        calculate().then(res => {
          if (res) onCalculate?.(res);
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [params, validation.isValid, calculate, onCalculate]);

  const formatOptions = getSelectOptions('format');
  const printTypeOptions = getSelectOptions('printType');
  const paperTypeOptions = getSelectOptions('paperType');
  const paperDensityOptions = getSelectOptions('paperDensity');
  const laminationOptions = getSelectOptions('lamination');

  const currentBinding = bindingTypes.find(b => b.value === params.bindingType);

  return (
    <div className="multipage-form">
      {/* Основные параметры */}
      <div className="multipage-form__section">
        <h4 className="multipage-form__section-title">Основные параметры</h4>
        
        <div className="multipage-form__row">
          <label className="multipage-form__field">
            <span className="multipage-form__label">Страницы в файлах</span>
            <input
              type="number"
              className="multipage-form__input"
              value={params.pages}
              onChange={(e) => updateParam('pages', Math.max(4, parseInt(e.target.value) || 4))}
              min={4}
              max={500}
            />
            {currentBinding?.maxPages && (
              <span className="multipage-form__hint">
                макс. {currentBinding.maxPages} для {currentBinding.label}
              </span>
            )}
          </label>

          <label className="multipage-form__field">
            <span className="multipage-form__label">Тираж</span>
            <input
              type="number"
              className="multipage-form__input"
              value={params.quantity}
              onChange={(e) => updateParam('quantity', Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
          </label>
        </div>

        <div className="multipage-form__row">
          <label className="multipage-form__field">
            <span className="multipage-form__label">Формат</span>
            <select
              className="multipage-form__select"
              value={params.format}
              onChange={(e) => updateParam('format', e.target.value)}
            >
              {formatOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="multipage-form__field">
            <span className="multipage-form__label">Тип печати</span>
            <select
              className="multipage-form__select"
              value={params.printType}
              onChange={(e) => updateParam('printType', e.target.value)}
            >
              {printTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Переплёт */}
      <div className="multipage-form__section">
        <h4 className="multipage-form__section-title">Тип переплёта</h4>
        
        <div className="multipage-form__binding-grid">
          {bindingTypes.map((binding: BindingType) => (
            <button
              key={binding.value}
              type="button"
              className={`multipage-form__binding-btn ${
                params.bindingType === binding.value ? 'multipage-form__binding-btn--active' : ''
              }`}
              onClick={() => updateParam('bindingType', binding.value)}
              title={binding.description}
            >
              <span className="multipage-form__binding-label">{binding.label}</span>
              {binding.maxPages && (
                <span className="multipage-form__binding-limit">до {binding.maxPages} стр.</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Материал */}
      <div className="multipage-form__section">
        <h4 className="multipage-form__section-title">Материал</h4>
        
        <div className="multipage-form__row">
          <label className="multipage-form__field">
            <span className="multipage-form__label">Тип бумаги</span>
            <select
              className="multipage-form__select"
              value={params.paperType}
              onChange={(e) => updateParam('paperType', e.target.value)}
            >
              {paperTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="multipage-form__field">
            <span className="multipage-form__label">Плотность</span>
            <select
              className="multipage-form__select"
              value={params.paperDensity}
              onChange={(e) => updateParam('paperDensity', parseInt(e.target.value))}
            >
              {paperDensityOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label} г/м²</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Опции */}
      <div className="multipage-form__section">
        <h4 className="multipage-form__section-title">Дополнительные опции</h4>
        
        <div className="multipage-form__options">
          <label className="multipage-form__checkbox">
            <input
              type="checkbox"
              checked={params.duplex}
              onChange={(e) => updateParam('duplex', e.target.checked)}
            />
            <span>Двухсторонняя печать</span>
            {currentBinding?.duplexDefault && (
              <span className="multipage-form__tag">рекомендуется</span>
            )}
          </label>

          <label className="multipage-form__checkbox">
            <input
              type="checkbox"
              checked={params.trimMargins}
              onChange={(e) => updateParam('trimMargins', e.target.checked)}
            />
            <span>Обрезать поля</span>
          </label>

          <label className="multipage-form__field multipage-form__field--inline">
            <span className="multipage-form__label">Ламинирование</span>
            <select
              className="multipage-form__select multipage-form__select--small"
              value={params.lamination}
              onChange={(e) => updateParam('lamination', e.target.value)}
            >
              {laminationOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Предупреждения */}
      {validation.warnings.length > 0 && (
        <div className="multipage-form__warnings">
          {validation.warnings.map((warning, idx) => (
            <div key={idx} className="multipage-form__warning">
              ⚠️ {warning}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="multipage-form__error">
          ❌ {error}
        </div>
      )}

      {/* Результат */}
      {result && !loading && (
        <div className="multipage-form__result">
          <div className="multipage-form__result-main">
            <span className="multipage-form__result-label">Итого:</span>
            <span className="multipage-form__result-value">{result.totalCost.toFixed(2)} BYN</span>
          </div>
          {params.quantity > 1 && (
            <div className="multipage-form__result-per-item">
              {result.pricePerItem.toFixed(2)} BYN / шт
            </div>
          )}
          
          <details className="multipage-form__breakdown">
            <summary>Детализация расчёта</summary>
            <ul>
              <li>Печать: {result.breakdown.printCost.toFixed(2)} BYN</li>
              <li>Переплёт: {result.breakdown.bindingCost.toFixed(2)} BYN</li>
              <li>Бумага: {result.breakdown.paperCost.toFixed(2)} BYN</li>
              {result.breakdown.laminationCost > 0 && (
                <li>Ламинация: {result.breakdown.laminationCost.toFixed(2)} BYN</li>
              )}
              {result.breakdown.trimCost > 0 && (
                <li>Обрезка: {result.breakdown.trimCost.toFixed(2)} BYN</li>
              )}
              {result.breakdown.setupCost > 0 && (
                <li>Приладка: {result.breakdown.setupCost.toFixed(2)} BYN</li>
              )}
              <li className="multipage-form__breakdown-sheets">
                Листов: {result.sheets} ({params.duplex ? 'двухсторонняя' : 'односторонняя'})
              </li>
            </ul>
          </details>

          {result.warnings.length > 0 && (
            <div className="multipage-form__result-warnings">
              {result.warnings.map((w, i) => (
                <div key={i}>⚠️ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="multipage-form__loading">
          Расчёт...
        </div>
      )}
    </div>
  );
};

export default MultiPageProductForm;
