import React from 'react';
import { Button, Alert, Modal } from '../../common';
import {
  PricingService,
  ServiceVolumeTier,
  UpdatePricingServicePayload,
  ServiceVolumeTierPayload,
} from '../../../types/pricing';
import {
  createPricingService,
  updatePricingService,
  deletePricingService,
  getServiceVolumeTiers,
  createServiceVolumeTier,
  updateServiceVolumeTier,
  deleteServiceVolumeTier,
} from '../../../services/pricing';
import usePricingServices from '../../../hooks/pricing/usePricingServices';
import ServiceForm, { ServiceFormState } from './components/ServiceForm';
import ServicesTable from './components/ServicesTable';
import ServiceVolumeTiersPanel from './components/ServiceVolumeTiersPanel';
import { useServicesManagementState } from '../hooks/useServicesManagementState';
import { getErrorMessage } from '../../../utils/errorUtils';
import './ServicesManagement.css';

const emptyServiceForm: ServiceFormState = {
  name: '',
  type: 'postprint',
  unit: 'item',
  rate: '',
  isActive: true,
};

const serviceToFormState = (service: PricingService): ServiceFormState => ({
  name: service.name,
  type: service.type,
  unit: service.unit,
  rate: service.rate.toString(),
  isActive: service.isActive,
});

// markups removed

// rules removed for now

