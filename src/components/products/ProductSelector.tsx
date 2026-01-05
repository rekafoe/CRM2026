import React, { useState, useEffect } from 'react';
import { Product, ProductCategory } from '../../../../shared/types/products';
import { api } from '../../api';
import './ProductSelector.css';

interface ProductSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
}

const ProductSelector: React.FC<ProductSelectorProps> = ({
  isOpen,
  onClose,
  onSelectProduct
}) => {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadProducts();
    }
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      const response = await api.get('/products/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategory(selectedCategory === categoryId ? null : categoryId);
  };

  const handleProductSelect = (product: Product) => {
    onSelectProduct(product);
    onClose();
  };

  const filteredProducts = products.filter(product => {
    const matchesCategory = !selectedCategory || product.category_id === selectedCategory;
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="product-selector-overlay">
      <div className="product-selector-modal">
        <div className="product-selector-header">
          <h2>Выберите продукт</h2>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="product-selector-content">
          {/* Поиск */}
          <div className="search-section">
            <input
              type="text"
              placeholder="Поиск продуктов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Категории */}
          <div className="categories-section">
            <h3>Категории</h3>
            <div className="categories-grid">
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`category-card ${selectedCategory === category.id ? 'selected' : ''}`}
                  onClick={() => handleCategorySelect(category.id)}
                >
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Продукты */}
          <div className="products-section">
            <h3>Продукты</h3>
            {loading ? (
              <div className="loading">Загрузка...</div>
            ) : (
              <div className="products-grid">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    className="product-card"
                    onClick={() => handleProductSelect(product)}
                  >
                    <div className="product-icon">{product.icon}</div>
                    <div className="product-info">
                      <h4 className="product-name">{product.name}</h4>
                      {product.description && (
                        <p className="product-description">{product.description}</p>
                      )}
                      <span className="product-category">{product.category?.name || ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductSelector;
