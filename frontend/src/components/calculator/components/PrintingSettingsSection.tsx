import React, { useEffect, useState, useMemo } from 'react';
import { getPrintTechnologies } from '../../../api';
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
  /** ID выбранного подтипа (для typeConfigs) */
  selectedTypeId?: number | null;
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
  selectedTypeId,
  materialInFirstColumn,
}) => {
  const [printTechnologies, setPrintTechnologies] = useState<
    Array<{
      code: string
      name: string
      pricing_mode: string
      supports_duplex?: number | boolean
      supports_bw?: number | boolean
    }>
  >([]);

  // Загружаем типы печати
  useEffect(() => {
    // Проверяем кэш
    const cached = apiCache.get<
      Array<{
        code: string
        name: string
        pricing_mode: string
        supports_duplex?: number | boolean
        supports_bw?: number | boolean
      }>
    >(CACHE_KEY);
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

  const simplifiedConfig = backendProductSchema?.template?.simplified;
  const selectedTypeConfig = useMemo(() => {
    if (selectedTypeId == null) return null;
    return simplifiedConfig?.typeConfigs?.[String(selectedTypeId)] ?? null;
  }, [simplifiedConfig, selectedTypeId]);
  const isRollWideM2Mode = useMemo(() => {
    const cfg = selectedTypeConfig?.roll_m2 ?? simplifiedConfig?.roll_m2;
    return cfg?.mode === 'roll_wide_m2';
  }, [selectedTypeConfig, simplifiedConfig]);

  // Получаем разрешенные типы печати из цен печати размера/продукта и constraints
  const allowedPrintTechnologies = useMemo(() => {
    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
    const constraints = backendProductSchema?.constraints;
    const constrainedCodes = Array.isArray(constraints?.allowed_print_technologies)
      ? new Set<string>(
          constraints.allowed_print_technologies
            .map((code: unknown) => normalize(code))
            .filter(Boolean)
        )
      : null;

    // Порядок из настроек продукта: по умолчанию подставляем первую технологию продукта, а не первую из глобального списка (например dtf).
    const techListFromOrder = (order: string[]) => {
      const seen = new Set<string>();
      return order
        .map((code) => normalize(code))
        .filter((code) => {
          if (!code || seen.has(code)) return false;
          seen.add(code);
          return !constrainedCodes || constrainedCodes.has(code);
        })
        .map((code) => printTechnologies.find((t) => normalize(t.code) === code))
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
    };
    const enforcePerM2 = (list: Array<{
      code: string;
      name: string;
      pricing_mode: string;
      supports_duplex?: number | boolean;
      supports_bw?: number | boolean;
    }>) => {
      if (!isRollWideM2Mode) return list;
      return list.filter((tech) => normalize(tech.pricing_mode) === 'per_m2');
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
        const ordered = enforcePerM2(techListFromOrder(orderFromSize));
        if (ordered.length > 0) return ordered;
      }
    }

    // 1.1) Roll-wide m²: листовые print_prices обычно скрыты, берём технологию из sizes[].default_print
    if (isRollWideM2Mode && sizesToCheck && Array.isArray(sizesToCheck)) {
      const orderFromDefaults: string[] = [];
      const targetSizes = selectedSizeId
        ? sizesToCheck.filter((s: any) => String(s.id) === String(selectedSizeId))
        : sizesToCheck;
      targetSizes.forEach((size: any) => {
        const techCode =
          size?.default_print?.technology_code ??
          size?.default_print?.technologyCode ??
          size?.default_print?.print_technology;
        if (techCode && typeof techCode === 'string') orderFromDefaults.push(techCode);
      });
      const initialTech = selectedTypeConfig?.initial?.print_technology;
      if (initialTech && typeof initialTech === 'string') {
        orderFromDefaults.push(initialTech);
      }
      if (orderFromDefaults.length > 0) {
        const ordered = enforcePerM2(techListFromOrder(orderFromDefaults));
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
        const ordered = enforcePerM2(techListFromOrder(orderFromConfig));
        if (ordered.length > 0) return ordered;
      }
    }

    // 3) Если заданы constraints, но не нашли в ценах — показываем только их
    if (constrainedCodes && constrainedCodes.size > 0) {
      const constrained = printTechnologies.filter((tech) => constrainedCodes.has(normalize(tech.code)));
      const constrainedForMode = enforcePerM2(constrained);
      if (constrainedForMode.length > 0) return constrainedForMode;
      return constrained;
    }

    // 4) Если ничего не найдено — пусто (без подстановки из справочника принтеров)
    return [];
  }, [printTechnologies, backendProductSchema, effectiveSizesProp, selectedSizeId, isRollWideM2Mode, selectedTypeConfig]);

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

  // Стороны печати — только из print_prices шаблона (как цвет), не из справочника технологий.
  const allowedSides = useMemo((): Array<1 | 2> => {
    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
    if (!printTechnology) return [];
    if (isRollWideM2Mode) return [1];

    const matching = selectedSizePrintPrices.filter((row: any) => {
      const sameTech = normalize(row.technology_code ?? row.technologyCode) === normalize(printTechnology);
      if (!sameTech) return false;
      if (!printColorMode) return true;
      return normalize(row.color_mode ?? row.colorMode) === normalize(printColorMode);
    });

    if (!matching.length) return [];

    const modes = new Set<1 | 2>();
    for (const row of matching) {
      const mode = normalize(row.sides_mode ?? row.sidesMode);
      if (mode === 'duplex' || mode === 'duplex_bw_back') modes.add(2);
      else if (mode === 'single') modes.add(1);
    }
    const out: Array<1 | 2> = [];
    if (modes.has(1)) out.push(1);
    if (modes.has(2)) out.push(2);
    return out;
  }, [selectedSizePrintPrices, printTechnology, printColorMode, isRollWideM2Mode]);

  const supportsDuplex = allowedSides.includes(2);
  const supportsSingle = allowedSides.includes(1);
  const sidesChoiceAvailable = supportsDuplex && supportsSingle;

  const isColorOnly = useMemo(() => {
    if (!selectedPrintTechnology) return false;
    return selectedPrintTechnology.supports_bw === 0 || selectedPrintTechnology.supports_bw === false;
  }, [selectedPrintTechnology]);

  // Режимы цвета только из шаблона (print_prices). Без подстановки из принтеров — иначе расчёт расходится с ценами.
  const allowedColorModes = useMemo(() => {
    if (!printTechnology) {
      return [];
    }
    if (isRollWideM2Mode) {
      return ['color'];
    }

    // Если технология поддерживает только цветную печать - возвращаем только 'color'
    if (isColorOnly) {
      return ['color'];
    }

    const collectFromPrintPrices = (list: any[] | undefined, into: Set<'bw' | 'color'>) => {
      if (!Array.isArray(list)) return;
      list.forEach((priceConfig: any) => {
        const tech = priceConfig.technology_code || priceConfig.technologyCode;
        if (tech !== printTechnology) return;
        const mode = priceConfig.color_mode ?? priceConfig.colorMode;
        const normalized =
          mode === 'bw' || mode === 'color'
            ? mode
            : String(mode).toLowerCase() === 'bw'
              ? 'bw'
              : String(mode).toLowerCase() === 'color'
                ? 'color'
                : null;
        if (normalized) into.add(normalized);
      });
    };

    const orderModes = (set: Set<'bw' | 'color'>): Array<'bw' | 'color'> => {
      const out: Array<'bw' | 'color'> = [];
      if (set.has('color')) out.push('color');
      if (set.has('bw')) out.push('bw');
      return out;
    };

    const fromTemplate = new Set<'bw' | 'color'>();
    const template = backendProductSchema?.template;
    const sizesForColor = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
      ? effectiveSizesProp
      : template?.simplified?.sizes;
    if (Array.isArray(sizesForColor)) {
      const targetSizes = selectedSizeId
        ? sizesForColor.filter((s: any) => String(s.id) === String(selectedSizeId))
        : sizesForColor;
      targetSizes.forEach((size: any) => collectFromPrintPrices(size.print_prices, fromTemplate));
    }
    const configData = template?.config_data || template;
    if (configData?.print_prices) collectFromPrintPrices(configData.print_prices, fromTemplate);

    return orderModes(fromTemplate);
  }, [printTechnology, isColorOnly, backendProductSchema, effectiveSizesProp, selectedSizeId, isRollWideM2Mode]);

  // 🆕 Устанавливаем дефолтные значения для селекторов печати
  useEffect(() => {
    if (!selectedProduct?.id) return;

    if (allowedPrintTechnologies.length > 0) {
      const isCurrentValid = printTechnology && allowedPrintTechnologies.some(t => t.code === printTechnology);
      // Устанавливаем первый тип печати, если не выбран или выбран недопустимый
      if (!isCurrentValid) {
        onPrintTechnologyChange(allowedPrintTechnologies[0].code);
      }
    }
  }, [selectedProduct?.id, allowedPrintTechnologies, printTechnology, onPrintTechnologyChange]);

  // 🆕 Устанавливаем первый режим цвета, если тип печати выбран, но режим не выбран или недопустим
  useEffect(() => {
    if (!printTechnology) return;

    if (allowedColorModes.length > 0) {
      const isCurrentValid = printColorMode && allowedColorModes.includes(printColorMode);
      if (!isCurrentValid) {
        const firstMode = allowedColorModes[0];
        onPrintColorModeChange(firstMode === 'bw' ? 'bw' : firstMode === 'color' ? 'color' : null);
      }
    } else if (printColorMode != null) {
      onPrintColorModeChange(null);
    }
  }, [printTechnology, allowedColorModes, printColorMode, onPrintColorModeChange]);

  // Стороны: только варианты из print_prices шаблона (не даём выбрать single, если его нет в ценах).
  useEffect(() => {
    if (!printTechnology || allowedSides.length === 0) return;
    if (!allowedSides.includes(sides as 1 | 2)) {
      onSidesChange(allowedSides[0]);
    }
  }, [printTechnology, allowedSides, sides, onSidesChange]);

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
                Нет доступных режимов: задайте строки печати (print_prices) в шаблоне продукта для выбранного размера и технологии.
              </div>
            </div>
          )
        ) : null}

        {/* Стороны печати — только из print_prices шаблона */}
        {printTechnology && allowedSides.length > 0 ? (
          sidesChoiceAvailable ? (
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
          ) : supportsDuplex ? (
            <div className="param-group">
              <label>Стороны печати</label>
              <div className="form-control" style={{ color: '#1a202c', fontWeight: 500 }}>
                Двухсторонняя (только)
              </div>
            </div>
          ) : (
            <div className="param-group">
              <label>Стороны печати</label>
              <div className="form-control" style={{ color: '#666', fontWeight: 500 }}>
                Односторонняя (только)
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};


