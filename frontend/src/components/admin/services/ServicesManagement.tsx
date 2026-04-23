/**
 * Рефакторенная версия ServicesManagement
 * Использует модульную структуру с хуками и компонентами
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
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
import ServiceVolumeTiersPanel from './components/ServiceVolumeTiersPanel';
import { AutoCuttingPriceSidebar } from './components/AutoCuttingPriceSidebar';
import { ServiceVariantsTable } from './components/ServiceVariantsTable';
import { ServicesFilters } from './components/ServicesFilters';
import { ServiceCategoryTableSection } from './components/ServiceCategoryTableSection';
import { getServiceVariants } from '../../../services/pricing';
import './ServicesManagement.css';

/** Ключи секций списка услуг (аккордеон по категориям) */
const SVC_SECTION_BINDINGS = 'svc-bindings';
const svcSectionKey = (categoryId: number | null) =>
  categoryId != null ? `svc-cat-${categoryId}` : 'svc-cat-none';

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

const bindingServiceForm: ServiceFormState = {
  ...emptyServiceForm,
  type: 'postprint',
  operationType: 'bind',
  unit: 'per_item',
  hasVariants: true,
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
  const [createMode, setCreateMode] = useState<'service' | 'binding'>('service');
  const [createSubmitting, setCreateSubmitting] = useState(false);
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

  const serviceCategoryAccordionId = useId();
  const [openServiceCategorySections, setOpenServiceCategorySections] = useState<Set<string>>(
    () => new Set()
  );

  const panelIdForServiceSection = useCallback(
    (key: string) => `panel-${serviceCategoryAccordionId}-${key}`.replace(/[:]/g, ''),
    [serviceCategoryAccordionId]
  );

  const toggleServiceCategorySection = useCallback((key: string) => {
    setOpenServiceCategorySections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  const createFormValid = useMemo(() => {
    const f = state.newServiceForm;
    const nameOk = f.name.trim().length > 0;
    const unitOk = (f.unit || '').trim().length > 0;
    const rateNum = Number(f.rate);
    const rateOk = f.rate !== '' && Number.isFinite(rateNum) && rateNum >= 0;
    return nameOk && unitOk && rateOk;
  }, [state.newServiceForm]);

  const handleServiceCreate = useCallback(async () => {
    if (createSubmitting || !createFormValid) return;
    setCreateSubmitting(true);
    try {
      const payload = {
        name: state.newServiceForm.name.trim(),
        type: state.newServiceForm.type || 'postprint',
        unit: state.newServiceForm.unit || 'item',
        rate: Number(state.newServiceForm.rate || 0),
        isActive: state.newServiceForm.isActive,
        hasVariants: state.newServiceForm.hasVariants,
        operationType: state.newServiceForm.operationType || 'other',
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
      };
      const created = createMode === 'binding'
        ? await serviceOperationsRef.current.createBinding(payload)
        : await serviceOperationsRef.current.createService(payload);

      if (created) {
        setShowCreateService(false);
        setCreateMode('service');
        resetNewServiceForm(emptyServiceForm);
      }
    } finally {
      setCreateSubmitting(false);
    }
  }, [createSubmitting, createFormValid, createMode, state.newServiceForm, setShowCreateService, resetNewServiceForm]);

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

  const bindingServices = useMemo(
    () =>
      filteredServices.filter(
        (service) => (service.operationType ?? service.type ?? '').toLowerCase() === 'bind'
      ),
    [filteredServices]
  );

  const nonBindingServices = useMemo(
    () =>
      filteredServices.filter(
        (service) => (service.operationType ?? service.type ?? '').toLowerCase() !== 'bind'
      ),
    [filteredServices]
  );

  // Группировка по категориям для отображения (порядок: по sort_order категорий, затем "Без категории")
  const servicesByCategory = useMemo(() => {
    const order = new Map<number | null, number>();
    categories.forEach((c, i) => order.set(c.id, c.sortOrder ?? i));
    order.set(null, 1e9);
    const groups = new Map<string, { categoryId: number | null; categoryName: string; services: PricingService[] }>();
    for (const s of nonBindingServices) {
      const categoryId = s.categoryId ?? null;
      const categoryName = s.categoryName ?? 'Без категории';
      const key = categoryId !== null ? `id:${categoryId}` : 'none';
      if (!groups.has(key)) groups.set(key, { categoryId, categoryName, services: [] });
      groups.get(key)!.services.push(s);
    }
    return Array.from(groups.values()).sort(
      (a, b) => (order.get(a.categoryId) ?? 1e9) - (order.get(b.categoryId) ?? 1e9)
    );
  }, [nonBindingServices, categories]);

  // Рендеринг действий для строки услуги
  const renderActions = useCallback((service: PricingService) => (
    <div className="services-table__actions">
      <Button variant="secondary" size="sm" onClick={() => openEditService(service)} title="Редактировать услугу">
        <AppIcon name="edit" size="xs" /> Редактировать
      </Button>
      <Button
        variant="secondary"
        size="sm"
        title={service.isActive ? 'Сделать услугу неактивной' : 'Сделать услугу активной'}
        onClick={() => serviceOperationsRef.current.updateService(service.id, { isActive: !service.isActive })}
      >
        {service.isActive ? <><AppIcon name="ban" size="xs" /> Деактивировать</> : <><AppIcon name="check" size="xs" /> Активировать</>}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => handleToggleVolumeTiers(service.id)} title="Объёмы и цены по диапазонам">
        <AppIcon name="chart" size="xs" /> Диапазоны
      </Button>
      <Button
        variant="error"
        size="sm"
        onClick={() => handleServiceDelete(service.id, service.name)}
        title="Удалить услугу"
        aria-label="Удалить услугу"
      >
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
    <div className="services-management sm-workspace">
      {showHeader && (
        <div className="services-header">
          <div className="services-header__title-row">
            <span className="services-header__icon">💰</span>
            <h1 className="services-header__title">Управление услугами</h1>
          </div>
          <p className="services-header__subtitle">Создание услуг и установка базовой стоимости</p>
        </div>
      )}

      <AutoCuttingPriceSidebar />

      {combinedError && (
        <div className="svc-error-banner" role="alert">
          {combinedError}
        </div>
      )}

      {state.success && (
        <Alert type="success" className="sm-flash sm-flash--success">{state.success}</Alert>
      )}

      {servicesLoading ? (
        <div className="sm-loading">
          <div className="sm-loading__inner">
            <div className="sm-loading__spinner" aria-hidden />
            <p className="sm-loading__text">Загрузка услуг…</p>
          </div>
        </div>
      ) : (
        <section className="sm-list-panel" aria-label="Справочник услуг">
          <header className="sm-list-panel__head">
            <h2 className="sm-list-panel__title">Услуги</h2>
            <p className="sm-list-panel__lead">
              Категории, поиск, таблица. Цены вариантов — в строке услуги («Диапазоны» / варианты).
            </p>
          </header>

          <ServiceCategoriesBlock categories={categories} onReload={loadCategories} />

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
            onCreateService={() => {
              setCreateMode('service');
              resetNewServiceForm(emptyServiceForm);
              setShowCreateService(true);
            }}
            onCreateBinding={() => {
              setCreateMode('binding');
              resetNewServiceForm(bindingServiceForm);
              setShowCreateService(true);
            }}
          />

          <p className="sm-hint-line">
            Базовая цена и единица — здесь. Привязка к продуктам — в карточке продукта при настройке.
          </p>

          {filteredServices.length > 0 ? (
            <>
              <div className="services-table-container sm-table-wrap">
                {bindingServices.length > 0 && (
                  <ServiceCategoryTableSection
                    sectionKey={SVC_SECTION_BINDINGS}
                    label="Переплёты"
                    count={bindingServices.length}
                    isOpen={openServiceCategorySections.has(SVC_SECTION_BINDINGS)}
                    onToggle={toggleServiceCategorySection}
                    panelIdFor={panelIdForServiceSection}
                    services={bindingServices}
                    expandedServiceId={state.expandedServiceId}
                    renderExpandedRow={renderExpandedRow}
                    getServiceIcon={getServiceIcon}
                    getServiceTypeLabel={getServiceTypeLabel}
                    getUnitLabel={getUnitLabel}
                    renderActions={renderActions}
                  />
                )}
                {servicesByCategory.map((group) => {
                  const sKey = svcSectionKey(group.categoryId);
                  return (
                    <ServiceCategoryTableSection
                      key={sKey}
                      sectionKey={sKey}
                      label={group.categoryName}
                      count={group.services.length}
                      isOpen={openServiceCategorySections.has(sKey)}
                      onToggle={toggleServiceCategorySection}
                      panelIdFor={panelIdForServiceSection}
                      services={group.services}
                      expandedServiceId={state.expandedServiceId}
                      renderExpandedRow={renderExpandedRow}
                      getServiceIcon={getServiceIcon}
                      getServiceTypeLabel={getServiceTypeLabel}
                      getUnitLabel={getUnitLabel}
                      renderActions={renderActions}
                    />
                  );
                })}
              </div>
              <div className="services-table-footer sm-table-footer">
                <span>
                  Показано: <strong>{filteredServices.length}</strong> из <strong>{services.length}</strong> услуг
                </span>
                <span>Активных: <strong>{services.filter((s) => s.isActive).length}</strong></span>
              </div>
            </>
          ) : (
            <div className="services-empty sm-empty-embedded">
              <div className="services-empty__icon"><AppIcon name="clipboard" size="lg" /></div>
              <h3 className="services-empty__title">
                {state.serviceSearch || state.typeFilter !== 'all' ? 'Ничего не найдено' : 'Нет услуг'}
              </h3>
              <p className="services-empty__message">
                {state.serviceSearch || state.typeFilter !== 'all'
                  ? 'Попробуйте изменить поиск или фильтры'
                  : 'Начните с добавления первой услуги'}
              </p>
              {!state.serviceSearch && state.typeFilter === 'all' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setCreateMode('service');
                    resetNewServiceForm(emptyServiceForm);
                    setShowCreateService(true);
                  }}
                >
                  + Добавить первую услугу
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Модальное окно создания услуги / переплёта */}
      {state.showCreateService && (
        <Modal
          isOpen={true}
          title="Создание записи"
          size="md"
          className="services-create-modal sm-ui-modal"
          onClose={() => {
            setShowCreateService(false);
            setCreateMode('service');
            setCreateSubmitting(false);
            resetNewServiceForm(emptyServiceForm);
          }}
        >
          <div className="services-create-modal__tabs" role="tablist" aria-label="Тип записи">
            <button
              type="button"
              role="tab"
              aria-selected={createMode === 'service'}
              className={`services-create-modal__tab${createMode === 'service' ? ' is-active' : ''}`}
              onClick={() => {
                setCreateMode('service');
                resetNewServiceForm(emptyServiceForm);
              }}
            >
              Услуга
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={createMode === 'binding'}
              className={`services-create-modal__tab${createMode === 'binding' ? ' is-active' : ''}`}
              onClick={() => {
                setCreateMode('binding');
                resetNewServiceForm(bindingServiceForm);
              }}
            >
              Переплёт
            </button>
          </div>
          <p className="services-create-modal__lead">
            {createMode === 'binding'
              ? 'Переплёт попадает в блок «Переплёты», операция на бэкенде — bind. Варианты (сложная услуга) настраиваются после создания.'
              : 'Укажите название, единицу и цену. После создания привяжите услугу к продукту в карточке продукта.'}
          </p>
          <form
            className="services-create-modal__form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleServiceCreate();
            }}
          >
            <ServiceForm
              value={state.newServiceForm}
              onChange={setNewServiceForm}
              categories={categories}
              materials={materials}
              variant={createMode === 'binding' ? 'binding' : 'default'}
              autoFocusName
            />
            <Alert type="info" className="mt-4">
              {createMode === 'binding'
                ? 'Тип postprint и операция bind подставляются автоматически. Категорию при необходимости задайте в «Редактировать».'
                : 'Категория нужна для удобной группировки в списке услуг при настройке продукта.'}
            </Alert>
            <div className="services-create-modal__footer">
              <Button
                variant="secondary"
                type="button"
                disabled={createSubmitting}
                onClick={() => {
                  setShowCreateService(false);
                  setCreateMode('service');
                  resetNewServiceForm(emptyServiceForm);
                }}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                type="submit"
                loading={createSubmitting}
                disabled={!createFormValid}
              >
                Создать
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Модальное окно редактирования услуги */}
      {state.editingService && state.editingServiceForm && (
        <Modal
          isOpen={true}
          title="Редактирование услуги"
          size="md"
          className="services-edit-modal sm-ui-modal"
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
