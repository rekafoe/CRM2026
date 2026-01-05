import React, { useState, useCallback, useMemo } from 'react';
import { ProductSpecs, CalculationResult } from '../../types';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import './ComparisonModal.css';

interface ComparisonItem {
  id: string;
  name: string;
  specs: ProductSpecs;
  result: CalculationResult;
  isSelected: boolean;
}

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVariant: (specs: ProductSpecs) => void;
  initialItems?: ComparisonItem[];
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  isOpen,
  onClose,
  onSelectVariant,
  initialItems = []
}) => {
  const logger = useLogger('ComparisonModal');
  const toast = useToastNotifications();
  
  const [items, setItems] = useState<ComparisonItem[]>(initialItems);
  const [sortBy, setSortBy] = useState<'price' | 'quantity' | 'name'>('price');
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);

  // Сортировка элементов
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return a.result.totalCost - b.result.totalCost;
        case 'quantity':
          return a.specs.quantity - b.specs.quantity;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
    return sorted;
  }, [items, sortBy]);

  // Фильтрация различий
  const filteredItems = useMemo(() => {
    if (!showOnlyDifferences) return sortedItems;
    
    // Находим общие значения для каждого параметра
    const commonValues: Record<string, any> = {};
    const allKeys = new Set<string>();
    
    items.forEach(item => {
      Object.entries(item.specs).forEach(([key, value]) => {
        allKeys.add(key);
        if (commonValues[key] === undefined) {
          commonValues[key] = value;
        } else if (commonValues[key] !== value) {
          commonValues[key] = 'DIFFERENT';
        }
      });
    });
    
    // Фильтруем элементы, которые отличаются от общих значений
    return sortedItems.filter(item => {
      return Object.entries(item.specs).some(([key, value]) => 
        commonValues[key] === 'DIFFERENT' || commonValues[key] !== value
      );
    });
  }, [sortedItems, showOnlyDifferences, items]);

  // Обработка выбора варианта
  const handleSelectVariant = useCallback((item: ComparisonItem) => {
    logger.info('Выбран вариант для сравнения', { itemId: item.id, itemName: item.name });
    onSelectVariant(item.specs);
    toast.success(`Вариант "${item.name}" выбран!`);
    onClose();
  }, [onSelectVariant, onClose, logger, toast]);

  // Обработка удаления элемента
  const handleRemoveItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemId));
    logger.info('Элемент удален из сравнения', { itemId });
  }, [logger]);

  // Обработка смены сортировки
  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as 'price' | 'quantity' | 'name');
  }, []);

  // Обработка переключения фильтра различий
  const handleDifferencesToggle = useCallback(() => {
    setShowOnlyDifferences(prev => !prev);
  }, []);

  // Очистка всех элементов
  const handleClearAll = useCallback(() => {
    setItems([]);
    logger.info('Все элементы удалены из сравнения');
  }, [logger]);

  if (!isOpen) return null;

  return (
    <div className="comparison-modal-overlay" onClick={onClose}>
      <div className="comparison-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="comparison-header">
          <div className="header-content">
            <h2>⚖️ Сравнение вариантов</h2>
            <p>Сравните разные варианты расчета и выберите лучший</p>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Панель управления */}
        <div className="comparison-controls">
          <div className="controls-left">
            <div className="control-group">
              <label>Сортировка:</label>
              <select
                value={sortBy}
                onChange={handleSortChange}
                className="control-select"
              >
                <option value="price">По цене</option>
                <option value="quantity">По количеству</option>
                <option value="name">По названию</option>
              </select>
            </div>
            
            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={showOnlyDifferences}
                  onChange={handleDifferencesToggle}
                />
                Показать только различия
              </label>
            </div>
          </div>
          
          <div className="controls-right">
            <button 
              className="btn btn-outline"
              onClick={handleClearAll}
              disabled={items.length === 0}
            >
              🗑️ Очистить все
            </button>
          </div>
        </div>

        {/* Содержимое */}
        <div className="comparison-content">
          {filteredItems.length === 0 ? (
            <div className="no-items">
              <div className="no-items-icon">📊</div>
              <h3>Нет элементов для сравнения</h3>
              <p>Добавьте несколько вариантов расчета для сравнения</p>
            </div>
          ) : (
            <div className="comparison-table">
              {/* Заголовок таблицы */}
              <div className="table-header">
                <div className="header-cell name">Название</div>
                <div className="header-cell format">Формат</div>
                <div className="header-cell quantity">Количество</div>
                <div className="header-cell material">Материал</div>
                <div className="header-cell lamination">Ламинация</div>
                <div className="header-cell price">Цена за шт</div>
                <div className="header-cell total">Общая стоимость</div>
                <div className="header-cell actions">Действия</div>
              </div>

              {/* Строки таблицы */}
              {filteredItems.map((item, index) => (
                <div key={item.id} className={`table-row ${index % 2 === 0 ? 'even' : 'odd'}`}>
                  <div className="table-cell name">
                    <div className="item-name">{item.name}</div>
                    <div className="item-type">{getProductTypeName(item.specs.productType)}</div>
                  </div>
                  
                  <div className="table-cell format">
                    {item.specs.format}
                  </div>
                  
                  <div className="table-cell quantity">
                    {item.specs.quantity.toLocaleString()} шт
                  </div>
                  
                  <div className="table-cell material">
                    <div className="material-info">
                      <div className="material-type">{getPaperTypeName(item.specs.paperType)}</div>
                      <div className="material-density">{item.specs.paperDensity}г/м²</div>
                    </div>
                  </div>
                  
                  <div className="table-cell lamination">
                    {getLaminationName(item.specs.lamination)}
                  </div>
                  
                  <div className="table-cell price">
                    <div className="price-value">
                      {item.result.pricePerItem.toFixed(2)} BYN
                    </div>
                  </div>
                  
                  <div className="table-cell total">
                    <div className="total-value">
                      {item.result.totalCost.toFixed(2)} BYN
                    </div>
                    <div className="total-savings">
                      {index > 0 && (
                        <span className={`savings ${item.result.totalCost < filteredItems[0].result.totalCost ? 'positive' : 'negative'}`}>
                          {item.result.totalCost < filteredItems[0].result.totalCost ? '↓' : '↑'} 
                          {Math.abs(item.result.totalCost - filteredItems[0].result.totalCost).toFixed(2)} BYN
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="table-cell actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSelectVariant(item)}
                    >
                      Выбрать
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Статистика */}
        {filteredItems.length > 0 && (
          <div className="comparison-stats">
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-label">Вариантов:</div>
                <div className="stat-value">{filteredItems.length}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Самый дешевый:</div>
                <div className="stat-value">
                  {Math.min(...filteredItems.map(item => item.result.totalCost)).toFixed(2)} BYN
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Самый дорогой:</div>
                <div className="stat-value">
                  {Math.max(...filteredItems.map(item => item.result.totalCost)).toFixed(2)} BYN
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Разница:</div>
                <div className="stat-value">
                  {(Math.max(...filteredItems.map(item => item.result.totalCost)) - 
                    Math.min(...filteredItems.map(item => item.result.totalCost))).toFixed(2)} BYN
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Вспомогательные функции
const getProductTypeName = (productType: string): string => {
  const names: Record<string, string> = {
    'flyers': 'Листовки',
    'business_cards': 'Визитки',
    'booklets': 'Буклеты',
    'posters': 'Постеры',
    'brochures': 'Брошюры',
    'stickers': 'Наклейки',
    'labels': 'Этикетки',
    'calendars': 'Календари'
  };
  return names[productType] || productType;
};

const getPaperTypeName = (paperType: string): string => {
  const names: Record<string, string> = {
    'semi-matte': 'Полуматовая',
    'glossy': 'Глянцевая',
    'coated': 'Мелованная',
    'self-adhesive': 'Самоклеющаяся',
    'magnetic': 'Магнитная'
  };
  return names[paperType] || paperType;
};

const getLaminationName = (lamination: string): string => {
  const names: Record<string, string> = {
    'none': 'Без ламинации',
    'matte': 'Матовая',
    'glossy': 'Глянцевая'
  };
  return names[lamination] || lamination;
};
