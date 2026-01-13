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
  const [printTechnologies, setPrintTechnologies] = useState<Array<{ code: string; name: string; pricing_mode: string; supports_duplex?: number | boolean }>>([]);
  const [printers, setPrinters] = useState<Array<{ id: number; name: string; technology_code?: string | null; color_mode?: 'bw' | 'color' | 'both' }>>([]);
  const [loading, setLoading] = useState(true);

  // Загружаем типы печати
  useEffect(() => {
    // Проверяем кэш
    const cached = apiCache.get<Array<{ code: string; name: string; pricing_mode: string; supports_duplex?: number | boolean }>>(CACHE_KEY);
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

  // Получаем разрешенные типы печати из constraints, цен печати продукта или из принтеров
  const allowedPrintTechnologies = useMemo(() => {
    // 1) Приоритет: constraints.allowed_print_technologies (явно заданные для продукта)
    const constraints = backendProductSchema?.constraints;
    if (constraints?.allowed_print_technologies && Array.isArray(constraints.allowed_print_technologies)) {
      return printTechnologies.filter(tech => 
        constraints.allowed_print_technologies.includes(tech.code)
      );
    }

    // 2) Для упрощённых продуктов: извлекаем технологии из template.simplified.sizes[].print_prices[]
    // Это технологии, для которых настроены цены в шаблоне продукта
    const template = backendProductSchema?.template;
    if (template?.simplified?.sizes && Array.isArray(template.simplified.sizes)) {
      const techCodesFromPrintPrices = new Set<string>();
      template.simplified.sizes.forEach((size: any) => {
        if (Array.isArray(size.print_prices)) {
          size.print_prices.forEach((priceConfig: any) => {
            const techCode = priceConfig.technology_code || priceConfig.technologyCode;
            if (techCode && typeof techCode === 'string') {
              techCodesFromPrintPrices.add(techCode);
            }
          });
        }
      });
      
      if (techCodesFromPrintPrices.size > 0) {
        return printTechnologies.filter(tech => techCodesFromPrintPrices.has(tech.code));
      }
    }

    // 3) Для обычных продуктов: проверяем config_data.print_prices (если есть)
    // На странице шаблона продукта могут быть сохранены цены печати по технологиям
    const configData = template?.config_data || template;
    if (configData?.print_prices && Array.isArray(configData.print_prices)) {
      const techCodesFromConfig = new Set<string>();
      configData.print_prices.forEach((priceConfig: any) => {
        const techCode = priceConfig.technology_code || priceConfig.technologyCode || priceConfig.technology;
        if (techCode && typeof techCode === 'string') {
          techCodesFromConfig.add(techCode);
        }
      });
      
      if (techCodesFromConfig.size > 0) {
        return printTechnologies.filter(tech => techCodesFromConfig.has(tech.code));
      }
    }

    // 4) Fallback: если есть операции печати, но нет явных настроек - используем принтеры
    const operations = backendProductSchema?.operations || [];
    const hasPrintOperations = operations.some((op: any) => 
      op.operationType === 'print' || op.type === 'print' || op.operation_type === 'print'
    );
    
    if (hasPrintOperations && printers.length > 0) {
      const uniqueTechCodes = new Set(
        printers
          .map(p => p.technology_code)
          .filter((code): code is string => Boolean(code))
      );
      return printTechnologies.filter(tech => uniqueTechCodes.has(tech.code));
    }

    // 5) Если ничего не найдено - возвращаем пустой массив (не показываем лишние технологии)
    return [];
  }, [printTechnologies, printers, backendProductSchema]);

  // Получаем информацию о выбранной технологии печати
  const selectedPrintTechnology = useMemo(() => {
    if (!printTechnology) return null;
    return printTechnologies.find(tech => tech.code === printTechnology) || null;
  }, [printTechnology, printTechnologies]);

  // Проверяем, поддерживает ли технология двухстороннюю печать
  const supportsDuplex = useMemo(() => {
    if (!selectedPrintTechnology) return true; // По умолчанию поддерживает
    const supports = selectedPrintTechnology.supports_duplex;
    return supports === 1 || supports === true;
  }, [selectedPrintTechnology]);

  // Проверяем, поддерживает ли технология только цветную печать
  // Для струйных пигментных технологий обычно только цветная печать
  const isColorOnly = useMemo(() => {
    if (!selectedPrintTechnology) return false;
    const code = selectedPrintTechnology.code?.toLowerCase() || '';
    const name = selectedPrintTechnology.name?.toLowerCase() || '';
    // Проверяем по коду или названию
    return code.includes('inkjet_pigment') || 
           code.includes('inkjet') && (code.includes('pigment') || name.includes('пигмент'));
  }, [selectedPrintTechnology]);

  // Получаем разрешенные режимы цвета для выбранного типа печати
  const allowedColorModes = useMemo(() => {
    if (!printTechnology) {
      return [];
    }

    // Если технология поддерживает только цветную печать - возвращаем только 'color'
    if (isColorOnly) {
      return ['color'];
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
  }, [printTechnology, printers, isColorOnly]);

  // 🆕 Устанавливаем дефолтные значения для селекторов печати
  useEffect(() => {
    if (!selectedProduct?.id || loading) return;
    
    // Устанавливаем первый тип печати, если не выбран
    if (allowedPrintTechnologies.length > 0 && !printTechnology) {
      onPrintTechnologyChange(allowedPrintTechnologies[0].code);
    }
  }, [selectedProduct?.id, loading, allowedPrintTechnologies, printTechnology, onPrintTechnologyChange]);

  // 🆕 Устанавливаем первый режим цвета, если тип печати выбран, но режим не выбран
  useEffect(() => {
    if (!printTechnology || loading) return;
    
    if (allowedColorModes.length > 0 && !printColorMode) {
      const firstMode = allowedColorModes[0];
      onPrintColorModeChange(firstMode === 'bw' ? 'bw' : firstMode === 'color' ? 'color' : null);
    }
  }, [printTechnology, loading, allowedColorModes, printColorMode, onPrintColorModeChange]);

  // 🆕 Если технология не поддерживает двухстороннюю печать - устанавливаем sides = 1
  useEffect(() => {
    if (!printTechnology || !supportsDuplex) {
      if (sides === 2) {
        onSidesChange(1);
      }
    }
  }, [printTechnology, supportsDuplex, sides, onSidesChange]);

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
            value={printTechnology || (allowedPrintTechnologies.length > 0 ? allowedPrintTechnologies[0].code : '')}
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
            {allowedPrintTechnologies.map((tech) => (
              <option key={tech.code} value={tech.code}>
                {tech.name}
              </option>
            ))}
          </select>
        </div>

        {/* Режим печати - показываем всегда, если выбран тип печати */}
        {printTechnology ? (
          allowedColorModes.length > 0 ? (
            <div className="param-group">
              <label>
                Режим печати <span style={{ color: 'red' }}>*</span>
              </label>
                {isColorOnly ? (
                // Если технология поддерживает только цветную печать - показываем как текст
                <div className="form-control" style={{ color: '#1a202c', fontWeight: 500 }}>
                  Цветная (только)
                </div>
              ) : (
                <select
                  value={printColorMode || (allowedColorModes.length > 0 ? allowedColorModes[0] : '')}
                  onChange={(e) => {
                    const value = e.target.value;
                    onPrintColorModeChange(value === 'bw' ? 'bw' : value === 'color' ? 'color' : null);
                  }}
                  className="form-control"
                  required
                >
                  {allowedColorModes.includes('bw') && (
                    <option value="bw">Чёрно-белая</option>
                  )}
                  {allowedColorModes.includes('color') && (
                    <option value="color">Цветная</option>
                  )}
                </select>
              )}
            </div>
          ) : (
            <div className="param-group">
              <label>
                Режим печати <span style={{ color: 'red' }}>*</span>
              </label>
              <div className="form-control" style={{ color: '#666' }}>
                Загрузка режимов печати...
              </div>
            </div>
          )
        ) : null}

        {/* Двухсторонняя печать - скрываем, если технология не поддерживает duplex */}
        {supportsDuplex ? (
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
        ) : (
          // Если не поддерживает duplex - показываем как текст "Односторонняя"
          <div className="param-group">
            <label>
              Двухсторонняя печать
            </label>
            <div className="form-control" style={{ color: '#666', fontWeight: 500 }}>
              Односторонняя (только)
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