const ServicesManagement: React.FC = () => {
  // Используем хук для управления состоянием
  const {
    state,
    setShowCreateService,
    setExpandedServiceId,
    setVolumeTiers,
    removeVolumeTiers,
    setTiersLoading,
    setActionError,
    setSuccess,
    setNewServiceForm,
    resetNewServiceForm,
    setEditingService,
    setEditingServiceForm,
    resetEditingService,
    setServiceSearch,
    setTypeFilter,
    setSortBy,
    setSortOrder,
  } = useServicesManagementState();

  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    reload: reloadServices,
  } = usePricingServices(true);

  const combinedError = state.actionError || servicesError;

  const handleServiceUpdate = async (id: number, payload: UpdatePricingServicePayload) => {
    try {
      await updatePricingService(id, payload);
      await reloadServices();
      setSuccess('Услуга обновлена');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setActionError('Ошибка обновления услуги');
      setTimeout(() => setActionError(null), 5000);
    }
  };

  const openEditService = (service: PricingService) => {
    setEditingService(service);
    setEditingServiceForm(serviceToFormState(service));
  };

  const saveEditService = async () => {
    if (!state.editingService || !state.editingServiceForm) return;
    const payload: UpdatePricingServicePayload = {
      name: state.editingServiceForm.name.trim(),
      type: state.editingServiceForm.type,
      unit: state.editingServiceForm.unit,
      rate: Number(state.editingServiceForm.rate || 0),
      isActive: state.editingServiceForm.isActive,
    };
    await handleServiceUpdate(state.editingService.id, payload);
    resetEditingService();
  };

  const handleServiceCreate = async () => {
    try {
      if (!state.newServiceForm.name.trim() || !state.newServiceForm.unit.trim()) {
        setActionError('Заполните обязательные поля: название, единица');
        return;
      }

      const rateValue = Number(state.newServiceForm.rate || 0);

      await createPricingService({
        name: state.newServiceForm.name.trim(),
        type: state.newServiceForm.type || 'postprint',
        unit: state.newServiceForm.unit || 'item',
        rate: Number.isFinite(rateValue) ? rateValue : 0,
        isActive: state.newServiceForm.isActive,
      });

      setShowCreateService(false);
      resetNewServiceForm(emptyServiceForm);
      setSuccess('Услуга создана');
      await reloadServices();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      console.error('Error creating service:', e);
      setActionError(`Ошибка создания услуги: ${getErrorMessage(e)}`);
      setTimeout(() => setActionError(null), 5000);
    }
  };

  // markups API removed

  // rules API removed

  const handleServiceDelete = async (id: number, serviceName: string) => {
    if (!confirm(`Удалить услугу "${serviceName}"? Это действие нельзя отменить.`)) {
      return;
    }
    try {
      await deletePricingService(id);
      setSuccess('Услуга удалена');
      await reloadServices();
      setTimeout(() => setSuccess(null), 3000);
      removeVolumeTiers(id);
      if (state.expandedServiceId === id) {
        setExpandedServiceId(null);
      }
    } catch (e: unknown) {
      console.error('Error deleting service:', e);
      setActionError(`Ошибка удаления услуги: ${getErrorMessage(e)}`);
      setTimeout(() => setActionError(null), 5000);
    }
  };

  const getServiceIcon = (type: string) => {
    switch (type) {
      case 'print': return '🖨️';
      case 'postprint': return '✂️';
      case 'other': return '⚙️';
      default: return '📋';
    }
  };

  const getServiceTypeLabel = (type: string) => {
    switch (type) {
      case 'print': return 'Печать';
      case 'postprint': return 'Послепечатные';
      case 'other': return 'Прочее';
      case 'generic': return 'Общее';
      default: return type;
    }
  };

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'item': return 'шт';
      case 'sheet': return 'лист';
      case 'hour': return 'час';
      case 'm2': return 'м²';
      case 'click': return 'клик';
      default: return unit;
    }
  };

  const loadServiceTiers = async (serviceId: number) => {
    try {
      setTiersLoading(serviceId, true);
      const tiers = await getServiceVolumeTiers(serviceId);
      setVolumeTiers(serviceId, tiers);
    } catch (err) {
      console.error(err);
      setActionError('Не удалось загрузить диапазоны цен для услуги');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setTiersLoading(serviceId, false);
    }
  };

  const handleToggleVolumeTiers = async (serviceId: number) => {
    if (state.expandedServiceId === serviceId) {
      setExpandedServiceId(null);
      return;
    }
    setExpandedServiceId(serviceId);
    if (!state.volumeTiers[serviceId]) {
      await loadServiceTiers(serviceId);
    }
  };

  const handleCreateTier = async (serviceId: number, payload: ServiceVolumeTierPayload) => {
    try {
      await createServiceVolumeTier(serviceId, payload);
      await loadServiceTiers(serviceId);
      setSuccess('Диапазон цены добавлен');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      console.error(e);
      setActionError(`Ошибка создания диапазона: ${getErrorMessage(e)}`);
      setTimeout(() => setActionError(null), 4000);
      throw e;
    }
  };

  const handleUpdateTier = async (serviceId: number, tierId: number, payload: ServiceVolumeTierPayload) => {
    try {
      await updateServiceVolumeTier(serviceId, tierId, payload);
      await loadServiceTiers(serviceId);
      setSuccess('Диапазон обновлён');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      console.error(e);
      setActionError(`Ошибка обновления диапазона: ${getErrorMessage(e)}`);
      setTimeout(() => setActionError(null), 4000);
      throw e;
    }
  };

  const handleDeleteTier = async (serviceId: number, tierId: number) => {
    try {
      await deleteServiceVolumeTier(serviceId, tierId);
      await loadServiceTiers(serviceId);
      setSuccess('Диапазон удалён');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      console.error(e);
      setActionError(`Ошибка удаления диапазона: ${getErrorMessage(e)}`);
      setTimeout(() => setActionError(null), 4000);
      throw e;
    }
  };

  const renderServices = () => {
    const availableTypes = [...new Set(services.map((s) => s.type))];

    const filteredServices = services
      .filter((s) => {
        const matchesSearch = state.serviceSearch
          ? `${s.name} ${s.type}`.toLowerCase().includes(state.serviceSearch.toLowerCase())
          : true;
        const matchesType = state.typeFilter === 'all' || s.type === state.typeFilter;
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        let comparison = 0;
        switch (state.sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'price':
            comparison = a.rate - b.rate;
            break;
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
        }
        return state.sortOrder === 'asc' ? comparison : -comparison;
      });

    const renderActions = (service: PricingService) => (
      <div className="flex gap-2 justify-end">
        <Button variant="info" size="sm" onClick={() => openEditService(service)}>
          ✏️ Редактировать
        </Button>
        <Button
          variant="warning"
          size="sm"
          onClick={() => handleServiceUpdate(service.id, { isActive: !service.isActive })}
        >
          {service.isActive ? '⏸️ Деактивировать' : '▶️ Активировать'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => handleToggleVolumeTiers(service.id)}>
          📈 Диапазоны
        </Button>
        <Button variant="error" size="sm" onClick={() => handleServiceDelete(service.id, service.name)}>
          🗑️
        </Button>
      </div>
    );

    const renderExpandedRow = (service: PricingService) => (
      <ServiceVolumeTiersPanel
        service={service}
        tiers={state.volumeTiers[service.id] || []}
        loading={!!state.tiersLoading[service.id]}
        onCreateTier={(payload) => handleCreateTier(service.id, payload)}
        onUpdateTier={(tierId, payload) => handleUpdateTier(service.id, tierId, payload)}
        onDeleteTier={(tierId) => handleDeleteTier(service.id, tierId)}
      />
    );

    return (
      <div className="space-y-4">
        {/* Панель управления и фильтры */}
        <div className="services-controls">
          <div className="services-controls__row">
            <div className="services-controls__filters">
              {/* Поиск */}
              <div className="services-controls__search">
                <span className="services-controls__search-icon">🔍</span>
                <input
                  className="services-controls__search-input"
                  placeholder="Поиск по названию или типу..."
                  value={state.serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                />
              </div>

              {/* Фильтр по типу */}
              <select
                className="services-controls__filter-select"
                value={state.typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">Все типы ({services.length})</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {getServiceIcon(type)} {getServiceTypeLabel(type)} ({services.filter((s) => s.type === type).length})
                  </option>
                ))}
              </select>

              {/* Сортировка */}
              <select
                className="services-controls__filter-select"
                value={`${state.sortBy}-${state.sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field as 'name' | 'price' | 'type');
                  setSortOrder(order as 'asc' | 'desc');
                }}
              >
                <option value="name-asc">По названию (А-Я)</option>
                <option value="name-desc">По названию (Я-А)</option>
                <option value="price-asc">По цене (возр.)</option>
                <option value="price-desc">По цене (убыв.)</option>
                <option value="type-asc">По типу (А-Я)</option>
              </select>
            </div>

            <Button variant="primary" onClick={() => setShowCreateService(true)}>
              + Добавить услугу
            </Button>
          </div>

          {/* Быстрые фильтры */}
          <div className="services-quick-filters">
            <button
              className={`quick-filter-chip ${state.typeFilter === 'all' ? 'quick-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >
              <span>📋</span>
              <span>Все ({services.length})</span>
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                className={`quick-filter-chip ${state.typeFilter === type ? 'quick-filter-chip--active' : ''}`}
                onClick={() => setTypeFilter(type)}
              >
                <span>{getServiceIcon(type)}</span>
                <span>{getServiceTypeLabel(type)} ({services.filter(s => s.type === type).length})</span>
              </button>
            ))}
          </div>
        </div>

        <Alert type="info">
          <div className="flex items-start gap-2">
            <span>💡</span>
            <div>
              <strong>Как это работает:</strong> Создайте услугу с единицей измерения и базовой ценой. Услуги привязываются к продуктам при их создании.
            </div>
          </div>
        </Alert>

        {filteredServices.length > 0 ? (
          <>
            <div className="services-table-container">
              <ServicesTable
                services={filteredServices}
                renderActions={renderActions}
                expandedServiceId={state.expandedServiceId}
                renderExpandedRow={renderExpandedRow}
                getServiceIcon={getServiceIcon}
                getServiceTypeLabel={getServiceTypeLabel}
                getUnitLabel={getUnitLabel}
              />
            </div>
            
            {/* Футер таблицы */}
            <div className="services-table-footer">
              <span>
                Показано: <strong>{filteredServices.length}</strong> из <strong>{services.length}</strong> услуг
              </span>
              <span>Активных: <strong>{services.filter((s) => s.isActive).length}</strong></span>
            </div>
          </>
        ) : (
          <div className="services-empty">
            <div className="services-empty__icon">📋</div>
            <h3 className="services-empty__title">
              {state.serviceSearch || state.typeFilter !== 'all' ? 'Ничего не найдено' : 'Нет услуг'}
            </h3>
            <p className="services-empty__message">
              {state.serviceSearch || state.typeFilter !== 'all'
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Начните с добавления первой услуги для настройки ценообразования'}
            </p>
            {!state.serviceSearch && state.typeFilter === 'all' && (
              <Button variant="primary" onClick={() => setShowCreateService(true)}>
                + Добавить первую услугу
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Вычисляем статистику
  const stats = {
    total: services.length,
    active: services.filter(s => s.isActive).length,
    inactive: services.filter(s => !s.isActive).length,
    totalValue: services.reduce((sum, s) => sum + s.rate, 0),
    types: [...new Set(services.map(s => s.type))].length,
  };

  return (
    <div className="services-management">
      {/* Заголовок страницы */}
      <div className="services-header">
        <div className="services-header__title-row">
          <span className="services-header__icon">💰</span>
          <h1 className="services-header__title">Управление услугами</h1>
        </div>
        <p className="services-header__subtitle">Создание услуг и установка базовой стоимости</p>
      </div>

      {/* Статистика */}
      <div className="services-stats">
        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Всего услуг</span>
            <span className="stat-card__icon">📋</span>
          </div>
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__trend">
            +{stats.types} типов
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Активных</span>
            <span className="stat-card__icon">✅</span>
          </div>
          <div className="stat-card__value">{stats.active}</div>
          <div className="stat-card__trend">
            {((stats.active / stats.total) * 100).toFixed(0)}% от всех
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Неактивных</span>
            <span className="stat-card__icon">⏸️</span>
          </div>
          <div className="stat-card__value">{stats.inactive}</div>
          <div className="stat-card__trend stat-card__trend--negative">
            {stats.inactive > 0 ? 'Требуют внимания' : 'Отлично!'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Средняя цена</span>
            <span className="stat-card__icon">💵</span>
          </div>
          <div className="stat-card__value">{(stats.totalValue / stats.total || 0).toFixed(2)}</div>
          <div className="stat-card__trend">
            BYN
          </div>
        </div>
      </div>

      {combinedError && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {combinedError}
        </div>
      )}

      {state.success && (
        <Alert type="success" className="mb-4">{state.success}</Alert>
      )}

      {servicesLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-500">Загрузка услуг...</p>
          </div>
        </div>
      ) : (
        renderServices()
      )}

      {/* Create Service Modal */}
      {state.showCreateService && (
        <Modal isOpen={true} title="Новая услуга" onClose={() => setShowCreateService(false)}>
          <ServiceForm value={state.newServiceForm} onChange={setNewServiceForm} />
          <Alert type="info" className="mt-4">
            После создания услугу можно привязать к продукту в разделе управления продуктами.
          </Alert>
          <div className="flex justify-end gap-2 w-full mt-4 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowCreateService(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleServiceCreate}>Сохранить</Button>
          </div>
        </Modal>
      )}

      {/* Edit Service Modal */}
      {state.editingService && state.editingServiceForm && (
        <Modal
          isOpen={true}
          title="Редактирование услуги"
          onClose={resetEditingService}
        >
          <ServiceForm value={state.editingServiceForm} onChange={setEditingServiceForm} />
          <div className="flex justify-end gap-2 w-full mt-4 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={resetEditingService}
            >
              Отмена
            </Button>
            <Button variant="primary" onClick={saveEditService}>Сохранить</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ServicesManagement;


