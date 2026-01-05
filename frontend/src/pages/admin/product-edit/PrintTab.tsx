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
      <div className="template-sections-list">
        <Alert type="info">Загружаем технологии печати…</Alert>
      </div>
    );
  }

  return (
    <div className="template-sections-list">
      {/* Секция: Настройки печати */}
      <div className="template-section" id="section-print">
        <div className="template-section__header">
          <h3 className="template-section__title">Настройки печати</h3>
          <p className="template-section__description">
            Настройте разрешенные типы печати, цветности и стороны для этого продукта. Эти настройки будут использоваться в калькуляторе для фильтрации доступных опций.
          </p>
        </div>
        <div className="template-section__content">
          {/* Технологии печати */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Разрешенные технологии печати
              </label>
              <p className="text-muted text-sm" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#666' }}>
                Выберите технологии, которые можно использовать для этого продукта
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {technologies.length === 0 ? (
                <p style={{ color: '#666', fontSize: 14 }}>Нет доступных технологий печати</p>
              ) : (
                technologies.map((tech) => (
                  <label
                    key={tech.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      cursor: 'pointer',
                      backgroundColor: settings.allowedTechnologies.includes(tech.code) ? '#e8f5e9' : '#fff',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!settings.allowedTechnologies.includes(tech.code)) {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!settings.allowedTechnologies.includes(tech.code)) {
                        e.currentTarget.style.backgroundColor = '#fff';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={settings.allowedTechnologies.includes(tech.code)}
                      onChange={() => handleTechnologyToggle(tech.code)}
                      style={{ cursor: 'pointer', width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14 }}>{tech.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Цветности */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Разрешенные цветности
              </label>
              <p className="text-muted text-sm" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#666' }}>
                Выберите цветности, которые можно использовать для этого продукта
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: settings.allowedColorModes.includes('bw') ? '#e8f5e9' : '#fff',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!settings.allowedColorModes.includes('bw')) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!settings.allowedColorModes.includes('bw')) {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.allowedColorModes.includes('bw')}
                  onChange={() => handleColorModeToggle('bw')}
                  style={{ cursor: 'pointer', width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Чёрно-белая</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: settings.allowedColorModes.includes('color') ? '#e8f5e9' : '#fff',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!settings.allowedColorModes.includes('color')) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!settings.allowedColorModes.includes('color')) {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.allowedColorModes.includes('color')}
                  onChange={() => handleColorModeToggle('color')}
                  style={{ cursor: 'pointer', width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Цветная</span>
              </label>
            </div>
          </div>

          {/* Стороны */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Разрешенные стороны печати
              </label>
              <p className="text-muted text-sm" style={{ marginTop: 4, marginBottom: 12, fontSize: 13, color: '#666' }}>
                Выберите, каким может быть продукт - односторонним и/или двухсторонним
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: settings.allowedSides.includes(1) ? '#e8f5e9' : '#fff',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!settings.allowedSides.includes(1)) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!settings.allowedSides.includes(1)) {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.allowedSides.includes(1)}
                  onChange={() => handleSidesToggle(1)}
                  style={{ cursor: 'pointer', width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Односторонняя</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: settings.allowedSides.includes(2) ? '#e8f5e9' : '#fff',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!settings.allowedSides.includes(2)) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!settings.allowedSides.includes(2)) {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.allowedSides.includes(2)}
                  onChange={() => handleSidesToggle(2)}
                  style={{ cursor: 'pointer', width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14 }}>Двухсторонняя</span>
              </label>
            </div>
          </div>

          {/* Кнопка сохранения */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <Button 
              variant="primary" 
              onClick={handleSave} 
              disabled={saving || !hasChanges}
            >
              {saving ? 'Сохранение…' : 'Сохранить настройки печати'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

PrintTab.displayName = 'PrintTab';

