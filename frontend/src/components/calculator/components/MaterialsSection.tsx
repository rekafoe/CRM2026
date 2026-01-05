import React, { useState, useEffect, useMemo } from 'react';
import { checkMaterialAvailability, calculateMaterialCost } from '../../../services/calculatorMaterialService';

interface MaterialsSectionProps {
  specs: {
    paperType: string;
    paperDensity: number;
    lamination: 'none' | 'matte' | 'glossy';
    quantity: number;
    material_id?: number; // 🆕 ID материала из схемы
    [key: string]: any; // Для других полей
  };
  warehousePaperTypes: Array<{ 
    name: string; 
    display_name: string; 
    densities?: Array<{ 
      value: number; 
      label: string; 
      price?: number;
      available_quantity?: number;
      is_available?: boolean;
    }> 
  }>;
  availableDensities: Array<{ value: number; label: string }>;
  loadingPaperTypes: boolean;
  getDefaultPaperDensity: (paperType: string) => number;
  updateSpecs: (updates: Partial<any>, instant?: boolean) => void; // 🆕 Добавили instant
  schema?: { 
    fields?: Array<{ name: string }>; 
    constraints?: { allowed_paper_types?: string[] | null } 
  } | null;
  // 🆕 Реальные данные из результата расчета бэкенда
  result?: {
    materials?: Array<{
      materialId: number;
      materialName: string;
      quantity: number;
      unitPrice: number;
      totalCost: number;
    }>;
    layout?: {
      sheetsNeeded?: number;
      itemsPerSheet?: number;
    };
  } | null;
}

