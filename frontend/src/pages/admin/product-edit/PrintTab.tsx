import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert, Button } from '../../../components/common';
import { getPrintTechnologies } from '../../../api';

interface PrintTechnology {
  code: string;
  name: string;
  is_active: number | boolean;
}

interface PrintTabProps {
  productId: number | null;
  product: any;
  saving: boolean;
  onSave: (settings: ProductPrintSettings) => Promise<void>;
}

export interface ProductPrintSettings {
  allowedTechnologies: string[]; // коды технологий печати
  allowedColorModes: ('bw' | 'color')[]; // разрешенные цветности
  allowedSides: (1 | 2)[]; // разрешенные стороны: 1 - односторонняя, 2 - двухсторонняя
}

export const PrintTab: React.FC<PrintTabProps> = React.memo(({
  productId,
  product,
  saving,
  onSave,
}) => {
  const [technologies, setTechnologies] = useState<PrintTechnology[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ProductPrintSettings>({
    allowedTechnologies: [],
    allowedColorModes: [],
    allowedSides: [],
  });

  // Загружаем технологии печати
  useEffect(() => {
    const loadTechnologies = async () => {
      try {
        setLoading(true);
        const response = await getPrintTechnologies();
        const techs = Array.isArray(response.data) 
          ? response.data.filter((t: any) => t.is_active !== 0 && t.is_active !== false)
          : [];
        setTechnologies(techs);
      } catch (error) {
        console.error('Ошибка загрузки технологий печати:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTechnologies();
  }, []);

  // Загружаем настройки продукта
  useEffect(() => {
    if (product) {
      const printSettings = (product as any)?.print_settings;
      if (printSettings) {
        try {
          const parsed = typeof printSettings === 'string' 
            ? JSON.parse(printSettings) 
            : printSettings;
          setSettings({
            allowedTechnologies: parsed.allowedTechnologies || [],
            allowedColorModes: parsed.allowedColorModes || [],
            allowedSides: parsed.allowedSides || [],
          });
        } catch (e) {
          console.error('Ошибка парсинга настроек печати:', e);
        }
      }
    }
  }, [product]);

  const handleTechnologyToggle = useCallback((code: string) => {
    setSettings(prev => ({
      ...prev,
      allowedTechnologies: prev.allowedTechnologies.includes(code)
        ? prev.allowedTechnologies.filter(t => t !== code)
        : [...prev.allowedTechnologies, code],
    }));
  }, []);

  const handleColorModeToggle = useCallback((mode: 'bw' | 'color') => {
    setSettings(prev => ({
      ...prev,
      allowedColorModes: prev.allowedColorModes.includes(mode)
        ? prev.allowedColorModes.filter(m => m !== mode)
        : [...prev.allowedColorModes, mode],
    }));
  }, []);

  const handleSidesToggle = useCallback((sides: 1 | 2) => {
    setSettings(prev => ({
      ...prev,
      allowedSides: prev.allowedSides.includes(sides)
        ? prev.allowedSides.filter(s => s !== sides)
        : [...prev.allowedSides, sides],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await onSave(settings);
    } catch (error) {
      console.error('Ошибка сохранения настроек печати:', error);
    }
  }, [settings, onSave]);

  const hasChanges = useMemo(() => {
    const currentSettings = (product as any)?.print_settings;
    if (!currentSettings) return true;
    try {
      const parsed = typeof currentSettings === 'string' 
        ? JSON.parse(currentSettings) 
        : currentSettings;
      return JSON.stringify(parsed) !== JSON.stringify(settings);
    } catch {
      return true;
    }
  }, [product, settings]);

  if (loading) {
    return (
      <div className="product-tab-panel">
        <Alert type="info">Загружаем технологии печати…</Alert>
      </div>
    );
  }

  return (
    <div className="product-tab-panel">
      <div className="print-settings__group">
        <span className="print-settings__group-title">Разрешенные технологии печати</span>
        <span className="print-settings__group-hint">
          Выберите технологии, которые можно использовать для этого продукта
        </span>
        <div className="print-settings__options">
          {technologies.length === 0 ? (
            <p className="print-settings__empty">Нет доступных технологий печати</p>
          ) : (
            technologies.map((tech) => (
              <label
                key={tech.code}
                className={`print-settings__option ${settings.allowedTechnologies.includes(tech.code) ? 'print-settings__option--active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={settings.allowedTechnologies.includes(tech.code)}
                  onChange={() => handleTechnologyToggle(tech.code)}
                />
                <span className="print-settings__option-label">{tech.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="print-settings__group">
        <span className="print-settings__group-title">Разрешенные цветности</span>
        <span className="print-settings__group-hint">
          Выберите цветности, которые можно использовать для этого продукта
        </span>
        <div className="print-settings__options">
          <label className={`print-settings__option ${settings.allowedColorModes.includes('bw') ? 'print-settings__option--active' : ''}`}>
            <input
              type="checkbox"
              checked={settings.allowedColorModes.includes('bw')}
              onChange={() => handleColorModeToggle('bw')}
            />
            <span className="print-settings__option-label">Чёрно-белая</span>
          </label>
          <label className={`print-settings__option ${settings.allowedColorModes.includes('color') ? 'print-settings__option--active' : ''}`}>
            <input
              type="checkbox"
              checked={settings.allowedColorModes.includes('color')}
              onChange={() => handleColorModeToggle('color')}
            />
            <span className="print-settings__option-label">Цветная</span>
          </label>
        </div>
      </div>

      <div className="print-settings__group">
        <span className="print-settings__group-title">Разрешенные стороны печати</span>
        <span className="print-settings__group-hint">
          Выберите, каким может быть продукт — односторонним и/или двухсторонним
        </span>
        <div className="print-settings__options">
          <label className={`print-settings__option ${settings.allowedSides.includes(1) ? 'print-settings__option--active' : ''}`}>
            <input
              type="checkbox"
              checked={settings.allowedSides.includes(1)}
              onChange={() => handleSidesToggle(1)}
            />
            <span className="print-settings__option-label">Односторонняя</span>
          </label>
          <label className={`print-settings__option ${settings.allowedSides.includes(2) ? 'print-settings__option--active' : ''}`}>
            <input
              type="checkbox"
              checked={settings.allowedSides.includes(2)}
              onChange={() => handleSidesToggle(2)}
            />
            <span className="print-settings__option-label">Двухсторонняя</span>
          </label>
        </div>
      </div>

      <div className="print-settings__actions">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Сохранение…' : 'Сохранить настройки печати'}
        </Button>
      </div>
    </div>
  );
});

PrintTab.displayName = 'PrintTab';

