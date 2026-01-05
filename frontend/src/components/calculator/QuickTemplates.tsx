import React, { useState, useCallback } from 'react';
import { ProductSpecs } from '../../types';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import './QuickTemplates.css';

interface QuickTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  specs: Partial<ProductSpecs>;
  category: string;
  popularity: number;
}

interface QuickTemplatesProps {
  onApplyTemplate: (specs: Partial<ProductSpecs>) => void;
  onClose: () => void;
}

export const QuickTemplates: React.FC<QuickTemplatesProps> = ({
  onApplyTemplate,
  onClose
}) => {
  const logger = useLogger('QuickTemplates');
  const toast = useToastNotifications();
  
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Предустановленные шаблоны
  const templates: QuickTemplate[] = [
    // Популярные заказы
    {
      id: 'flyers_a6_1000',
      name: 'Листовки A6, 1000 шт',
      description: 'Стандартные листовки для рекламы',
      icon: '📄',
      category: 'popular',
      popularity: 95,
      specs: {
        productType: 'flyers',
        format: 'A6',
        quantity: 1000,
        sides: 2,
        paperType: 'semi-matte',
        paperDensity: 130,
        lamination: 'none',
        priceType: 'standard',
        customerType: 'regular'
      }
    },
    {
      id: 'business_cards_500',
      name: 'Визитки, 500 шт',
      description: 'Стандартные визитки с ламинацией',
      icon: '💳',
      category: 'popular',
      popularity: 90,
      specs: {
        productType: 'business_cards',
        format: 'стандартные',
        quantity: 500,
        sides: 2,
        paperType: 'semi-matte',
        paperDensity: 300,
        lamination: 'matte',
        priceType: 'standard',
        customerType: 'regular'
      }
    },
    {
      id: 'booklets_a4_8pages',
      name: 'Буклет A4, 8 стр',
      description: 'Рекламный буклет с фальцовкой',
      icon: '📖',
      category: 'popular',
      popularity: 85,
      specs: {
        productType: 'booklets',
        format: 'A4',
        quantity: 1000,
        sides: 2,
        paperType: 'semi-matte',
        paperDensity: 150,
        lamination: 'matte',
        priceType: 'standard',
        customerType: 'regular',
        pages: 8,
        folding: true
      }
    },
    {
      id: 'posters_a3_100',
      name: 'Постер A3, 100 шт',
      description: 'Рекламные постеры',
      icon: '🖼️',
      category: 'popular',
      popularity: 80,
      specs: {
        productType: 'posters',
        format: 'A3',
        quantity: 100,
        sides: 1,
        paperType: 'semi-matte',
        paperDensity: 200,
        lamination: 'none',
        priceType: 'standard',
        customerType: 'regular',
        cutting: true
      }
    },

    // Срочные заказы
    {
      id: 'urgent_flyers',
      name: 'Срочные листовки',
      description: 'Листовки с ускоренным производством',
      icon: '⚡',
      category: 'urgent',
      popularity: 75,
      specs: {
        productType: 'flyers',
        format: 'A6',
        quantity: 500,
        sides: 1,
        paperType: 'semi-matte',
        paperDensity: 130,
        lamination: 'none',
        priceType: 'urgent',
        customerType: 'regular'
      }
    },
    {
      id: 'express_business_cards',
      name: 'Экспресс визитки',
      description: 'Визитки за 1 день',
      icon: '🚀',
      category: 'urgent',
      popularity: 70,
      specs: {
        productType: 'business_cards',
        format: 'стандартные',
        quantity: 100,
        sides: 2,
        paperType: 'semi-matte',
        paperDensity: 300,
        lamination: 'none',
        priceType: 'express',
        customerType: 'regular'
      }
    },

    // VIP заказы
    {
      id: 'vip_brochures',
      name: 'VIP брошюры',
      description: 'Премиум брошюры для VIP клиентов',
      icon: '👑',
      category: 'vip',
      popularity: 65,
      specs: {
        productType: 'brochures',
        format: 'A4',
        quantity: 500,
        sides: 2,
        paperType: 'coated',
        paperDensity: 200,
        lamination: 'glossy',
        priceType: 'standard',
        customerType: 'vip',
        pages: 16,
        folding: true
      }
    },
    {
      id: 'premium_calendars',
      name: 'Премиум календари',
      description: 'Настенные календари высокого качества',
      icon: '📅',
      category: 'vip',
      popularity: 60,
      specs: {
        productType: 'calendars',
        format: 'A3',
        quantity: 100,
        sides: 2,
        paperType: 'coated',
        paperDensity: 250,
        lamination: 'glossy',
        priceType: 'standard',
        customerType: 'vip',
        cutting: true
      }
    },

    // Промо акции
    {
      id: 'promo_stickers',
      name: 'Промо наклейки',
      description: 'Наклейки по акционной цене',
      icon: '🏷️',
      category: 'promo',
      popularity: 85,
      specs: {
        productType: 'stickers',
        format: '58x40',
        quantity: 2000,
        sides: 1,
        paperType: 'self-adhesive',
        paperDensity: 130,
        lamination: 'none',
        priceType: 'promo',
        customerType: 'regular',
        cutting: true
      }
    },
    {
      id: 'discount_flyers',
      name: 'Акционные листовки',
      description: 'Листовки со скидкой',
      icon: '💰',
      category: 'promo',
      popularity: 80,
      specs: {
        productType: 'flyers',
        format: 'A5',
        quantity: 2000,
        sides: 2,
        paperType: 'semi-matte',
        paperDensity: 130,
        lamination: 'none',
        priceType: 'promo',
        customerType: 'regular'
      }
    },

    // Специализированные
    {
      id: 'magnetic_cards',
      name: 'Магнитные визитки',
      description: 'Визитки с магнитной основой',
      icon: '🧲',
      category: 'specialty',
      popularity: 70,
      specs: {
        productType: 'magnetic_cards',
        format: '90x50',
        quantity: 200,
        sides: 2,
        paperType: 'magnetic',
        paperDensity: 300,
        lamination: 'matte',
        priceType: 'standard',
        customerType: 'regular',
        magnetic: true,
        cutting: true
      }
    },
    {
      id: 'wedding_invitations',
      name: 'Свадебные приглашения',
      description: 'Элегантные приглашения на свадьбу',
      icon: '💒',
      category: 'specialty',
      popularity: 75,
      specs: {
        productType: 'wedding_invitations',
        format: 'A6',
        quantity: 100,
        sides: 2,
        paperType: 'coated',
        paperDensity: 250,
        lamination: 'matte',
        priceType: 'standard',
        customerType: 'regular',
        folding: true
      }
    }
  ];

  // Категории шаблонов
  const categories = [
    { id: 'all', name: 'Все шаблоны', icon: '📦' },
    { id: 'popular', name: 'Популярные', icon: '⭐' },
    { id: 'urgent', name: 'Срочные', icon: '⚡' },
    { id: 'vip', name: 'VIP', icon: '👑' },
    { id: 'promo', name: 'Промо', icon: '💰' },
    { id: 'specialty', name: 'Специальные', icon: '🎯' }
  ];

  // Фильтрация шаблонов
  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Обработка применения шаблона
  const handleApplyTemplate = useCallback((template: QuickTemplate) => {
    logger.info('Применен шаблон', { templateId: template.id, templateName: template.name });
    onApplyTemplate(template.specs);
    toast.success(`Шаблон "${template.name}" применен!`);
    onClose();
  }, [onApplyTemplate, onClose, logger, toast]);

  // Обработка поиска
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // Обработка смены категории
  const handleCategoryChange = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
  }, []);

  return (
    <div className="quick-templates">
      {/* Заголовок */}
      <div className="templates-header">
        <div className="header-content">
          <h2>⚡ Быстрые шаблоны</h2>
          <p>Выберите готовый шаблон для быстрого расчета</p>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {/* Панель управления */}
      <div className="templates-controls">
        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Поиск шаблонов..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="search-input"
            />
            <div className="search-icon">🔍</div>
          </div>
        </div>

        <div className="categories-container">
          {categories.map(category => (
            <button
              key={category.id}
              className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryChange(category.id)}
            >
              <span className="category-icon">{category.icon}</span>
              <span className="category-name">{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Список шаблонов */}
      <div className="templates-container">
        {filteredTemplates.length === 0 ? (
          <div className="no-templates">
            <div className="no-templates-icon">🔍</div>
            <h3>Шаблоны не найдены</h3>
            <p>Попробуйте изменить поисковый запрос или категорию</p>
          </div>
        ) : (
          <div className="templates-grid">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="template-card"
                onClick={() => handleApplyTemplate(template)}
              >
                <div className="template-header">
                  <div className="template-icon">{template.icon}</div>
                  <div className="template-popularity">
                    <span className="popularity-label">Популярность:</span>
                    <div className="popularity-bar">
                      <div 
                        className="popularity-fill"
                        style={{ width: `${template.popularity}%` }}
                      ></div>
                    </div>
                    <span className="popularity-value">{template.popularity}%</span>
                  </div>
                </div>
                
                <div className="template-content">
                  <h3 className="template-name">{template.name}</h3>
                  <p className="template-description">{template.description}</p>
                  
                  <div className="template-specs">
                    <div className="spec-item">
                      <span className="spec-label">Тип:</span>
                      <span className="spec-value">{getProductTypeName(template.specs.productType!)}</span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">Формат:</span>
                      <span className="spec-value">{template.specs.format}</span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">Количество:</span>
                      <span className="spec-value">{template.specs.quantity?.toLocaleString()} шт</span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">Материал:</span>
                      <span className="spec-value">{getPaperTypeName(template.specs.paperType!)} {template.specs.paperDensity}г/м²</span>
                    </div>
                    {template.specs.lamination && template.specs.lamination !== 'none' && (
                      <div className="spec-item">
                        <span className="spec-label">Ламинация:</span>
                        <span className="spec-value">{getLaminationName(template.specs.lamination)}</span>
                      </div>
                    )}
                    <div className="spec-item">
                      <span className="spec-label">Срок:</span>
                      <span className="spec-value">{getPriceTypeName(template.specs.priceType!)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="template-actions">
                  <button className="apply-btn">
                    Применить шаблон →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Статистика */}
      <div className="templates-footer">
        <div className="templates-count">
          Показано: {filteredTemplates.length} из {templates.length} шаблонов
        </div>
        <div className="category-info">
          {selectedCategory !== 'all' && (
            <span>
              Категория: {categories.find(cat => cat.id === selectedCategory)?.name}
            </span>
          )}
        </div>
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
    'calendars': 'Календари',
    'magnetic_cards': 'Магнитные визитки',
    'wedding_invitations': 'Свадебные приглашения'
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
    'matte': 'Матовая',
    'glossy': 'Глянцевая'
  };
  return names[lamination] || lamination;
};

const getPriceTypeName = (priceType: string): string => {
  const names: Record<string, string> = {
    'standard': 'Стандартный',
    'urgent': 'Срочно',
    'express': 'Экспресс',
    'promo': 'Промо'
  };
  return names[priceType] || priceType;
};
