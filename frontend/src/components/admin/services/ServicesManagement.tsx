/**
 * Рефакторенная версия ServicesManagement
 * Использует модульную структуру с хуками и компонентами
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button, Alert, Modal } from '../../common';
import { AppIcon } from '../../ui/AppIcon';
import { PricingService } from '../../../types/pricing';
import { ServiceFormState } from './components/ServiceForm';
import usePricingServices from '../../../hooks/pricing/usePricingServices';
import { getServiceCategories } from '../../../services/pricing';
import { ServiceCategory } from '../../../types/pricing';
import { getMaterials } from '../../../api';
import { ServiceCategoriesBlock } from './components/ServiceCategoriesBlock';
import { useServicesManagementState } from '../hooks/useServicesManagementState';
import { useServiceOperations } from './hooks/useServiceOperations';
import { useTierOperations } from './hooks/useTierOperations';
import { filterAndSortServices } from './utils/serviceFilters';
import { getServiceIcon, getServiceTypeLabel, getUnitLabel } from './utils/serviceFormatters';
import ServiceForm from './components/ServiceForm';
import ServicesTable from './components/ServicesTable';
import ServiceVolumeTiersPanel from './components/ServiceVolumeTiersPanel';
import { AutoCuttingPriceSection } from './components/AutoCuttingPriceSection';
import { ServiceVariantsTable } from './components/ServiceVariantsTable';
import { ServicesFilters } from './components/ServicesFilters';
import { ServicesStats } from './components/ServicesStats';
import { getServiceVariants } from '../../../services/pricing';
import './ServicesManagement.css';

const emptyServiceForm: ServiceFormState = {
  name: '',
  type: 'postprint',
  unit: 'item',
  rate: '',
  isActive: true,
  hasVariants: false,
  operationType: 'other',
  minQuantity: '1',
  maxQuantity: '',
  operatorPercent: '',
  categoryId: '',
  materialId: '',
  qtyPerItem: '1',
};

const serviceToFormState = (service: PricingService): ServiceFormState => ({
  name: service.name,
  type: service.type,
  unit: service.priceUnit ?? service.unit,
  rate: service.rate.toString(),
  isActive: service.isActive,
  hasVariants: false,
  operationType: service.operationType || 'other',
  minQuantity: service.minQuantity !== undefined ? String(service.minQuantity) : '1',
  maxQuantity: service.maxQuantity !== undefined ? String(service.maxQuantity) : '',
  operatorPercent: (service as any).operator_percent !== undefined ? String((service as any).operator_percent) : '',
  categoryId: service.categoryId != null ? service.categoryId : '',
  materialId: service.material_id != null ? service.material_id : '',
  qtyPerItem: service.qty_per_item != null ? String(service.qty_per_item) : '1',
});

interface ServicesManagementProps {
  showHeader?: boolean;
}

const ServicesManagement: React.FC<ServicesManagementProps> = ({ showHeader = true }) => {
  // Управление состоянием
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

  const [servicesWithVariants, setServicesWithVariants] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [materials, setMaterials] = useState<Array<{ id: number; name: string }>>([]);

  const loadCategories = useCallback(() => {
    getServiceCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    getMaterials()
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setMaterials(list.map((m: any) => ({ id: m.id, name: m.name || `#${m.id}` })));
      })
      .catch(() => setMaterials([]));
  }, []);

  const combinedError = state.actionError || servicesError;

  // Проверяем наличие вариантов для услуг
  useEffect(() => {
    const checkVariants = async () => {
      const servicesWithVariantsSet = new Set<number>();
      await Promise.all(
        services.map(async (service) => {
          try {
            const variants = await getServiceVariants(service.id);
            if (variants.length > 0) {
              servicesWithVariantsSet.add(service.id);
            }
          } catch (err) {
            // Игнорируем ошибки
          }
        })
      );
      setServicesWithVariants(servicesWithVariantsSet);
    };
    if (services.length > 0) {
      void checkVariants();
    }
  }, [services]);

  // Хуки для операций
  const serviceOperations = useServiceOperations({
    onSuccess: (message) => {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (message) => {
      setActionError(message);
      setTimeout(() => setActionError(null), 5000);
    },
    onReload: reloadServices,
    onServiceCreated: (serviceId) => {
      setServicesWithVariants((prev) => new Set(prev).add(serviceId));
    },
  });

  // Используем ref для стабильной ссылки на serviceOperations
  const serviceOperationsRef = useRef(serviceOperations);
  serviceOperationsRef.current = serviceOperations;

  const tierOperations = useTierOperations({
    onSuccess: (message) => {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (message) => {
      setActionError(message);
      setTimeout(() => setActionError(null), 4000);
    },
    onTiersLoaded: (serviceId, tiers) => {
      setVolumeTiers(serviceId, tiers);
    },
    onTiersLoading: (serviceId, loading) => {
      setTiersLoading(serviceId, loading);
    },
  });

  // Обработчики
  const openEditService = useCallback((service: PricingService) => {
    setEditingService(service);
    setEditingServiceForm(serviceToFormState(service));
  }, [setEditingService, setEditingServiceForm]);

  const saveEditService = useCallback(async () => {
    if (!state.editingService || !state.editingServiceForm) return;
    const payload = {
      name: state.editingServiceForm.name.trim(),
      type: state.editingServiceForm.type,
      unit: state.editingServiceForm.unit,
      rate: Number(state.editingServiceForm.rate || 0),
      isActive: state.editingServiceForm.isActive,
      operationType: state.editingServiceForm.operationType || 'other', // 🆕
      minQuantity: state.editingServiceForm.minQuantity
        ? Number(state.editingServiceForm.minQuantity)
        : undefined,
      maxQuantity: state.editingServiceForm.maxQuantity
        ? Number(state.editingServiceForm.maxQuantity)
        : undefined,
      operator_percent: state.editingServiceForm.operatorPercent !== ''
        ? Number(state.editingServiceForm.operatorPercent) || 0
        : undefined,
      categoryId: state.editingServiceForm.categoryId !== '' ? state.editingServiceForm.categoryId : null,
      material_id: state.editingServiceForm.materialId !== '' ? state.editingServiceForm.materialId : null,
      qty_per_item: state.editingServiceForm.qtyPerItem !== '' && Number(state.editingServiceForm.qtyPerItem) > 0 ? Number(state.editingServiceForm.qtyPerItem) : undefined,
    };
    await serviceOperationsRef.current.updateService(state.editingService.id, payload);
    resetEditingService();
  }, [state.editingService, state.editingServiceForm, resetEditingService]); // serviceOperations через ref

  const handleServiceCreate = useCallback(async () => {
    const created = await serviceOperationsRef.current.createService({
      name: state.newServiceForm.name.trim(),
      type: state.newServiceForm.type || 'postprint',
      unit: state.newServiceForm.unit || 'item',
      rate: Number(state.newServiceForm.rate || 0),
      isActive: state.newServiceForm.isActive,
      hasVariants: state.newServiceForm.hasVariants,
      operationType: state.newServiceForm.operationType || 'other', // 🆕
      minQuantity: state.newServiceForm.minQuantity
        ? Number(state.newServiceForm.minQuantity)
        : undefined,
      maxQuantity: state.newServiceForm.maxQuantity
        ? Number(state.newServiceForm.maxQuantity)
        : undefined,
      operator_percent: state.newServiceForm.operatorPercent !== ''
        ? Number(state.newServiceForm.operatorPercent) || 0
        : undefined,
      categoryId: state.newServiceForm.categoryId !== '' ? state.newServiceForm.categoryId : undefined,
      material_id: state.newServiceForm.materialId !== '' ? state.newServiceForm.materialId : undefined,
      qty_per_item: state.newServiceForm.qtyPerItem !== '' && Number(state.newServiceForm.qtyPerItem) > 0 ? Number(state.newServiceForm.qtyPerItem) : undefined,
    });
    
    if (created) {
      setShowCreateService(false);
      resetNewServiceForm(emptyServiceForm);
    }
  }, [state.newServiceForm, setShowCreateService, resetNewServiceForm]); // serviceOperations через ref

  const handleServiceDelete = useCallback(async (id: number, serviceName: string) => {
    await serviceOperationsRef.current.deleteService(id, serviceName);
    removeVolumeTiers(id);
    if (state.expandedServiceId === id) {
      setExpandedServiceId(null);
    }
  }, [removeVolumeTiers, state.expandedServiceId, setExpandedServiceId]); // serviceOperations через ref

  // Используем ref для стабильной ссылки на tierOperations
  const tierOperationsRef = useRef(tierOperations);
  tierOperationsRef.current = tierOperations;

  const handleToggleVolumeTiers = useCallback(async (serviceId: number) => {
    if (state.expandedServiceId === serviceId) {
      setExpandedServiceId(null);
      return;
    }
    setExpandedServiceId(serviceId);
    if (!state.volumeTiers[serviceId]) {
      await tierOperationsRef.current.loadTiers(serviceId);
    }
  }, [state.expandedServiceId, state.volumeTiers, setExpandedServiceId]); // tierOperations через ref

  // Фильтрация и сортировка
  const filteredServices = useMemo(() => {
    return filterAndSortServices(services, {
      search: state.serviceSearch,
      typeFilter: state.typeFilter,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    });
  }, [services, state.serviceSearch, state.typeFilter, state.sortBy, state.sortOrder]);

  // Группировка по категориям для отображения (порядок: по sort_order категорий, затем "Без категории")
  const servicesByCategory = useMemo(() => {
    const order = new Map<number | null, number>();
    categories.forEach((c, i) => order.set(c.id, c.sortOrder ?? i));
    order.set(null, 1e9);
    const groups = new Map<string, { categoryId: number | null; categoryName: string; services: PricingService[] }>();
    for (const s of filteredServices) {
      const categoryId = s.categoryId ?? null;
      const categoryName = s.categoryName ?? 'Без категории';
      const key = categoryId !== null ? `id:${categoryId}` : 'none';
      if (!groups.has(key)) groups.set(key, { categoryId, categoryName, services: [] });
      groups.get(key)!.services.push(s);
    }
    return Array.from(groups.values()).sort(
      (a, b) => (order.get(a.categoryId) ?? 1e9) - (order.get(b.categoryId) ?? 1e9)
    );
  }, [filteredServices, categories]);

  // Рендеринг действий для строки услуги
  const renderActions = useCallback((service: PricingService) => (
    <div className="services-table__actions">
      <Button variant="info" size="sm" onClick={() => openEditService(service)}>
        <AppIcon name="edit" size="xs" /> Редактировать
      </Button>
      <Button
        variant="warning"
        size="sm"
        onClick={() => serviceOperationsRef.current.updateService(service.id, { isActive: !service.isActive })}
      >
        {service.isActive ? <><AppIcon name="ban" size="xs" /> Деактивировать</> : <><AppIcon name="check" size="xs" /> Активировать</>}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => handleToggleVolumeTiers(service.id)}>
        <AppIcon name="chart" size="xs" /> Диапазоны
      </Button>
      <Button variant="error" size="sm" onClick={() => handleServiceDelete(service.id, service.name)}>
        <AppIcon name="trash" size="xs" />
      </Button>
    </div>
  ), [openEditService, handleToggleVolumeTiers, handleServiceDelete]); // serviceOperations через ref

  // Рендеринг развернутой строки
  const renderExpandedRow = useCallback((service: PricingService) => {
    if (servicesWithVariants.has(service.id)) {
      return (
        <ServiceVariantsTable
          serviceId={service.id}
          serviceName={service.name}
          serviceMinQuantity={service.minQuantity}
          serviceMaxQuantity={service.maxQuantity}
          materials={materials}
        />
      );
    }
    return (
      <ServiceVolumeTiersPanel
        service={service}
        tiers={state.volumeTiers[service.id] || []}
        loading={!!state.tiersLoading[service.id]}
        onCreateTier={(payload) => tierOperationsRef.current.createTier(service.id, payload)}
        onUpdateTier={(tierId, payload) => tierOperationsRef.current.updateTier(service.id, tierId, payload)}
        onDeleteTier={(tierId) => tierOperationsRef.current.deleteTier(service.id, tierId)}
      />
    );
  }, [servicesWithVariants, state.volumeTiers, state.tiersLoading]); // tierOperations через ref

  return (
    <div className="services-management">
      {showHeader && (
        <div className="services-header">
          <div className="services-header__title-row">
            <span className="services-header__icon">💰</span>
            <h1 className="services-header__title">Управление услугами</h1>
          </div>
          <p className="services-header__subtitle">Создание услуг и установка базовой стоимости</p>
        </div>
      )}

      {/* Статистика */}
      <ServicesStats services={services} />

      {/* Цена автоматической резки */}
      <AutoCuttingPriceSection />

      {/* Ошибки и успех */}
      {combinedError && (
        <div className="svc-error-banner">
          {combinedError}
        </div>
      )}

      {state.success && (
        <Alert type="success" className="mb-4">{state.success}</Alert>
      )}

      {/* Контент */}
      {servicesLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-500">Загрузка услуг...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Категории услуг */}
          <ServiceCategoriesBlock categories={categories} onReload={loadCategories} />

          {/* Фильтры */}
          <ServicesFilters
            services={services}
            searchValue={state.serviceSearch}
            typeFilter={state.typeFilter}
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            onSearchChange={setServiceSearch}
            onTypeFilterChange={setTypeFilter}
            onSortChange={(field, order) => {
              setSortBy(field);
              setSortOrder(order);
            }}
            onCreateService={() => setShowCreateService(true)}
          />

          <div className="svc-info-banner">
            <strong>Как это работает:</strong> Создайте услугу с единицей измерения и базовой ценой. Услуги привязываются к продуктам при их создании.
          </div>

          {/* Таблица услуг по категориям */}
          {filteredServices.length > 0 ? (
            <>
              <div className="services-table-container">
                {servicesByCategory.map((group) => (
                  <div key={group.categoryId ?? 'none'} className="services-category-group">
                    <h3 className="services-category-group__title">{group.categoryName}</h3>
                    <ServicesTable
                      services={group.services}
                      renderActions={renderActions}
                      expandedServiceId={state.expandedServiceId}
                      renderExpandedRow={renderExpandedRow}
                      getServiceIcon={getServiceIcon}
                      getServiceTypeLabel={getServiceTypeLabel}
                      getUnitLabel={getUnitLabel}
                    />
                  </div>
                ))}
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
              <div className="services-empty__icon"><AppIcon name="clipboard" size="lg" /></div>
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
      )}

      {/* Модальное окно создания услуги */}
      {state.showCreateService && (
        <Modal isOpen={true} title="Новая услуга" onClose={() => setShowCreateService(false)}>
          <ServiceForm value={state.newServiceForm} onChange={setNewServiceForm} categories={categories} materials={materials} />
          <Alert type="info" className="mt-4">
            После создания услугу можно привязать к продукту в разделе управления продуктами.
          </Alert>
          <div className="flex justify-end gap-2 w-full mt-4 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowCreateService(false)}>Отмена</Button>
            <Button variant="primary" onClick={handleServiceCreate}>Сохранить</Button>
          </div>
        </Modal>
      )}

      {/* Модальное окно редактирования услуги */}
      {state.editingService && state.editingServiceForm && (
        <Modal
          isOpen={true}
          title="Редактирование услуги"
          onClose={resetEditingService}
        >
          <ServiceForm value={state.editingServiceForm} onChange={setEditingServiceForm} categories={categories} materials={materials} />
          <div className="flex justify-end gap-2 w-full mt-4 pt-4 border-t">
            <Button variant="secondary" onClick={resetEditingService}>
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
