import React, { useEffect, useState, useCallback } from 'react';
import type { ProductSpecs } from './types/calculator.types';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { Alert } from '../common';
import { api } from '../../api';
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
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    api.get<QuickTemplate[]>('/quick-templates')
      .then((res) => {
        if (!mounted) return;
        setTemplates(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        if (!mounted) return;
        logger.error('Ошибка загрузки быстрых шаблонов', err);
        setErrorMessage('Не удалось загрузить быстрые шаблоны');
        setTemplates([]);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [logger]);

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

      {errorMessage && (
        <Alert type="error" className="mb-4" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

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
        {isLoading ? (
          <div className="users-loading">Загрузка шаблонов...</div>
        ) : filteredTemplates.length === 0 ? (
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
