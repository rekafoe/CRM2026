import React from 'react';
import { ProductSpecs } from '../types/calculator.types';

interface SpecificationsFormProps {
  specs: ProductSpecs;
  onSpecsChange: (updates: Partial<ProductSpecs>) => void;
  productConfigs: Record<string, any>;
  warehousePaperTypes: any[];
  dynamicDensities: Array<{value: number, label: string, price: number, material_id: number, available_quantity: number}>;
  validationErrors: Record<string, string>;
  customFormat: { width: string; height: string };
  isCustomFormat: boolean;
  formatValidation: {isValid: boolean, message: string};
  onCustomFormatChange: (format: { width: string; height: string }) => void;
  onCustomFormatToggle: (isCustom: boolean) => void;
}

export const SpecificationsForm: React.FC<SpecificationsFormProps> = ({
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
  onCustomFormatToggle
}) => {
  const currentProductConfig = productConfigs[specs.productType] || {};

  const handleFormatChange = (format: string) => {
    if (format === 'custom') {
      onCustomFormatToggle(true);
    } else {
      onCustomFormatToggle(false);
      onSpecsChange({ format });
    }
  };

  const handleCustomFormatChange = (field: 'width' | 'height', value: string) => {
    const newFormat = { ...customFormat, [field]: value };
    onCustomFormatChange(newFormat);
    if (formatValidation.isValid) {
      onSpecsChange({ format: `${newFormat.width}x${newFormat.height}` });
    }
  };

  return (
    <div className="specifications-form">
      <h3>Спецификации продукта</h3>
      
      {/* Тип продукта */}
      <div className="form-group">
        <label>Тип продукта</label>
        <select
          value={specs.productType}
          onChange={(e) => onSpecsChange({ productType: e.target.value })}
          className={validationErrors.productType ? 'error' : ''}
        >
          <option value="">Выберите тип продукта</option>
          {Object.entries(productConfigs).map(([key, config]) => (
            <option key={key} value={key}>
              {config.name || key}
            </option>
          ))}
        </select>
        {validationErrors.productType && (
          <span className="error-message">{validationErrors.productType}</span>
        )}
      </div>

      {/* Формат */}
      <div className="form-group">
        <label>Формат</label>
        {!isCustomFormat ? (
          <select
            value={specs.format}
            onChange={(e) => handleFormatChange(e.target.value)}
            className={validationErrors.format ? 'error' : ''}
          >
            {currentProductConfig.formats?.map((format: string) => (
              <option key={format} value={format}>{format}</option>
            )) || []}
            <option value="custom">Пользовательский</option>
          </select>
        ) : (
          <div className="custom-format">
            <input
              type="text"
              placeholder="Ширина"
              value={customFormat.width}
              onChange={(e) => handleCustomFormatChange('width', e.target.value)}
              className={!formatValidation.isValid ? 'error' : ''}
            />
            <span>×</span>
            <input
              type="text"
              placeholder="Высота"
              value={customFormat.height}
              onChange={(e) => handleCustomFormatChange('height', e.target.value)}
              className={!formatValidation.isValid ? 'error' : ''}
            />
            <button onClick={() => onCustomFormatToggle(false)}>Отмена</button>
          </div>
        )}
        {validationErrors.format && (
          <span className="error-message">{validationErrors.format}</span>
        )}
        {!formatValidation.isValid && (
          <span className="error-message">{formatValidation.message}</span>
        )}
      </div>

      {/* Количество */}
      <div className="form-group">
        <label>Количество</label>
        <input
          type="number"
          min="1"
          max={currentProductConfig.maxQuantity || 10000}
          value={specs.quantity}
          onChange={(e) => onSpecsChange({ quantity: parseInt(e.target.value) || 0 })}
          className={validationErrors.quantity ? 'error' : ''}
        />
        {validationErrors.quantity && (
          <span className="error-message">{validationErrors.quantity}</span>
        )}
      </div>

      {/* Стороны */}
      <div className="form-group">
        <label>Стороны</label>
        <select
          value={specs.sides}
          onChange={(e) => onSpecsChange({ sides: parseInt(e.target.value) as 1 | 2 })}
        >
          <option value={1}>1 сторона</option>
          <option value={2}>2 стороны</option>
        </select>
      </div>

      {/* Тип бумаги */}
      <div className="form-group">
        <label>Тип бумаги</label>
        <select
          value={specs.paperType}
          onChange={(e) => onSpecsChange({ paperType: e.target.value as any })}
          className={validationErrors.paperType ? 'error' : ''}
        >
          {warehousePaperTypes.map((paperType) => (
            <option key={paperType.id} value={paperType.name}>
              {paperType.name}
            </option>
          ))}
        </select>
        {validationErrors.paperType && (
          <span className="error-message">{validationErrors.paperType}</span>
        )}
      </div>

      {/* Плотность бумаги */}
      <div className="form-group">
        <label>Плотность бумаги (г/м²)</label>
        <select
          value={specs.paperDensity}
          onChange={(e) => onSpecsChange({ paperDensity: parseInt(e.target.value) })}
          className={validationErrors.paperDensity ? 'error' : ''}
        >
          {dynamicDensities.map((density) => (
            <option key={density.value} value={density.value}>
              {density.label} - {density.price} Br/лист
            </option>
          ))}
        </select>
        {validationErrors.paperDensity && (
          <span className="error-message">{validationErrors.paperDensity}</span>
        )}
      </div>

      {/* Ламинация */}
      <div className="form-group">
        <label>Ламинация</label>
        <select
          value={specs.lamination}
          onChange={(e) => onSpecsChange({ lamination: e.target.value as any })}
          className={validationErrors.lamination ? 'error' : ''}
        >
          <option value="none">Без ламинации</option>
          <option value="matte">Матовая</option>
          <option value="glossy">Глянцевая</option>
        </select>
        {validationErrors.lamination && (
          <span className="error-message">{validationErrors.lamination}</span>
        )}
      </div>

      {/* Тип цены */}
      <div className="form-group">
        <label>Тип цены</label>
        <select
          value={specs.priceType}
          onChange={(e) => onSpecsChange({ priceType: e.target.value as any })}
          className={validationErrors.priceType ? 'error' : ''}
        >
          <option value="standard">Стандартная</option>
          <option value="urgent">Срочная</option>
          <option value="superUrgent">Супер срочная</option>
          <option value="online">Онлайн</option>
          <option value="promo">Промо</option>
          <option value="express">Экспресс</option>
        </select>
        {validationErrors.priceType && (
          <span className="error-message">{validationErrors.priceType}</span>
        )}
      </div>

      {/* Тип клиента */}
      <div className="form-group">
        <label>Тип клиента</label>
        <select
          value={specs.customerType}
          onChange={(e) => onSpecsChange({ customerType: e.target.value as any })}
          className={validationErrors.customerType ? 'error' : ''}
        >
          <option value="regular">Обычный</option>
          <option value="vip">VIP</option>
        </select>
        {validationErrors.customerType && (
          <span className="error-message">{validationErrors.customerType}</span>
        )}
      </div>

      {/* VIP уровень */}
      {specs.customerType === 'vip' && (
        <div className="form-group">
          <label>VIP уровень</label>
          <select
            value={specs.vipLevel || 'bronze'}
            onChange={(e) => onSpecsChange({ vipLevel: e.target.value as any })}
            className={validationErrors.vipLevel ? 'error' : ''}
          >
            <option value="bronze">Бронза</option>
            <option value="silver">Серебро</option>
            <option value="gold">Золото</option>
            <option value="platinum">Платина</option>
          </select>
          {validationErrors.vipLevel && (
            <span className="error-message">{validationErrors.vipLevel}</span>
          )}
        </div>
      )}

      {/* Срочность */}
      <div className="form-group">
        <label>Срочность</label>
        <select
          value={specs.urgency || 'standard'}
          onChange={(e) => onSpecsChange({ urgency: e.target.value as any })}
          className={validationErrors.urgency ? 'error' : ''}
        >
          <option value="standard">Стандартная</option>
          <option value="urgent">Срочная</option>
          <option value="superUrgent">Супер срочная</option>
        </select>
        {validationErrors.urgency && (
          <span className="error-message">{validationErrors.urgency}</span>
        )}
      </div>

      {/* Специальные услуги */}
      <div className="form-group">
        <label>Специальные услуги</label>
        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={specs.cutting || false}
              onChange={(e) => onSpecsChange({ cutting: e.target.checked })}
            />
            Резка
          </label>
          <label>
            <input
              type="checkbox"
              checked={specs.folding || false}
              onChange={(e) => onSpecsChange({ folding: e.target.checked })}
            />
            Фальцовка
          </label>
          <label>
            <input
              type="checkbox"
              checked={specs.roundCorners || false}
              onChange={(e) => onSpecsChange({ roundCorners: e.target.checked })}
            />
            Скругление углов
          </label>
        </div>
        {validationErrors.specialServices && (
          <span className="error-message">{validationErrors.specialServices}</span>
        )}
      </div>

      {/* Количество страниц для многостраничных продуктов */}
      {['booklet', 'catalog', 'magazine'].includes(specs.productType) && (
        <div className="form-group">
          <label>Количество страниц</label>
          <input
            type="number"
            min="1"
            value={specs.pages || 1}
            onChange={(e) => onSpecsChange({ pages: parseInt(e.target.value) || 1 })}
            className={validationErrors.pages ? 'error' : ''}
          />
          {validationErrors.pages && (
            <span className="error-message">{validationErrors.pages}</span>
          )}
        </div>
      )}
    </div>
  );
};
