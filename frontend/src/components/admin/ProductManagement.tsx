import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Product,
  deleteProduct,
  clearProductCache,
  updateProduct,
} from '../../services/products';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { useUIStore } from '../../stores/uiStore';
import { StatusBadge, LoadingState } from '../common';
import { AppIcon } from '../ui/AppIcon';
import { ProductCreateModal } from './ProductCreateModal';
import { ProductDuplicateModal, productCanBeDuplicated } from './ProductDuplicateModal';
import { ProductSetupStatus } from './ProductSetupStatus';
import { Modal } from '../common/Modal';
import { useProductManagementState } from './hooks/useProductManagementState';
import { CategoryManagementModal } from './CategoryManagementModal';
import { getAxiosErrorMessage } from '../../utils/errorUtils';
import './ProductManagement.css';

const ProductManagement: React.FC = () => {
  const navigate = useNavigate();
  const [showCategoryModal, setShowCategoryModal] = React.useState(false);
  const [duplicateSource, setDuplicateSource] = useState<Product | null>(null);
  const [togglingSiteProductId, setTogglingSiteProductId] = React.useState<number | null>(null);
  const categories = useProductDirectoryStore((state) => state.categories);
  const products = useProductDirectoryStore((state) => state.products);
  const directoryLoading = useProductDirectoryStore((state) => state.loading);
  const initializeDirectory = useProductDirectoryStore((state) => state.initialize);
  const fetchCategories = useProductDirectoryStore((state) => state.fetchCategories);
  const fetchProducts = useProductDirectoryStore((state) => state.fetchProducts);
  const toggleProductActiveInStore = useProductDirectoryStore((state) => state.toggleProductActive);
  const createProductInStore = useProductDirectoryStore((state) => state.createProduct);
  const getCategoryById = useProductDirectoryStore((state) => state.getCategoryById);

  const showToast = useUIStore((state) => state.showToast);

  // Используем хук для управления состоянием
  const {
    state,
    setQuery,
    setShowOnlyActive,
    setSelectedCategoryId,
    toggleSort,
    toggleProductSelection,
    setSelectedProducts,
    clearSelectedProducts,
    openCreateWizard,
    closeWizard,
    setSetupStatusModal,
    setDeletingProductId,
    setProductForm,
    resetProductForm,
  } = useProductManagementState();

  useEffect(() => {
    void initializeDirectory();
  }, [initializeDirectory]);

  const handleWizardClose = () => {
    closeWizard();
  };

  const toggleProductSite = async (product: Product) => {
    const next = !(product.active_for_site === true || product.active_for_site === 1);
    try {
      setTogglingSiteProductId(product.id);
      await updateProduct(product.id, { active_for_site: next ? 1 : 0 } as Partial<Product>);
      await fetchProducts(true);
      showToast(
        `Продукт «${product.name}» ${next ? 'показывается на сайте' : 'скрыт с сайта'}`,
        'success'
      );
    } catch (e) {
      showToast(getAxiosErrorMessage(e, 'Не удалось изменить видимость на сайте'), 'error');
    } finally {
      setTogglingSiteProductId(null);
    }
  };

  const toggleProductActive = async (product: Product) => {
    const updated = await toggleProductActiveInStore(product.id);
    if (updated) {
      showToast(
        `Продукт «${updated.name}» ${updated.is_active ? 'активирован' : 'скрыт'}`,
        'success'
      );
    } else {
      const latestError = useProductDirectoryStore.getState().errors.toggleProduct;
      if (latestError) {
        showToast(latestError, 'error');
      }
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    const confirmMessage = `Вы уверены, что хотите удалить продукт "${product.name}"?\n\nБудут удалены:\n- Материалы и привязки к складу\n- Операции (услуги печати по продукту)\n- Параметры калькулятора\n- Все шаблоны и конфигурации (в т.ч. упрощённый калькулятор)\n- Доп. услуги из каталога, привязанные к продукту\n- Чеклист настройки и связанные служебные записи\n\nЭто действие необратимо!`;
    
    if (!confirm(confirmMessage)) return;
    
    try {
      setDeletingProductId(product.id);
      await deleteProduct(product.id);
      clearProductCache(); // 🆕 Очищаем кэш перед обновлением
      await fetchProducts(true); // Обновляем список
      showToast(`Продукт «${product.name}» удален`, 'success');
    } catch (error: unknown) {
      console.error('Error deleting product:', error);
      showToast(
        getAxiosErrorMessage(error, 'Не удалось удалить продукт'),
        'error'
      );
    } finally {
      setDeletingProductId(null);
    }
  };

  const toggleSelectAll = () => {
    if (state.selectedProducts.size === filteredProducts.length) {
      clearSelectedProducts();
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleBulkActivate = async () => {
    if (state.selectedProducts.size === 0) return;
    
    for (const productId of state.selectedProducts) {
      const product = products.find(p => p.id === productId);
      if (product && !product.is_active) {
        await toggleProductActiveInStore(productId);
      }
    }
    clearSelectedProducts();
    showToast(`Активировано продуктов: ${state.selectedProducts.size}`, 'success');
  };

  const handleBulkDeactivate = async () => {
    if (state.selectedProducts.size === 0) return;
    
    for (const productId of state.selectedProducts) {
      const product = products.find(p => p.id === productId);
      if (product && product.is_active) {
        await toggleProductActiveInStore(productId);
      }
    }
    clearSelectedProducts();
    showToast(`Деактивировано продуктов: ${state.selectedProducts.size}`, 'success');
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await createProductInStore(state.productForm);
    if (created) {
      resetProductForm();
      showToast('Продукт создан', 'success');
    } else {
      const latestError = useProductDirectoryStore.getState().errors.createProduct;
      if (latestError) {
        showToast(latestError, 'error');
      }
    }
  };

  const handleWizardCreated = async (productId: number) => {
    await fetchProducts(true);
    handleWizardClose();
    showToast('Продукт создан', 'success');
    navigate(`/adminpanel/products/${productId}/template`);
  };

  const handleDuplicateCreated = async (productId: number) => {
    await fetchProducts(true);
    setDuplicateSource(null);
    showToast('Копия продукта создана', 'success');
    navigate(`/adminpanel/products/${productId}/template`);
  };

  const filteredProducts = useMemo(() => {
    const search = state.query.trim().toLowerCase();
    let filtered = products
      .filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search) ||
          (p.description || '').toLowerCase().includes(search),
      )
      .filter((p) => (!state.showOnlyActive ? true : p.is_active))
      .filter((p) => (!state.selectedCategoryId ? true : p.category_id === state.selectedCategoryId));

    // Сортировка
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (state.sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (state.sortField === 'category') {
        const catA = getCategoryById(a.category_id)?.name || '';
        const catB = getCategoryById(b.category_id)?.name || '';
        comparison = catA.localeCompare(catB);
      } else if (state.sortField === 'updated') {
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        comparison = dateA - dateB;
      }
      
      return state.sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [products, state.query, state.showOnlyActive, state.selectedCategoryId, state.sortField, state.sortDirection, getCategoryById]);

  const isDirectoryLoading =
    directoryLoading.initialize ||
    directoryLoading.products ||
    directoryLoading.categories;

  useEffect(() => {
    if (state.productForm.category_id || !categories.length) return;
    setProductForm({
      category_id: categories[0]?.id ?? 0,
    });
  }, [categories, state.productForm.category_id, setProductForm]);

  // Вычисляем статистику
  const stats = useMemo(() => {
    const activeCount = products.filter(p => p.is_active).length;
    const inactiveCount = products.length - activeCount;
    const categoriesWithProducts = new Set(products.map(p => p.category_id)).size;
    
    return {
      total: products.length,
      active: activeCount,
      inactive: inactiveCount,
      categories: categoriesWithProducts,
    };
  }, [products]);

  return (
    <div className="product-management">
      {/* Заголовок */}
      <div className="product-management__header">
        <div className="product-management__header-left">
          <button type="button" className="lg-btn" onClick={() => navigate('/adminpanel')}>
            ← Назад
          </button>
          <div className="product-management__title-row">
            <AppIcon name="puzzle" size="lg" circle />
            <div>
              <h1 className="product-management__title">Управление продуктами</h1>
              <p className="product-management__subtitle">Создание и настройка продуктов, категорий и параметров</p>
            </div>
          </div>
        </div>
        <div className="product-management__header-actions">
          <button type="button" className="lg-btn" onClick={() => setShowCategoryModal(true)}>
            <AppIcon name="folder" size="xs" /> Категории
          </button>
          <button type="button" className="lg-btn lg-btn--primary" onClick={() => openCreateWizard()}>
            <AppIcon name="plus" size="xs" /> Создать продукт
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="product-stats">
        <div className="product-stat-card">
          <div className="product-stat-card__header">
            <span className="product-stat-card__label">Всего продуктов</span>
            <span className="product-stat-card__icon"><AppIcon name="package" size="sm" /></span>
          </div>
          <div className="product-stat-card__value">{stats.total}</div>
          <div className="product-stat-card__trend product-stat-card__trend--neutral">
            В {stats.categories} категориях
          </div>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-card__header">
            <span className="product-stat-card__label">Активных</span>
            <span className="product-stat-card__icon"><AppIcon name="check" size="sm" /></span>
          </div>
          <div className="product-stat-card__value">{stats.active}</div>
          <div className="product-stat-card__trend">
            {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}% от всех
          </div>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-card__header">
            <span className="product-stat-card__label">Неактивных</span>
            <span className="product-stat-card__icon"><AppIcon name="ban" size="sm" /></span>
          </div>
          <div className="product-stat-card__value">{stats.inactive}</div>
          <div className="product-stat-card__trend product-stat-card__trend--negative">
            {stats.inactive > 0 ? 'Требуют проверки' : 'Отлично!'}
          </div>
        </div>

        <div className="product-stat-card">
          <div className="product-stat-card__header">
            <span className="product-stat-card__label">Категорий</span>
            <span className="product-stat-card__icon"><AppIcon name="folder" size="sm" /></span>
          </div>
          <div className="product-stat-card__value">{categories.length}</div>
          <div className="product-stat-card__trend product-stat-card__trend--neutral">
            {stats.categories} используются
          </div>
        </div>
      </div>

      {/* Панель управления и фильтры */}
      <div className="product-controls">
        <div className="product-controls__main-row">
          <div className="product-controls__search-row">
            <div className="product-controls__search">
              <span className="product-controls__search-icon"><AppIcon name="search" size="xs" /></span>
              <input
                className="product-controls__search-input"
                placeholder="Поиск по названию или описанию..."
                value={state.query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <select
              className="product-controls__select"
              value={state.selectedCategoryId || ''}
              onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Все категории ({products.length})</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name} ({products.filter(p => p.category_id === cat.id).length})
                </option>
              ))}
            </select>

            <button
              className={`product-controls__toggle ${state.showOnlyActive ? 'product-controls__toggle--active' : ''}`}
              onClick={() => setShowOnlyActive(!state.showOnlyActive)}
            >
              <AppIcon name={state.showOnlyActive ? 'check' : 'ban'} size="xs" />
              <span>Только активные</span>
            </button>
          </div>
        </div>

        <div className="product-quick-filters">
          <button
            className={`product-filter-chip ${!state.selectedCategoryId ? 'product-filter-chip--active' : ''}`}
            onClick={() => setSelectedCategoryId(null)}
          >
            <AppIcon name="package" size="xs" />
            <span>Все</span>
            <span className="product-filter-chip__count">{products.length}</span>
          </button>
          {categories.map((cat) => {
            const count = products.filter(p => p.category_id === cat.id).length;
            if (count === 0) return null;
            return (
              <button
                key={cat.id}
                className={`product-filter-chip ${state.selectedCategoryId === cat.id ? 'product-filter-chip--active' : ''}`}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                <AppIcon name="folder" size="xs" />
                <span>{cat.name}</span>
                <span className="product-filter-chip__count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="management-content">
        {state.selectedProducts.size > 0 && (
          <div className="bulk-actions-bar">
            <span className="bulk-count">Выбрано: {state.selectedProducts.size}</span>
            <div className="flex gap-2">
              <button type="button" className="lg-btn lg-btn--success" onClick={handleBulkActivate}>
                <AppIcon name="check" size="xs" /> Активировать
              </button>
              <button type="button" className="lg-btn lg-btn--warning" onClick={handleBulkDeactivate}>
                <AppIcon name="ban" size="xs" /> Деактивировать
              </button>
              <button type="button" className="lg-btn" onClick={clearSelectedProducts}>
                Отменить выбор
              </button>
            </div>
          </div>
        )}

        {isDirectoryLoading ? (
          <div className="pm-loading">
            <LoadingState message="Загружаем продукты..." />
          </div>
        ) : (
          <div className="products-table-wrapper">
            <table className="products-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={state.selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th></th>
                  <th className="sortable-header" onClick={() => toggleSort('name')}>
                    Название {state.sortField === 'name' && (state.sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort('category')}>
                    Категория {state.sortField === 'category' && (state.sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Статус</th>
                  <th title="Показывать в каталоге на сайте">На сайте</th>
                  <th></th>
                  <th>Описание</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className={state.selectedProducts.has(product.id) ? 'selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={state.selectedProducts.has(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                      />
                    </td>
                    <td className="cell-icon">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="cell-icon__img" />
                      ) : (
                        <AppIcon name="package" size="sm" />
                      )}
                    </td>
                    <td className="cell-name">{product.name}</td>
                    <td>{getCategoryById(product.category_id)?.name || '—'}</td>
                    <td>
                      <StatusBadge
                        status={product.is_active ? 'Активен' : 'Скрыт'}
                        color={product.is_active ? 'success' : 'warning'}
                        size="sm"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`lg-btn ${product.active_for_site === true || product.active_for_site === 1 ? 'lg-btn--success' : ''}`}
                        onClick={() => toggleProductSite(product)}
                        disabled={!product.is_active || togglingSiteProductId === product.id}
                        title={product.is_active
                          ? (product.active_for_site ? 'Скрыть с сайта' : 'Показать на сайте')
                          : 'Сначала включите продукт'}
                      >
                        {togglingSiteProductId === product.id ? '…' : (product.active_for_site === true || product.active_for_site === 1 ? 'Да' : 'Нет')}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-setup-status"
                        onClick={() => setSetupStatusModal(product.id)}
                        title="Проверить статус настройки"
                      >
                        <AppIcon name="wrench" size="xs" />
                      </button>
                    </td>
                    <td className="cell-description">{product.description}</td>
                    <td>
                      <div className="row-actions">
                        {productCanBeDuplicated(product) && (
                          <button
                            type="button"
                            className="lg-btn"
                            onClick={() => setDuplicateSource(product)}
                            title="Полная копия шаблона и настроек"
                          >
                            <AppIcon name="copy" size="xs" /> Копировать
                          </button>
                        )}
                        <button type="button" className="lg-btn" onClick={() => navigate(`/adminpanel/products/${product.id}/edit`)}>
                          <AppIcon name="clipboard" size="xs" /> Инфо
                        </button>
                        <button type="button" className="lg-btn" onClick={() => navigate(`/adminpanel/products/${product.id}/template`)}>
                          <AppIcon name="edit" size="xs" /> Шаблон
                        </button>
                        <button type="button" className="lg-btn" onClick={() => navigate(`/adminpanel/products/${product.id}/tech-process`)}>
                          <AppIcon name="cog" size="xs" /> Процесс
                        </button>
                        <button
                          type="button"
                          className={`lg-btn row-actions__toggle-btn ${product.is_active ? 'lg-btn--warning' : 'lg-btn--success'}`}
                          onClick={() => toggleProductActive(product)}
                          disabled={directoryLoading.toggleProduct}
                        >
                          {product.is_active ? <><AppIcon name="ban" size="xs" /> Выкл</> : <><AppIcon name="check" size="xs" /> Вкл</>}
                        </button>
                        <button
                          type="button"
                          className="lg-btn lg-btn--danger"
                          onClick={() => handleDeleteProduct(product)}
                          disabled={state.deletingProductId === product.id}
                        >
                          <AppIcon name="trash" size="xs" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredProducts.length && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
                      Нет продуктов, удовлетворяющих условиям поиска.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Мастер создания продукта */}
      {state.wizard.show && (
        <ProductCreateModal
          visible={state.wizard.show}
          onClose={handleWizardClose}
          categories={categories}
          onCreated={handleWizardCreated}
        />
      )}

      <ProductDuplicateModal
        visible={!!duplicateSource}
        source={duplicateSource ? { id: duplicateSource.id, name: duplicateSource.name } : null}
        onClose={() => setDuplicateSource(null)}
        onDuplicated={handleDuplicateCreated}
      />

      {/* Модальное окно статуса настройки */}
      {state.setupStatusModal && (
        <Modal
          isOpen={true}
          onClose={() => setSetupStatusModal(null)}
          title={`Статус настройки: ${products.find(p => p.id === state.setupStatusModal)?.name || 'Продукт'}`}
          size="md"
        >
          <ProductSetupStatus
            productId={state.setupStatusModal}
            onStatusChange={() => {
              fetchProducts(true);
            }}
          />
        </Modal>
      )}

      {/* Управление категориями */}
      <CategoryManagementModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories}
        onCategoriesChanged={() => fetchCategories(true)}
      />
    </div>
  );
};

export default ProductManagement;
