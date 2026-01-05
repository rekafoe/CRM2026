import React, { useEffect, useState, useMemo } from 'react';
import { Button, FormField, Alert } from '../../../../components/common';

interface TrimSizeSectionProps {
  trimWidth: string;
  trimHeight: string;
  saving: boolean;
  existingFormats?: string[]; // Список уже заданных форматов из параметра "format"
  onChange: (field: 'width' | 'height', value: string) => void;
  onSave: () => void;
}

const STANDARD_FORMATS = [
  { label: 'A4', width: '210', height: '297' },
  { label: 'A5', width: '148', height: '210' },
  { label: 'A6', width: '105', height: '148' },
  { label: 'A3', width: '297', height: '420' },
  { label: 'DL', width: '99', height: '210' },
];

const TrimSizeSection: React.FC<TrimSizeSectionProps> = ({
  trimWidth,
  trimHeight,
  saving,
  existingFormats = [],
  onChange, 
  onSave 
}) => {
  const [localWidth, setLocalWidth] = useState(trimWidth);
  const [localHeight, setLocalHeight] = useState(trimHeight);
  const [showHelp, setShowHelp] = useState(false);

  // Синхронизация локальных значений с пропсами
  useEffect(() => {
    setLocalWidth(trimWidth);
    setLocalHeight(trimHeight);
  }, [trimWidth, trimHeight]);

  const handleWidthChange = (value: string) => {
    setLocalWidth(value);
    onChange('width', value);
  };

  const handleHeightChange = (value: string) => {
    setLocalHeight(value);
    onChange('height', value);
  };

  const applyFormat = (format: { width: string; height: string }) => {
    setLocalWidth(format.width);
    setLocalHeight(format.height);
    onChange('width', format.width);
    onChange('height', format.height);
  };

  const handleSwap = () => {
    if (!isValid) return;
    setLocalWidth(localHeight);
    setLocalHeight(localWidth);
    onChange('width', localHeight);
    onChange('height', localWidth);
  };

  // Парсинг существующих форматов для отображения
  const parsedExistingFormats = useMemo(() => {
    return existingFormats.map(formatStr => {
      // Поддерживаем разные форматы: "210×148", "210x148", "210*148"
      const normalized = formatStr
        .toLowerCase()
        .replace(/[×х*]/g, 'x')
        .replace(/\s+/g, '');
      
      const parts = normalized.split('x');
      if (parts.length === 2) {
        const width = parts[0].trim();
        const height = parts[1].trim();
        if (width && height && !isNaN(Number(width)) && !isNaN(Number(height))) {
          return { width, height, display: formatStr };
        }
      }
      return null;
    }).filter((f): f is { width: string; height: string; display: string } => f !== null);
  }, [existingFormats]);

  const isValid = localWidth && localHeight && !isNaN(Number(localWidth)) && !isNaN(Number(localHeight));

  const orientation = useMemo(() => {
    const w = Number(localWidth);
    const h = Number(localHeight);
    if (!isValid) return null;
    if (w === h) return { label: 'Квадрат', hint: 'Равные стороны' };
    return w > h
      ? { label: 'Альбомная', hint: 'Ширина больше высоты' }
      : { label: 'Портретная', hint: 'Высота больше ширины' };
  }, [isValid, localWidth, localHeight]);

  return (
    <div className="form-section">
      <div className="form-section__header">
        <h3>Обрезной формат</h3>
        <p className="form-section__subtitle">
          Финальный размер изделия после обрезки (в миллиметрах). 
          При сохранении размер автоматически добавится в параметр "Формат" калькулятора.
        </p>
      </div>

      <div className="form-section__content">
        <div className="format-toolbar">
          <div className="format-toolbar__info">
            В миллиметрах, финальный размер после обрезки. Добавится в параметр «Формат».
            <button
              type="button"
              className="link-button"
              onClick={() => setShowHelp((v) => !v)}
            >
              {showHelp ? 'Скрыть подсказку' : 'Как вводить нестандарт?'}
            </button>
          </div>
          <div className="format-toolbar__actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSwap}
              disabled={!isValid}
            >
              ↔️ Поменять ширину/высоту
            </Button>
          </div>
        </div>

        {showHelp && (
          <div className="format-help">
            <div className="format-help__title">Нестандартный формат</div>
            <ul className="format-help__list">
              <li>Вводите в мм: ширина и высота; для альбомной просто укажите ширину больше высоты.</li>
              <li>После сохранения пара «Ш×В» добавится в параметр «Формат» — можно выбрать в калькуляторе.</li>
              <li>Если перепутали стороны — используйте кнопку «Поменять ширину/высоту».</li>
            </ul>
          </div>
        )}

        {/* Два отдельных поля для ширины и высоты */}
        <div className="format-inputs-grid">
          <FormField label="Ширина (мм)" required>
            <input
              type="number"
              className="form-input"
              placeholder="210"
              value={localWidth}
              onChange={(e) => handleWidthChange(e.target.value)}
              min="1"
              step="1"
            />
          </FormField>
          <FormField label="Высота (мм)" required>
            <input
              type="number"
              className="form-input"
              placeholder="148"
              value={localHeight}
              onChange={(e) => handleHeightChange(e.target.value)}
              min="1"
              step="1"
            />
          </FormField>
        </div>

        {isValid && (
          <div className="size-preview">
            <div className="size-preview__stack">
              <div className="size-preview__label">Предпросмотр:</div>
              <div className="size-preview__value">
                {localWidth} × {localHeight} мм
              </div>
            </div>
            {orientation && (
              <div className="size-preview__orientation">
                <span className="orientation-pill">{orientation.label}</span>
                <span className="orientation-hint">{orientation.hint}</span>
              </div>
            )}
          </div>
        )}

        {/* Список уже заданных форматов */}
        {parsedExistingFormats.length > 0 && (
          <div className="existing-formats">
            <div className="existing-formats__label">Заданные форматы:</div>
            <div className="existing-formats__list">
              {parsedExistingFormats.map((format, index) => (
                <button
                  key={index}
                  type="button"
                  className="format-chip format-chip--existing"
                  onClick={() => applyFormat(format)}
                  title={`Применить ${format.display}`}
                >
                  {format.display}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Стандартные форматы */}
        <div className="standard-formats">
          <div className="standard-formats__label">Стандартные форматы:</div>
          <div className="standard-formats__list">
            {STANDARD_FORMATS.map((format) => (
              <button
                key={format.label}
                type="button"
                className="format-chip"
                onClick={() => applyFormat(format)}
                title={`Применить ${format.label}: ${format.width}×${format.height} мм`}
              >
                {format.label}
              </button>
            ))}
          </div>
        </div>

        {!isValid && (localWidth || localHeight) && (
          <Alert type="warning">
            Укажите корректные числовые значения для ширины и высоты
          </Alert>
        )}

        <div className="form-section__actions">
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !isValid}
          >
            {saving ? 'Сохранение…' : '💾 Сохранить и добавить в параметры'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TrimSizeSection;
