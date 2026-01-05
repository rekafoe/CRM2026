/**
 * ДИНАМИЧЕСКИЙ СЕЛЕКТОР ПРОДУКТОВ
 * 
 * Загружает продукты из базы данных:
 * - Категории продуктов
 * - Продукты по категориям
 * - Поиск по названию
 * - Фильтрация активных продуктов
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useProducts } from '../../../hooks/useProducts';
import { Product, ProductCategory } from '../../../services/products';
import { useLogger } from '../../../utils/logger';
import { useToastNotifications } from '../../Toast';

interface DynamicProductSelectorProps {
  onSelectProduct: (product: Product) => void;
  onClose: () => void;
  selectedProductId?: number;
}

export const DynamicProductSelector: React.FC<DynamicProductSelectorProps> = ({
  onSelectProduct,
  onClose,
  selectedProductId
}) => {
  const logger = useLogger('DynamicProductSelector');
  const toast = useToastNotifications();
  
  const {
    categories = [],
    products = [],
    loadingCategories,
    loadingProducts,
    categoriesError,
    productsError,
    loadProductsByCategory,
    searchProducts,
    getProductsByCategoryId,
    getProductById
  } = useProducts();

  // Локальные состояния
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Фильтрованные продукты
  const filteredProducts = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults;
    }
    
    if (selectedCategoryId) {
      return getProductsByCategoryId(selectedCategoryId);
    }
    
    return products;
  }, [searchQuery, searchResults, selectedCategoryId, getProductsByCategoryId, products]);

  // Обработка выбора категории
  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategoryId(categoryId);
    setSearchQuery('');
    setSearchResults([]);
    loadProductsByCategory(categoryId);
    logger.info('Выбрана категория', { categoryId });
  };

  // Обработка поиска
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.trim()) {
      setIsSearching(true);
      try {
        const results = await searchProducts(query);
        setSearchResults(results);
        logger.info('Поиск выполнен', { query, resultsCount: results.length });
      } catch (error) {
        logger.error('Ошибка поиска', error);
        toast.error('Ошибка поиска продуктов');
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  // Обработка выбора продукта
  const handleProductSelect = (product: Product) => {
    onSelectProduct(product);
    logger.info('Выбран продукт', { productId: product.id, productName: product.name });
  };

  // Обработка сброса фильтров
  const handleClearFilters = () => {
    setSelectedCategoryId(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Получение иконки категории
  const getCategoryIcon = (category: ProductCategory) => {
    return category.icon || '📦';
  };

  // Получение иконки продукта
  const getProductIcon = (product: Product) => {
    return product.icon || '📄';
  };

  // Получение иконки категории продукта
  const getProductCategoryIcon = (product: Product) => {
    return product.category_icon || '📦';
  };

  // Проверка, выбран ли продукт
  const isProductSelected = (product: Product) => {
    return selectedProductId === product.id;
  };

  return (
    <div className="dynamic-product-selector-overlay">
      <div className="dynamic-product-selector">
        {/* Заголовок */}
        <div className="selector-header">
          <h2>🛍️ Выбор продукта</h2>
          <p>Выберите тип продукта для расчета стоимости</p>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Поиск */}
        <div className="selector-search">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="Поиск по названию продукта..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {isSearching && (
              <div className="search-loading">
                <div className="spinner"></div>
              </div>
            )}
          </div>
        </div>

        {/* Фильтры */}
        <div className="selector-filters">
          <div className="filter-section">
            <h3>Категории</h3>
            <div className="category-buttons">
              <button
                className={`category-button ${selectedCategoryId === null ? 'active' : ''}`}
                onClick={handleClearFilters}
              >
                Все категории
              </button>
              {Array.isArray(categories) && categories.map(category => (
                <button
                  key={category.id}
                  className={`category-button ${selectedCategoryId === category.id ? 'active' : ''}`}
                  onClick={() => handleCategorySelect(category.id)}
                  disabled={loadingCategories}
                >
                  <span className="category-icon">{getCategoryIcon(category)}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Состояния загрузки и ошибок */}
        {loadingCategories && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Загрузка категорий...</p>
          </div>
        )}

        {categoriesError && (
          <div className="error-state">
            <p>❌ {categoriesError}</p>
          </div>
        )}

        {loadingProducts && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Загрузка продуктов...</p>
          </div>
        )}

        {productsError && (
          <div className="error-state">
            <p>❌ {productsError}</p>
          </div>
        )}

        {/* Список продуктов */}
        {!loadingCategories && !loadingProducts && !categoriesError && !productsError && (
          <div className="products-section">
            <div className="products-header">
              <h3>
                {searchQuery ? `Результаты поиска (${filteredProducts.length})` : 
                 selectedCategoryId ? `Продукты в категории (${filteredProducts.length})` :
                 `Все продукты (${filteredProducts.length})`}
              </h3>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <p>📭 Продукты не найдены</p>
                <p>Попробуйте изменить поисковый запрос или выбрать другую категорию</p>
              </div>
            ) : (
              <div className="products-grid">
                {Array.isArray(filteredProducts) && filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className={`product-card ${isProductSelected(product) ? 'selected' : ''}`}
                    onClick={() => handleProductSelect(product)}
                  >
                    <div className="product-icon">
                      {getProductIcon(product)}
                    </div>
                    <div className="product-info">
                      <h4 className="product-name">{product.name}</h4>
                      <p className="product-description">
                        {product.description || 'Описание отсутствует'}
                      </p>
                      <div className="product-category">
                        <span className="category-badge">
                          {getProductCategoryIcon(product)} {product.category_name}
                        </span>
                      </div>
                    </div>
                    {isProductSelected(product) && (
                      <div className="selected-indicator">
                        ✅
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Действия */}
        <div className="selector-actions">
          <button
            className="action-button secondary"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            className="action-button primary"
            onClick={onClose}
            disabled={!selectedProductId}
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );
};

export default DynamicProductSelector;
