/**
 * ДИНАМИЧЕСКИЙ СЕЛЕКТОР ПРОДУКТОВ
 * 
 * Загружает продукты из базы данных:
 * - Категории продуктов
 * - Продукты по категориям
 * - Поиск по названию
 * - Фильтрация активных продуктов
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useProducts } from '../../../hooks/useProducts';
import { Product, ProductCategory } from '../../../services/products';
import { useDebounce } from '../../../hooks/useDebounce';
import { useLogger } from '../../../utils/logger';
import { useToastNotifications } from '../../Toast';
import { AppIcon } from '../../ui/AppIcon';
import { getProductIconName } from '../utils/productIcons';

export const CUSTOM_PRODUCT_ID = -1000;
export const POSTPRINT_PRODUCT_ID = -1001;

const customProduct: Product = {
  id: CUSTOM_PRODUCT_ID,
  category_id: 0,
  name: 'Произвольный продукт',
  description: 'Свободная форма без ограничений',
  icon: 'edit',
  calculator_type: 'simplified',
  product_type: 'universal',
  operator_percent: 10,
  is_active: true,
  created_at: '',
  updated_at: '',
  category_name: 'Произвольное',
  category_icon: 'folder',
};

const postprintProduct: Product = {
  id: POSTPRINT_PRODUCT_ID,
  category_id: 0,
  name: 'Послепечатные услуги',
  description: 'Выбор операций и количества',
  icon: 'wrench',
  calculator_type: 'simplified',
  product_type: 'universal',
  operator_percent: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  category_name: 'Услуги',
  category_icon: 'puzzle',
};

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
  const searchRequestIdRef = useRef(0);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Сброс результатов при очистке поля (мгновенно)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Поиск при изменении debounced-запроса (только debouncedSearchQuery — иначе бесконечный цикл из-за searchProducts/logger/toast)
  useEffect(() => {
    const query = debouncedSearchQuery.trim();
    if (!query) {
      setIsSearching(false);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    searchProducts(query)
      .then((results) => {
        if (requestId === searchRequestIdRef.current) {
          setSearchResults(results);
          logger.info('Поиск выполнен', { query, resultsCount: results.length });
        }
      })
      .catch((error) => {
        if (requestId === searchRequestIdRef.current) {
          logger.error('Ошибка поиска', error);
          toast.error('Ошибка поиска продуктов');
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только debouncedSearchQuery, иначе бесконечные запросы
  }, [debouncedSearchQuery]);

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
  const hasFilteredProducts = filteredProducts.length > 0;

  // Обработка выбора категории
  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategoryId(categoryId);
    setSearchQuery('');
    setSearchResults([]);
    loadProductsByCategory(categoryId);
    logger.info('Выбрана категория', { categoryId });
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

  // Иконка категории: folder по умолчанию
  const getCategoryIconName = (category: ProductCategory): 'folder' | 'package' | 'clipboard' => {
    const icon = category.icon;
    if (icon === 'package' || icon === 'folder' || icon === 'clipboard') return icon;
    return 'folder';
  };

  // Иконка продукта: image_url или AppIcon по имени
  const renderProductIcon = (product: Product) => {
    if (product.image_url) {
      return <img src={product.image_url} alt="" />;
    }
    const iconName = (product.icon && ['package', 'folder', 'clipboard', 'wrench', 'edit', 'puzzle'].includes(product.icon))
      ? product.icon as 'package' | 'folder' | 'clipboard' | 'wrench' | 'edit' | 'puzzle'
      : getProductIconName((product as any).resolvedProductType || product.product_type || 'package');
    return <AppIcon name={iconName} size="lg" />;
  };

  const getProductCategoryIconName = (product: Product): 'folder' | 'package' | 'puzzle' => {
    const icon = product.category_icon;
    if (icon === 'package' || icon === 'folder' || icon === 'puzzle') return icon;
    return 'folder';
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
          <h2><AppIcon name="package" size="md" /> Выбор продукта</h2>
          <p>Выберите тип продукта для расчета стоимости</p>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <AppIcon name="x" size="sm" />
          </button>
        </div>

        {/* Поиск */}
        <div className="selector-search">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="Поиск по названию продукта..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              autoFocus
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
                  <span className="category-icon"><AppIcon name={getCategoryIconName(category)} size="sm" /></span>
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
            <p><AppIcon name="x" size="xs" /> {categoriesError}</p>
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
            <p><AppIcon name="x" size="xs" /> {productsError}</p>
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

            {!hasFilteredProducts && searchQuery ? (
              <div className="products-empty-note">
                Другие продукты не найдены, можно выбрать произвольный продукт.
              </div>
            ) : null}
            {!hasFilteredProducts && !searchQuery ? (
              <div className="products-empty-note">
                Пока нет других продуктов — можно выбрать произвольный продукт.
              </div>
            ) : null}

            <div className="products-grid">
              <div
                className={`product-card custom-product-card ${isProductSelected(postprintProduct) ? 'selected' : ''}`}
                onClick={() => handleProductSelect(postprintProduct)}
              >
                <div className="product-icon">{renderProductIcon(postprintProduct)}</div>
                <div className="product-info">
                  <h4 className="product-name">{postprintProduct.name}</h4>
                  <p className="product-description">{postprintProduct.description}</p>
                  <div className="product-category">
                    <span className="category-badge">
                      <AppIcon name={getProductCategoryIconName(postprintProduct)} size="xs" /> {postprintProduct.category_name}
                    </span>
                  </div>
                </div>
                {isProductSelected(postprintProduct) && (
                  <div className="selected-indicator">
                    <AppIcon name="check" size="sm" />
                  </div>
                )}
              </div>
              <div
                className={`product-card custom-product-card ${isProductSelected(customProduct) ? 'selected' : ''}`}
                onClick={() => handleProductSelect(customProduct)}
              >
                <div className="product-icon">{renderProductIcon(customProduct)}</div>
                <div className="product-info">
                  <h4 className="product-name">{customProduct.name}</h4>
                  <p className="product-description">{customProduct.description}</p>
                  <div className="product-category">
                    <span className="category-badge">
                      <AppIcon name={getProductCategoryIconName(customProduct)} size="xs" /> {customProduct.category_name}
                    </span>
                  </div>
                </div>
                {isProductSelected(customProduct) && (
                  <div className="selected-indicator">
                    <AppIcon name="check" size="sm" />
                  </div>
                )}
              </div>
              {Array.isArray(filteredProducts) && filteredProducts.map(product => (
                <div
                  key={product.id}
                  className={`product-card ${isProductSelected(product) ? 'selected' : ''}`}
                  onClick={() => handleProductSelect(product)}
                >
                  <div className="product-icon">
                    {renderProductIcon(product)}
                  </div>
                  <div className="product-info">
                    <h4 className="product-name">{product.name}</h4>
                    <p className="product-description">
                      {product.description || 'Описание отсутствует'}
                    </p>
                    <div className="product-category">
                      <span className="category-badge">
                        <AppIcon name={getProductCategoryIconName(product)} size="xs" /> {product.category_name}
                      </span>
                    </div>
                  </div>
                  {isProductSelected(product) && (
                    <div className="selected-indicator">
                      <AppIcon name="check" size="sm" />
                    </div>
                  )}
                </div>
              ))}
            </div>
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