export const MaterialsSection: React.FC<MaterialsSectionProps> = ({
  specs,
  warehousePaperTypes,
  availableDensities,
  loadingPaperTypes,
  getDefaultPaperDensity,
  updateSpecs,
  schema,
  result // 🆕 Результат расчета с реальными данными
}) => {
  const [materialAvailability, setMaterialAvailability] = useState<{
    available: boolean;
    available_quantity: number;
    material_id: number | null;
    message?: string;
  } | null>(null);
  const [materialCost, setMaterialCost] = useState<{
    material_cost: number;
    sheets_needed: number;
    price_per_sheet: number;
  } | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  const hasField = (name: string) => !!schema?.fields?.some(f => f.name === name);
  const getLabel = (name: string, fallback: string) => (schema?.fields as any)?.find((f: any) => f.name === name)?.label || fallback;
  const isRequired = (name: string) => !!(schema?.fields as any)?.find((f: any) => f.name === name)?.required;
  const getPlaceholder = (name: string, fb: string) => (schema?.fields as any)?.find((f: any) => f.name === name)?.placeholder || fb;

  // Проверяем доступность материалов при изменении параметров
  useEffect(() => {
    if (specs.paperType && specs.paperDensity && specs.quantity > 0) {
      checkAvailability();
      calculateCost();
    }
  }, [specs.paperType, specs.paperDensity, specs.quantity, result]); // 🆕 Добавили result в зависимости

  const checkAvailability = async () => {
    setIsCheckingAvailability(true);
    try {
      const availability = await checkMaterialAvailability(
        specs.paperType,
        specs.paperDensity,
        specs.quantity
      );
      setMaterialAvailability(availability);
    } catch (error) {
      console.error('Ошибка проверки доступности материалов:', error);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const calculateCost = async () => {
    try {
      // ⚠️ ВАЖНО: Используем реальные данные из результата бэкенда, если они есть
      if (result?.materials && result.materials.length > 0 && result.layout?.sheetsNeeded) {
        const material = result.materials[0]; // Берем первый материал
        const sheetsNeeded = result.layout.sheetsNeeded;
        const pricePerSheet = material.unitPrice ?? material.price ?? 0;
        const materialCost = material.totalCost ?? material.total ?? 0;
        
        // Проверяем, что все значения валидны
        if (typeof materialCost === 'number' && typeof pricePerSheet === 'number' && typeof sheetsNeeded === 'number') {
          setMaterialCost({
            material_cost: materialCost,
            sheets_needed: sheetsNeeded,
            price_per_sheet: pricePerSheet,
          });
          return;
        }
      }
      
      // Fallback: примерный расчет только если нет данных от бэкенда
      const cost = await calculateMaterialCost(
        specs.paperType,
        specs.paperDensity,
        specs.quantity,
        specs.sides || 1
      );
      setMaterialCost(cost);
    } catch (error) {
      console.error('Ошибка расчета стоимости материалов:', error);
      setMaterialCost(null); // Сбрасываем при ошибке
    }
  };

  const getDensityInfo = (density: number) => {
    const paperType = warehousePaperTypes.find(pt => pt.name === specs.paperType);
    return paperType?.densities?.find(d => d.value === density);
  };

  // 🆕 Фильтруем типы бумаги на основе constraints из схемы продукта
  const allowedPaperTypes = schema?.constraints?.allowed_paper_types;
  
  const filteredPaperTypes = useMemo(() => {
    // Если ограничений нет (null, undefined, пустой массив) - показываем все типы
    if (!allowedPaperTypes || !Array.isArray(allowedPaperTypes) || allowedPaperTypes.length === 0) {
      return warehousePaperTypes;
    }
    
    // Фильтруем только разрешенные типы
    const filtered = warehousePaperTypes.filter(pt => {
      return allowedPaperTypes.includes(pt.name);
    });
    
    if (filtered.length === 0) {
      console.warn('⚠️ [MaterialsSection] После фильтрации не осталось типов бумаги!');
    }
    
    return filtered;
  }, [warehousePaperTypes, allowedPaperTypes]);

  // 🆕 Если текущий тип бумаги не входит в разрешенные - сбрасываем на первый разрешенный
  useEffect(() => {
    if (filteredPaperTypes.length > 0 && specs.paperType && !filteredPaperTypes.some(pt => pt.name === specs.paperType)) {
      updateSpecs({ 
        paperType: filteredPaperTypes[0].name,
        paperDensity: getDefaultPaperDensity(filteredPaperTypes[0].name)
      }, true);
    }
  }, [filteredPaperTypes, specs.paperType, updateSpecs, getDefaultPaperDensity]);

  return (
    <div className="form-section compact">
      <h3>📄 Материалы</h3>
      {allowedPaperTypes && Array.isArray(allowedPaperTypes) && allowedPaperTypes.length > 0 && (
        <div className="alert alert-info" style={{ fontSize: '0.85em', marginBottom: '1rem' }}>
          <small>ℹ️ Для этого продукта доступны только выбранные типы бумаги: {allowedPaperTypes.join(', ')}</small>
        </div>
      )}
      <div className="materials-grid compact">
        {/* Тип бумаги */}
        {hasField('paperType') && (
        <div className="param-group">
          <label>
            {getLabel('paperType', 'Тип бумаги')}
            {isRequired('paperType') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          {loadingPaperTypes ? (
            <div className="form-control" style={{ color: '#666' }}>
              Загрузка типов бумаги...
            </div>
          ) : filteredPaperTypes.length === 0 ? (
            <div className="alert alert-warning">
              <small>⚠️ Нет доступных типов бумаги для этого продукта</small>
            </div>
          ) : (
            <select
              value={specs.paperType}
              onChange={(e) => updateSpecs({ 
                paperType: e.target.value as any,
                paperDensity: getDefaultPaperDensity(e.target.value)
              }, true)} // 🆕 instant для select
              className="form-control"
              required={isRequired('paperType')}
            >
              {filteredPaperTypes.map(paperType => (
                <option key={paperType.name} value={paperType.name}>
                  {paperType.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
        )}

        {/* Плотность бумаги */}
        {hasField('paperDensity') && (
        <div className="param-group">
          <label>
            {getLabel('paperDensity', 'Плотность')}
            {isRequired('paperDensity') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          {availableDensities.length > 0 ? (
            <select
              value={specs.paperDensity}
              onChange={(e) => updateSpecs({ paperDensity: parseInt(e.target.value) }, true)} // 🆕 instant
              className="form-control"
              required={isRequired('paperDensity')}
            >
              {availableDensities.map(density => {
                const densityInfo = getDensityInfo(density.value);
                const isAvailable = densityInfo?.is_available !== false;
                const price = densityInfo?.price || 0;
                const availableQty = densityInfo?.available_quantity || 0;
                
                return (
                  <option key={density.value} value={density.value} disabled={!isAvailable}>
                    {density.label} {price > 0 ? `(${price.toFixed(2)} BYN/лист)` : ''} {!isAvailable ? '(недоступно)' : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="alert alert-warning">
              <small>
                ⚠️ Для выбранного типа бумаги нет доступных плотностей в базе данных.
                <br />
                Выберите другой тип бумаги или обратитесь к администратору.
              </small>
            </div>
          )}
        </div>
        )}

        {/* Ламинация */}
        {hasField('lamination') && (
        <div className="param-group">
          <label>
            {getLabel('lamination', 'Ламинация')}
            {isRequired('lamination') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          <select
            value={specs.lamination}
            onChange={(e) => updateSpecs({ lamination: e.target.value as any }, true)} // 🆕 instant
            className="form-control"
          >
            <option value="none">Без ламинации</option>
            <option value="matte">Матовая</option>
            <option value="glossy">Глянцевая</option>
          </select>
        </div>
        )}

        {/* Материал (material_id) - если есть в схеме */}
        {hasField('material_id') && (() => {
          const materialField = schema?.fields?.find((f: any) => f.name === 'material_id');
          if (!materialField || !Array.isArray(materialField.enum) || materialField.enum.length === 0) {
            return null;
          }

          const isObjectEnum = typeof materialField.enum[0] === 'object' && materialField.enum[0] !== null;
          const value = specs.material_id;

          return (
            <div className="param-group">
              <label>
                {materialField.label || 'Материал'}
                {materialField.required && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
              </label>
              <select
                value={value ? String(value) : ''}
                onChange={(e) => {
                  const newValue = e.target.value ? Number(e.target.value) : undefined;
                  updateSpecs({ material_id: newValue }, true);
                }}
                className="form-control"
                required={materialField.required}
              >
                <option value="">-- Выберите --</option>
                {(() => {
                  // Группируем материалы по типам бумаги
                  if (isObjectEnum) {
                    const grouped = new Map<string, any[]>();
                    
                    materialField.enum.forEach((opt: any) => {
                      const label = opt.label || String(opt.value);
                      let groupName = 'Другие';
                      
                      // Определяем группу по ключевым словам в названии
                      if (label.includes('matt') || label.toLowerCase().includes('полумат')) {
                        groupName = '📄 Полуматовая';
                      } else if (label.includes('gloss') || label.toLowerCase().includes('мелованн') || label.toLowerCase().includes('глянц')) {
                        groupName = '✨ Мелованная';
                      } else if (label.toLowerCase().includes('дизайнерск')) {
                        groupName = '🎨 Дизайнерская';
                      } else if (label.toLowerCase().includes('офсет')) {
                        groupName = '📋 Офсетная';
                      } else if (label.toLowerCase().includes('крафт')) {
                        groupName = '📦 Крафт';
                      } else if (label.toLowerCase().includes('самоклей')) {
                        groupName = '🏷️ Самоклеящаяся';
                      }
                      
                      if (!grouped.has(groupName)) {
                        grouped.set(groupName, []);
                      }
                      grouped.get(groupName)!.push(opt);
                    });
                    
                    // Рендерим с группировкой через optgroup
                    return Array.from(grouped.entries()).map(([groupName, opts]) => (
                      <optgroup key={groupName} label={groupName}>
                        {opts.map((opt: any) => {
                          const optValue = opt.value;
                          const optLabel = opt.label;
                          
                          return (
                            <option key={String(optValue)} value={String(optValue)}>
                              {optLabel}
                            </option>
                          );
                        })}
                      </optgroup>
                    ));
                  }
                  
                  // Обычный рендеринг
                  return materialField.enum.map((opt: any) => {
                    const optValue = isObjectEnum ? opt.value : opt;
                    const optLabel = isObjectEnum ? opt.label : opt;
                    
                    return (
                      <option key={String(optValue)} value={String(optValue)}>
                        {optLabel}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          );
        })()}
      </div>

      {/* Информация о доступности и стоимости материалов */}
      {specs.paperType && specs.paperDensity && specs.quantity > 0 && (
        <div className="material-info-section">
          <h4>📊 Информация о материалах</h4>
          
          {/* Статус проверки доступности */}
          {isCheckingAvailability && (
            <div className="alert alert-info">
              <small>🔄 Проверяем доступность материалов...</small>
            </div>
          )}

          {/* Результат проверки доступности */}
          {materialAvailability && !isCheckingAvailability && (
            <div className={`alert ${materialAvailability.available ? 'alert-success' : 'alert-warning'}`}>
              <div className="material-availability">
                <div className="availability-status">
                  <span className="status-icon">
                    {materialAvailability.available ? '✅' : '⚠️'}
                  </span>
                  <span className="status-text">
                    {materialAvailability.available ? 'Материал доступен' : 'Материал недоступен'}
                  </span>
                </div>
                <div className="availability-details">
                  <small>
                    Доступно: {materialAvailability.available_quantity} листов
                    {materialAvailability.message && (
                      <br />
                    )}
                    {materialAvailability.message}
                  </small>
                </div>
              </div>
            </div>
          )}

          {/* Стоимость материалов */}
          {materialCost && materialCost.material_cost != null && materialCost.price_per_sheet != null && (
            <div className="material-cost-info">
              <div className="cost-breakdown">
                <div className="cost-item">
                  <span className="cost-label">Цена за лист:</span>
                  <span className="cost-value">{materialCost.price_per_sheet.toFixed(2)} BYN</span>
                </div>
                <div className="cost-item">
                  <span className="cost-label">Требуется листов:</span>
                  <span className="cost-value">{materialCost.sheets_needed ?? 0} шт</span>
                </div>
                <div className="cost-item total">
                  <span className="cost-label">Стоимость материалов:</span>
                  <span className="cost-value">{materialCost.material_cost.toFixed(2)} BYN</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialsSection;


