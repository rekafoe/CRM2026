import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Supplier } from '../../types/shared';
import { useUIStore } from '../../stores/uiStore';
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '../../api/hooks/useSuppliers';
import { SupplierModal } from './SupplierModal';
import { SupplierMaterialsModal } from './SupplierMaterialsModal';
import { SupplierAnalyticsModal } from './SupplierAnalyticsModal';
import { api } from '../../api/client';
import './SuppliersManagement.css';

interface SuppliersManagementProps {
  onRefresh: () => void;
}

export const SuppliersManagement: React.FC<SuppliersManagementProps> = ({
  onRefresh
}) => {
  // API хуки
  const { data: suppliers = [], isLoading, error } = useSuppliers();
  const createSupplierMutation = useCreateSupplier();
  const updateSupplierMutation = useUpdateSupplier();
  const deleteSupplierMutation = useDeleteSupplier();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<number | 'all'>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');

  // Состояние для фильтров
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  const { showToast } = useUIStore();

  // Загрузка данных для фильтров
  const loadFilterData = useCallback(async () => {
    try {
      setLoadingFilters(true);
      
      // Загружаем категории
      const categoriesResponse = await api.get('/material-categories');
      setCategories(categoriesResponse.data || []);
      
      // Извлекаем уникальные регионы из адресов поставщиков
      const uniqueRegions = [...new Set(
        suppliers
          .map(s => s.address)
          .filter(addr => addr && addr.trim())
          .map(addr => {
            // Извлекаем город из адреса (первое слово до запятой)
            const city = addr.split(',')[0]?.trim();
            return city || addr;
          })
      )].sort();
      
      setRegions(uniqueRegions);
    } catch (error) {
      console.error('Ошибка загрузки данных фильтров:', error);
    } finally {
      setLoadingFilters(false);
    }
  }, [suppliers]);

  // Загружаем данные фильтров при изменении поставщиков
  useEffect(() => {
    if (suppliers.length > 0) {
      loadFilterData();
    }
  }, [suppliers, loadFilterData]);

  // Фильтрация поставщиков
  const filteredSuppliers = useMemo(() => {
    // Дедупликация по id - оставляем только первое вхождение каждого id
    const uniqueSuppliers = suppliers.reduce((acc, supplier) => {
      if (!acc.find(s => s.id === supplier.id)) {
        acc.push(supplier);
      }
      return acc;
    }, [] as Supplier[]);

    let filtered = uniqueSuppliers;

    // Поиск по тексту
    if (searchQuery) {
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Фильтр по статусу
    if (filterActive === 'active') {
      filtered = filtered.filter(s => s.is_active);
    } else if (filterActive === 'inactive') {
      filtered = filtered.filter(s => !s.is_active);
    }

    // Фильтр по региону
    if (filterRegion !== 'all') {
      filtered = filtered.filter(s => {
        if (!s.address) return false;
        const city = s.address.split(',')[0]?.trim();
        return city === filterRegion || s.address.includes(filterRegion);
      });
    }

    // Фильтр по категории (проверяем материалы поставщика)
    if (filterCategory !== 'all') {
      // Здесь нужно будет добавить логику проверки материалов поставщика
      // Пока оставляем как есть, так как у нас нет прямой связи поставщик-категория
    }

    return filtered;
  }, [suppliers, searchQuery, filterActive, filterRegion, filterCategory]);

  // Обработчики
  const handleAdd = useCallback(() => {
    setEditingSupplier(null);
    setShowAddModal(true);
  }, []);

  const handleEdit = useCallback((supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowAddModal(true);
  }, []);

  const handleViewMaterials = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowMaterialsModal(true);
  }, []);

  const handleViewAnalytics = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowAnalyticsModal(true);
  }, []);

  const handleDelete = useCallback(async (supplier: Supplier) => {
    if (window.confirm(`Удалить поставщика "${supplier.name}"?`)) {
      try {
        await deleteSupplierMutation.mutateAsync(supplier.id);
        showToast('Поставщик удален', 'success');
      } catch (error) {
        console.error('Ошибка удаления поставщика:', error);
        showToast('Ошибка при удалении поставщика', 'error');
      }
    }
  }, [deleteSupplierMutation, showToast]);

  const handleToggleActive = useCallback(async (supplier: Supplier) => {
    try {
      await updateSupplierMutation.mutateAsync({
        id: supplier.id,
        data: { is_active: !supplier.is_active }
      });
      showToast(
        `Поставщик ${supplier.is_active ? 'деактивирован' : 'активирован'}`,
        'success'
      );
    } catch (error) {
      console.error('Ошибка изменения статуса поставщика:', error);
      showToast('Ошибка при изменении статуса поставщика', 'error');
    }
  }, [updateSupplierMutation, showToast]);

  const handleSave = useCallback(async (supplierData: Partial<Supplier>) => {
    try {
      if (editingSupplier) {
        // Обновление существующего поставщика
        await updateSupplierMutation.mutateAsync({
          id: editingSupplier.id,
          data: supplierData
        });
        showToast('Поставщик обновлен', 'success');
      } else {
        // Добавление нового поставщика
        await createSupplierMutation.mutateAsync(supplierData);
        showToast('Поставщик добавлен', 'success');
      }
      setShowAddModal(false);
      setEditingSupplier(null);
    } catch (error) {
      console.error('Ошибка сохранения поставщика:', error);
      showToast('Ошибка при сохранении поставщика', 'error');
    }
  }, [editingSupplier, updateSupplierMutation, createSupplierMutation, showToast]);

  // Статистика
  const stats = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter(s => s.is_active).length;
    const inactive = suppliers.filter(s => !s.is_active).length;

    return { total, active, inactive };
  }, [suppliers]);

  return (
    <div className="suppliers-management">
      {/* Заголовок */}
      <div className="suppliers-header">
        <h2>🏭 Управление поставщиками</h2>
        <div className="header-actions">
          <button 
            className="action-btn primary"
            onClick={handleAdd}
          >
            ➕ Добавить поставщика
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div className="suppliers-stats">
        <div className="stat-card">
          <div className="stat-icon">🏭</div>
          <div className="stat-content">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Всего поставщиков</div>
          </div>
        </div>
        <div className="stat-card success">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Активных</div>
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">⏸️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.inactive}</div>
            <div className="stat-label">Неактивных</div>
          </div>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="suppliers-controls">
        <div className="search-section">
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск поставщиков..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-group">
            <label>Статус:</label>
            <select 
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Все</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Регион:</label>
            <select 
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              disabled={loadingFilters}
            >
              <option value="all">Все регионы</option>
              {regions.map((region, index) => (
                <option key={`region-${index}-${region}`} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Категория:</label>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              disabled={loadingFilters}
            >
              <option value="all">Все категории</option>
              {categories.map((category, index) => (
                <option key={`category-${index}-${category.id}`} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <button 
              className="reset-filters-btn"
              onClick={() => {
                setSearchQuery('');
                setFilterActive('all');
                setFilterRegion('all');
                setFilterCategory('all');
              }}
              title="Сбросить все фильтры"
            >
              🔄 Сбросить
            </button>
          </div>
        </div>
      </div>

      {/* Таблица поставщиков */}
      <div className="suppliers-table-wrapper">
        <table className="suppliers-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Статус</th>
              <th>Название</th>
              <th>Контакт</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Адрес</th>
              <th>Создан</th>
              <th>Обновлен</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.map(supplier => (
              <tr key={supplier.id} className={!supplier.is_active ? 'row-inactive' : ''}>
                <td>{supplier.id}</td>
                <td>{supplier.is_active ? '✅' : '⏸️'}</td>
                <td style={{ textAlign: 'left' }}>{supplier.name}</td>
                <td style={{ textAlign: 'left' }}>{supplier.contact || '—'}</td>
                <td>{supplier.phone ? (<a href={`tel:${supplier.phone}`}>{supplier.phone}</a>) : '—'}</td>
                <td>{supplier.email ? (<a href={`mailto:${supplier.email}`}>{supplier.email}</a>) : '—'}</td>
                <td style={{ textAlign: 'left' }}>{supplier.address || '—'}</td>
                <td>{new Date(supplier.created_at).toLocaleDateString()}</td>
                <td>{new Date(supplier.updated_at).toLocaleDateString()}</td>
                <td>
                  <div className="supplier-actions inline">
                    <button 
                      className="action-btn small"
                      onClick={() => handleViewMaterials(supplier)}
                      title="Материалы"
                    >📦</button>
                    <button 
                      className="action-btn small"
                      onClick={() => handleViewAnalytics(supplier)}
                      title="Аналитика"
                    >📊</button>
                    <button 
                      className="action-btn small"
                      onClick={() => handleEdit(supplier)}
                      title="Редактировать"
                    >✏️</button>
                    <button 
                      className="action-btn small"
                      onClick={() => handleToggleActive(supplier)}
                      title={supplier.is_active ? 'Деактивировать' : 'Активировать'}
                    >{supplier.is_active ? '⏸️' : '▶️'}</button>
                    <button 
                      className="action-btn small danger"
                      onClick={() => handleDelete(supplier)}
                      title="Удалить"
                    >🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Пустое состояние */}
      {filteredSuppliers.length === 0 && (
        <div className="suppliers-empty">
          <div className="empty-content">
            <div className="empty-icon">🏭</div>
            <h3>Поставщики не найдены</h3>
            <p>Добавьте новых поставщиков или измените фильтры поиска</p>
            <button 
              className="action-btn primary"
              onClick={handleAdd}
            >
              ➕ Добавить поставщика
            </button>
          </div>
        </div>
      )}

      {/* Модальное окно добавления/редактирования */}
      {showAddModal && (
        <SupplierModal
          supplier={editingSupplier}
          onSave={handleSave}
          onClose={() => {
            setShowAddModal(false);
            setEditingSupplier(null);
          }}
        />
      )}

      {/* Модальное окно просмотра материалов */}
      {showMaterialsModal && (
        <SupplierMaterialsModal
          isOpen={showMaterialsModal}
          onClose={() => {
            setShowMaterialsModal(false);
            setSelectedSupplier(null);
          }}
          supplier={selectedSupplier}
        />
      )}

      {/* Модальное окно аналитики поставщика */}
      {showAnalyticsModal && (
        <SupplierAnalyticsModal
          isOpen={showAnalyticsModal}
          onClose={() => {
            setShowAnalyticsModal(false);
            setSelectedSupplier(null);
          }}
          supplier={selectedSupplier}
        />
      )}
    </div>
  );
};

