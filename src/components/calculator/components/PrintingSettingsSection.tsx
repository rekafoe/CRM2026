import React, { useEffect, useState, useMemo } from 'react';
import { getPrintTechnologies, getPrinters } from '../../../api';
import { apiCache } from '../../../utils/apiCache';
import { Product } from '../../../services/products';

interface PrintingSettingsSectionProps {
  printTechnology: string;
  printColorMode: 'bw' | 'color' | null;
  sides: number;
  onPrintTechnologyChange: (value: string) => void;
  onPrintColorModeChange: (value: 'bw' | 'color' | null) => void;
  onSidesChange: (value: number) => void;
  selectedProduct: (Product & { resolvedProductType?: string }) | null;
  backendProductSchema: any;
}

const CACHE_KEY = 'print-technologies';

export const PrintingSettingsSection: React.FC<PrintingSettingsSectionProps> = ({
  printTechnology,
  printColorMode,
  sides,
  onPrintTechnologyChange,
  onPrintColorModeChange,
  onSidesChange,
  selectedProduct,
  backendProductSchema,
}) => {
  const [printTechnologies, setPrintTechnologies] = useState<Array<{ code: string; name: string; pricing_mode: string }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: number; name: string; technology_code?: string | null; color_mode?: 'bw' | 'color' | 'both' }>>([]);
  const [loading, setLoading] = useState(true);

  // Загружаем типы печати
  useEffect(() => {
    // Проверяем кэш
    const cached = apiCache.get<Array<{ code: string; name: string; pricing_mode: string }>>(CACHE_KEY);
    if (cached) {
      setPrintTechnologies(cached);
    } else {
      // Загружаем данные
      getPrintTechnologies()
        .then((response) => {
          const data = Array.isArray(response.data) ? response.data : [];
          setPrintTechnologies(data);
          // Сохраняем в кэш
          apiCache.set(CACHE_KEY, data, 10 * 60 * 1000); // 10 минут
        })
        .catch(() => {
          setPrintTechnologies([]);
        });
    }
  }, []);

  // Загружаем принтеры для получения разрешенных типов печати и режимов цвета
  useEffect(() => {
    if (!selectedProduct?.id) {
      setPrinters([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const resp = await getPrinters();
        if (cancelled) return;
        
        const printersList = Array.isArray(resp.data) ? resp.data : [];
        setPrinters(printersList);
      } catch (error) {
        if (!cancelled) {
          setPrinters([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProduct?.id]);

  // Получаем разрешенные типы печати из constraints или из принтеров
  const allowedPrintTechnologies = useMemo(() => {
    // Если есть constraints в схеме продукта с allowed_print_technologies
    const constraints = backendProductSchema?.constraints;
    if (constraints?.allowed_print_technologies && Array.isArray(constraints.allowed_print_technologies)) {
      return printTechnologies.filter(tech => 
        constraints.allowed_print_technologies.includes(tech.code)
      );
    }

    // Иначе получаем уникальные типы печати из принтеров
    if (printers.length > 0) {
      const uniqueTechCodes = new Set(
        printers
          .map(p => p.technology_code)
          .filter((code): code is string => Boolean(code))
      );
      return printTechnologies.filter(tech => uniqueTechCodes.has(tech.code));
    }

    // Если нет принтеров и нет constraints - показываем все типы печати
    return printTechnologies;
  }, [printTechnologies, printers, backendProductSchema]);

  // Получаем разрешенные режимы цвета для выбранного типа печати
  const allowedColorModes = useMemo(() => {
    if (!printTechnology) {
      return [];
    }

    const printersForTech = printers.filter(p => p.technology_code === printTechnology);
    const colorModes = new Set<'bw' | 'color'>();
    
    printersForTech.forEach(printer => {
      const mode = printer.color_mode;
      if (mode === 'bw' || mode === 'color') {
        colorModes.add(mode);
      } else if (mode === 'both') {
        colorModes.add('bw');
        colorModes.add('color');
      }
    });

    return Array.from(colorModes);
  }, [printTechnology, printers]);

  if (loading) {
    return (
      <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
        <div className="form-control" style={{ color: '#666' }}>
          Загрузка типов печати...
        </div>
      </div>
    );
  }

  // Если продукт не выбран, не показываем раздел печати
  if (!selectedProduct?.id) {
    return (
      <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
        <div className="form-control" style={{ color: '#666' }}>
          Выберите продукт для настройки параметров печати
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
        <div className="form-control" style={{ color: '#666' }}>
          Загрузка параметров печати...
        </div>
      </div>
    );
  }

  return (
    <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
      <div className="materials-grid compact">
        <div className="param-group">
          <label>
            Тип печати <span style={{ color: 'red' }}>*</span>
          </label>
          <select
            value={printTechnology || ''}
            onChange={(e) => {
              const value = e.target.value;
              onPrintTechnologyChange(value);
              // При сбросе типа печати сбрасываем режим цвета
              if (!value) {
                onPrintColorModeChange(null);
              }
            }}
            className="form-control"
            required
          >
            <option value="">Выберите тип печати</option>
            {allowedPrintTechnologies.map((tech) => (
              <option key={tech.code} value={tech.code}>
                {tech.name}
              </option>
            ))}
          </select>
        </div>

        {printTechnology && allowedColorModes.length > 0 && (
          <div className="param-group">
            <label>
              Режим печати <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              value={printColorMode || ''}
              onChange={(e) => {
                const value = e.target.value;
                onPrintColorModeChange(value === 'bw' ? 'bw' : value === 'color' ? 'color' : null);
              }}
              className="form-control"
              required
            >
              <option value="">Выберите режим</option>
              {allowedColorModes.includes('bw') && (
                <option value="bw">Чёрно-белая</option>
              )}
              {allowedColorModes.includes('color') && (
                <option value="color">Цветная</option>
              )}
            </select>
          </div>
        )}

        <div className="param-group">
          <label>
            Двухсторонняя печать <span style={{ color: 'red' }}>*</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sides === 2}
                onChange={(e) => {
                  onSidesChange(e.target.checked ? 2 : 1);
                }}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>Двухсторонняя</span>
            </label>
            {sides === 1 && (
              <span style={{ color: '#666', fontSize: '14px' }}>Односторонняя</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

