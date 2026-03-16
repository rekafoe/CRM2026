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
  /** Размеры текущего типа продукта (если у продукта есть типы) */
  effectiveSizes?: Array<{ id: string; print_prices?: any[]; [key: string]: any }>;
  /** ID выбранного размера (если применимо) */
  selectedSizeId?: string | number;
  /** Блок «Материал» для первой колонки (под «Тип печати») — одна линия по вертикали */
  materialInFirstColumn?: React.ReactNode;
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
  effectiveSizes: effectiveSizesProp,
  selectedSizeId,
  materialInFirstColumn,
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

  // Получаем разрешенные типы печати из цен печати размера/продукта и constraints
  const allowedPrintTechnologies = useMemo(() => {
    const constraints = backendProductSchema?.constraints;
    const constrainedCodes = Array.isArray(constraints?.allowed_print_technologies)
      ? new Set<string>(
          constraints.allowed_print_technologies
            .map((code: unknown) => String(code ?? '').trim())
            .filter(Boolean)
        )
      : null;

    // Порядок из настроек продукта: по умолчанию подставляем первую технологию продукта, а не первую из глобального списка (например dtf).
    const techListFromOrder = (order: string[]) => {
      const seen = new Set<string>();
      return order
        .filter((code) => {
          if (!code || seen.has(code)) return false;
          seen.add(code);
          return !constrainedCodes || constrainedCodes.has(code);
        })
        .map((code) => printTechnologies.find((t) => t.code === code))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
    };

    // 1) Для упрощённых продуктов: технологии из print_prices в порядке появления в продукте
    const sizesToCheck = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
      ? effectiveSizesProp
      : backendProductSchema?.template?.simplified?.sizes;
    if (sizesToCheck && Array.isArray(sizesToCheck)) {
      const orderFromSize: string[] = [];
      const targetSizes = selectedSizeId 
        ? sizesToCheck.filter((s: any) => String(s.id) === String(selectedSizeId))
        : sizesToCheck;
      targetSizes.forEach((size: any) => {
        if (Array.isArray(size.print_prices)) {
          size.print_prices.forEach((priceConfig: any) => {
            const techCode = priceConfig.technology_code || priceConfig.technologyCode;
            if (techCode && typeof techCode === 'string') orderFromSize.push(techCode);
          });
        }
      });
      if (orderFromSize.length > 0) {
        const ordered = techListFromOrder(orderFromSize);
        if (ordered.length > 0) return ordered;
      }
    }
    const template = backendProductSchema?.template;

    // 2) Для обычных продуктов: порядок из config_data.print_prices (как в шаблоне продукта)
    const configData = template?.config_data || template;
    if (configData?.print_prices && Array.isArray(configData.print_prices)) {
      const orderFromConfig: string[] = [];
      configData.print_prices.forEach((priceConfig: any) => {
        const techCode = priceConfig.technology_code || priceConfig.technologyCode || priceConfig.technology;
        if (techCode && typeof techCode === 'string') orderFromConfig.push(techCode);
      });
      if (orderFromConfig.length > 0) {
        const ordered = techListFromOrder(orderFromConfig);
        if (ordered.length > 0) return ordered;
      }
    }

    // 3) Fallback: если есть операции печати, но нет явных настроек - используем принтеры
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
      return printTechnologies.filter((tech) => {
        const inPrinters = uniqueTechCodes.has(tech.code);
        if (!inPrinters) return false;
        return constrainedCodes ? constrainedCodes.has(tech.code) : true;
      });
    }

    // 4) Если заданы constraints, но не нашли в ценах/принтерах — показываем только их
    if (constrainedCodes && constrainedCodes.size > 0) {
      return printTechnologies.filter((tech) => constrainedCodes.has(tech.code));
    }

    // 5) Если ничего не найдено - возвращаем пустой массив (не показываем лишние технологии)
    return [];
  }, [printTechnologies, printers, backendProductSchema, effectiveSizesProp, selectedSizeId]);

  // Получаем информацию о выбранной технологии печати
  const selectedPrintTechnology = useMemo(() => {
    if (!printTechnology) return null;
    return printTechnologies.find(tech => tech.code === printTechnology) || null;
  }, [printTechnology, printTechnologies]);

  const selectedSizePrintPrices = useMemo(() => {
    const sizesToCheck = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
      ? effectiveSizesProp
      : backendProductSchema?.template?.simplified?.sizes;
    if (!Array.isArray(sizesToCheck)) return [];

    const targetSizes = selectedSizeId
      ? sizesToCheck.filter((s: any) => String(s.id) === String(selectedSizeId))
      : sizesToCheck;
    const rows = targetSizes.flatMap((s: any) => (Array.isArray(s.print_prices) ? s.print_prices : []));
    return Array.isArray(rows) ? rows : [];
  }, [effectiveSizesProp, backendProductSchema, selectedSizeId]);

  // Проверяем, поддерживает ли технология двухстороннюю печать
  // Приоритет: если в print_prices выбранного размера нет duplex для выбранной технологии
  // (и выбранного цвета, если он задан) — считаем, что для продукта duplex недоступен.
  const supportsDuplex = useMemo(() => {
    const normalize = (value: any) => String(value ?? '').trim().toLowerCase();

    const productDuplexSupport = (() => {
      if (!printTechnology) return null as boolean | null;
      if (!selectedSizePrintPrices.length) return null as boolean | null;

      const matching = selectedSizePrintPrices.filter((row: any) => {
        const sameTech = normalize(row.technology_code ?? row.technologyCode) === normalize(printTechnology);
        if (!sameTech) return false;
        if (!printColorMode) return true;
        return normalize(row.color_mode ?? row.colorMode) === normalize(printColorMode);
      });

      if (!matching.length) return false;
      return matching.some((row: any) => {
        const mode = normalize(row.sides_mode ?? row.sidesMode);
        return mode === 'duplex' || mode === 'duplex_bw_back';
      });
    })();

    const supports = selectedPrintTechnology?.supports_duplex;
    const techSupportsDuplex = selectedPrintTechnology ? (supports === 1 || supports === true) : true;

    if (productDuplexSupport === null) return techSupportsDuplex;
    return techSupportsDuplex && productDuplexSupport;
  }, [selectedPrintTechnology, selectedSizePrintPrices, printTechnology, printColorMode]);

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

    const colorModes = new Set<'bw' | 'color'>();

    // 1) Из принтеров с этой технологией
    const printersForTech = printers.filter(p => p.technology_code === printTechnology);
    printersForTech.forEach(printer => {
      const mode = printer.color_mode;
      if (mode === 'bw' || mode === 'color') {
        colorModes.add(mode);
      } else if (mode === 'both') {
        colorModes.add('bw');
        colorModes.add('color');
      }
    });

    // 2) Fallback: из шаблона продукта (print_prices)
    if (colorModes.size === 0) {
      const template = backendProductSchema?.template;
      const collectFromPrintPrices = (list: any[] | undefined) => {
        if (!Array.isArray(list)) return;
        list.forEach((priceConfig: any) => {
          const tech = priceConfig.technology_code || priceConfig.technologyCode;
          if (tech !== printTechnology) return;
          const mode = priceConfig.color_mode ?? priceConfig.colorMode;
          const normalized = mode === 'bw' || mode === 'color' ? mode : String(mode).toLowerCase() === 'bw' ? 'bw' : String(mode).toLowerCase() === 'color' ? 'color' : null;
          if (normalized) colorModes.add(normalized);
        });
      };
      const sizesForColor = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
        ? effectiveSizesProp
        : template?.simplified?.sizes;
      if (Array.isArray(sizesForColor)) {
        const targetSizes = selectedSizeId 
          ? sizesForColor.filter((s: any) => String(s.id) === String(selectedSizeId))
          : sizesForColor;
        targetSizes.forEach((size: any) => collectFromPrintPrices(size.print_prices));
      }
      const configData = template?.config_data || template;
      if (configData?.print_prices) collectFromPrintPrices(configData.print_prices);
    }

    // 3) Если всё ещё пусто — для выбранной технологии предлагаем оба режима (чтобы не зависать на «Загрузка режимов печати...»)
    if (colorModes.size === 0 && allowedPrintTechnologies.some(t => t.code === printTechnology)) {
      colorModes.add('bw');
      colorModes.add('color');
    }

    return Array.from(colorModes);
  }, [printTechnology, printers, isColorOnly, backendProductSchema, allowedPrintTechnologies, effectiveSizesProp, selectedSizeId]);

  // 🆕 Устанавливаем дефолтные значения для селекторов печати
  useEffect(() => {
    if (!selectedProduct?.id || loading) return;
    
    if (allowedPrintTechnologies.length > 0) {
      const isCurrentValid = printTechnology && allowedPrintTechnologies.some(t => t.code === printTechnology);
      // Устанавливаем первый тип печати, если не выбран или выбран недопустимый
      if (!isCurrentValid) {
        onPrintTechnologyChange(allowedPrintTechnologies[0].code);
      }
    }
  }, [selectedProduct?.id, loading, allowedPrintTechnologies, printTechnology, onPrintTechnologyChange]);

  // 🆕 Устанавливаем первый режим цвета, если тип печати выбран, но режим не выбран или недопустим
  useEffect(() => {
    if (!printTechnology || loading) return;
    
    if (allowedColorModes.length > 0) {
      const isCurrentValid = printColorMode && allowedColorModes.includes(printColorMode);
      if (!isCurrentValid) {
        const firstMode = allowedColorModes[0];
        onPrintColorModeChange(firstMode === 'bw' ? 'bw' : firstMode === 'color' ? 'color' : null);
      }
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

  // Продукт без печати — не показываем селекты печати, но показываем материалы (если есть)
  // Иначе при смене размера материалы не обновляются, т.к. MaterialsSection не рендерится
  if (allowedPrintTechnologies.length === 0) {
    if (materialInFirstColumn) {
      return (
        <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
          <div className="printing-settings-row">
            <div className="printing-first-column">
              {materialInFirstColumn}
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="form-section compact" style={{ padding: 0, border: 'none', background: 'transparent' }}>
      <div className="printing-settings-row">
        {materialInFirstColumn ? (
          <div className="printing-first-column">
            <div className="param-group">
              <label>
                Тип печати <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                value={printTechnology || (allowedPrintTechnologies.length > 0 ? allowedPrintTechnologies[0].code : '')}
                onChange={(e) => {
                  const value = e.target.value;
                  onPrintTechnologyChange(value);
                  if (!value) onPrintColorModeChange(null);
                }}
                className="form-control"
                required
              >
                {allowedPrintTechnologies.map((tech) => (
                  <option key={tech.code} value={tech.code}>{tech.name}</option>
                ))}
              </select>
            </div>
            {materialInFirstColumn}
          </div>
        ) : (
          <div className="param-group">
            <label>
              Тип печати <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              value={printTechnology || (allowedPrintTechnologies.length > 0 ? allowedPrintTechnologies[0].code : '')}
              onChange={(e) => {
                const value = e.target.value;
                onPrintTechnologyChange(value);
                if (!value) onPrintColorModeChange(null);
              }}
              className="form-control"
              required
            >
              {allowedPrintTechnologies.map((tech) => (
                <option key={tech.code} value={tech.code}>{tech.name}</option>
              ))}
            </select>
          </div>
        )}

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


