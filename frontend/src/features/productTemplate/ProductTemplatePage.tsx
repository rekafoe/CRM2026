import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, StatusBadge, Alert, Modal } from '../../components/common';
import { useDebounce } from '../../hooks/useDebounce';
import TrimSizeSection from './components/TrimSizeSection';
import PriceRulesSection from './components/PriceRulesSection';
import FinishingSection from './components/FinishingSection';
import PackagingSection from './components/PackagingSection';
import RunSection from './components/RunSection';
import MaterialsSection from './components/MaterialsSection';
import OperationsSection from './components/OperationsSection/OperationsSection';
import PrintSheetSection from './components/PrintSheetSection';
import AllowedMaterialsSection from './components/AllowedMaterialsSection';
import ParametersSection from './components/ParametersSection';
import MetaSection from './components/MetaSection';
import { ProductSetupStatus } from '../../components/admin/ProductSetupStatus';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import './ProductTemplateLayout.css';
import useProductTemplatePage from './hooks/useProductTemplatePage';
import { useProductOperations } from './hooks/useProductOperations';
import { PrintTab, ProductPrintSettings } from '../../pages/admin/product-edit/PrintTab';
import { updateProduct } from '../../services/products';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { SimplifiedTemplateSection, type ServiceRow } from './components/SimplifiedTemplateSection';
import { useSimplifiedTypes } from './hooks/useSimplifiedTypes';
import { ProductTypesCard } from './components/ProductTypesCard';
import { api } from '../../api';
import { AppIcon } from '../../components/ui/AppIcon';


const ProductTemplatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const parsedProductId = id ? Number(id) : NaN;
  const productId = Number.isFinite(parsedProductId) ? parsedProductId : undefined;
  const navigate = useNavigate();
  const categories = useProductDirectoryStore((s) => s.categories);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);

  useEffect(() => { initializeDirectory() }, [initializeDirectory]);

  // Все useState хуки должны быть объявлены ДО вызова кастомных хуков
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'materials' | 'run' | 'operations' | 'print'>('main');
  const [savingPrintSettings, setSavingPrintSettings] = useState(false);
  const isInitialLoadRef = useRef(true);
  const lastSavedStateRef = useRef<string>('');
  const autoSaveInProgressRef = useRef(false);

  // Кастомные хуки - ВАЖНО: порядок должен быть всегда одинаковым!
  const pageData = useProductTemplatePage(productId);
  const operations = useProductOperations(productId, pageData.handleBulkAddOperations);

  // Деструктурируем после всех хуков
  const {
    state,
    dispatch,
    product,
    templateConfigId,
    loading,
    loadingLists,
    saving,
    parameters,
    materials,
    allMaterials,
    parameterPresets,
    parameterPresetsLoading,
    summaryStats,
    persistTemplateConfig,
    persistTrimSizeWithFormat,
    handleMetaSave,
    handleAddMaterial,
    handleUpdateMaterialQuantity,
    handleBulkAddMaterials,
    handleBulkAddOperations,
    handleRemoveMaterial,
    handleAddParameter,
    handleUpdateParameter,
    handleRemoveParameter
  } = pageData;

  const trimWidth = state.trim_size.width;
  const trimHeight = state.trim_size.height;
  const priceRules = state.price_rules;
  
  // Используем безопасное значение для operations, чтобы избежать проблем с порядком хуков
  const operationsLength = operations?.productOperations?.length ?? 0;

  // --- Simplified product: lifted state ---
  const handleSimplifiedChange = useCallback(
    (next: any) => dispatch({ type: 'setSimplified', value: next }),
    [dispatch],
  );
  const simplifiedTypes = useSimplifiedTypes(state.simplified, handleSimplifiedChange);

  const [simplifiedServices, setSimplifiedServices] = useState<ServiceRow[]>([]);
  useEffect(() => {
    if (product?.calculator_type !== 'simplified') return;
    let cancelled = false;
    api.get('/pricing/services').then(r => {
      const data = (r.data as any)?.data ?? r.data ?? [];
      const arr = Array.isArray(data) ? data : [];
      const filtered = arr.filter((s: any) => {
        if (!s || !s.id || !s.name) return false;
        const excludedTypes = new Set(['print', 'printing']);
        const opType = String(s.operation_type ?? s.operationType ?? s.type ?? s.service_type ?? '').toLowerCase();
        if (!opType) return true;
        return !excludedTypes.has(opType);
      });
      if (!cancelled) setSimplifiedServices(filtered);
    }).catch(err => console.error('Ошибка загрузки услуг:', err));
    return () => { cancelled = true; };
  }, [product?.calculator_type]);

  const handleSelectType = useCallback(
    (typeId: any) => {
      simplifiedTypes.setSelectedTypeId(typeId);
      const cfg = state.simplified.typeConfigs?.[String(typeId)]?.sizes ?? [];
      simplifiedTypes.setSelectedSizeId(cfg[0]?.id ?? null);
    },
    [state.simplified.typeConfigs, simplifiedTypes],
  );

  // Автосохранение: отслеживаем изменения state с debounce
  const stateForAutoSave = useMemo(() => ({
    trim_size: state.trim_size,
    print_sheet: state.print_sheet,
    print_run: state.print_run,
    finishing: state.finishing,
    packaging: state.packaging,
    price_rules: state.price_rules,
    constraints: state.constraints
  }), [state.trim_size, state.print_sheet, state.print_run, state.finishing, state.packaging, state.price_rules, state.constraints]);

  const debouncedState = useDebounce(stateForAutoSave, 2500); // Сохраняем через 2.5 секунды после последнего изменения

  // Автосохранение при изменениях (оптимизированное)
  useEffect(() => {
    // Пропускаем первую загрузку
    if (isInitialLoadRef.current) {
      if (!loading) {
        isInitialLoadRef.current = false;
        // Сохраняем начальное состояние после загрузки
        lastSavedStateRef.current = JSON.stringify(debouncedState);
      }
      return;
    }

    // Не сохраняем, если еще загружаемся или уже сохраняем
    if (loading || saving || !productId || autoSaveInProgressRef.current) {
      return;
    }

    // Проверяем, изменилось ли состояние
    const currentStateString = JSON.stringify(debouncedState);
    const hasChanges = currentStateString !== lastSavedStateRef.current;
    setHasUnsavedChanges(hasChanges);
    
    if (!hasChanges) {
      return; // Нет изменений, не сохраняем
    }

    // Автосохранение
    const autoSave = async () => {
      if (autoSaveInProgressRef.current) return;
      
      try {
        autoSaveInProgressRef.current = true;
        setAutoSaveStatus('saving');
        await persistTemplateConfig(''); // Пустое сообщение, чтобы не показывать alert
        
        // Обновляем последнее сохраненное состояние только после успешного сохранения
        lastSavedStateRef.current = currentStateString;
        setHasUnsavedChanges(false);
        
        setAutoSaveStatus('saved');
        // Через 2 секунды убираем индикатор "Сохранено"
        setTimeout(() => {
          setAutoSaveStatus(prev => prev === 'saved' ? 'idle' : prev);
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 3000);
      } finally {
        autoSaveInProgressRef.current = false;
      }
    };

    void autoSave();
  }, [debouncedState, loading, saving, productId, persistTemplateConfig]);



  const notFound = !loading && !product;

  const pageTitle = state.meta.name || product?.name || 'Шаблон продукта';
  const pageIcon = state.meta.icon || product?.icon || '';

  return (
    <AdminPageLayout
      title={pageTitle}
      icon={pageIcon}
      onBack={() => navigate('/adminpanel/products')}
      className="product-template-page"
      headerExtra={(
        <>
          {product && (
            <StatusBadge
              status={product.is_active ? 'Активен' : 'Отключен'}
              color={product.is_active ? 'success' : 'error'}
              size="sm"
            />
          )}
          {!hasUnsavedChanges && autoSaveStatus !== 'idle' && (
            <div className="auto-save-indicator" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: autoSaveStatus === 'saved' ? '#10b981' : autoSaveStatus === 'error' ? '#ef4444' : '#64748b'
            }}>
              {autoSaveStatus === 'saving' && <span><AppIcon name="save" size="xs" /> Сохранение...</span>}
              {autoSaveStatus === 'saved' && <span><AppIcon name="check" size="xs" /> Сохранено</span>}
              {autoSaveStatus === 'error' && <span><AppIcon name="warning" size="xs" /> Ошибка сохранения</span>}
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowMetaModal(true)}
            icon={<span style={{ marginRight: '4px' }}><AppIcon name="edit" size="xs" /></span>}
          >
            Основные поля
          </Button>
        </>
      )}
    >
    <div className="product-template product-template--admin-layout">
      {/* Баннер несохранённых изменений, как в старой CRM */}
      {hasUnsavedChanges && (
        <div className="unsaved-changes-banner">
          <div className="unsaved-changes-banner__content">
            <span className="unsaved-changes-banner__text">Появились несохраненные изменения</span>
            <Button 
              variant="primary" 
              size="sm"
              onClick={async () => {
                setAutoSaveStatus('saving');
                await persistTemplateConfig('Шаблон сохранён');
                setAutoSaveStatus('saved');
                setHasUnsavedChanges(false);
                setTimeout(() => setAutoSaveStatus('idle'), 2000);
              }} 
              disabled={saving}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}

      {product?.calculator_type === 'simplified' ? (
        <div className="product-template__body product-template__body--simplified-with-sidebar">
          <aside className="product-template__sidebar">
            <div className="template-summary-card">
              <div className="template-summary-card__icon">{state.meta.icon || product?.icon || <AppIcon name="package" size="md" />}</div>
              <div className="template-summary-card__name">{state.meta.name || product?.name || 'Без названия'}</div>
              <ul className="template-summary-card__list">
                {summaryStats.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
              </ul>
              <div className="template-summary-card__meta">
                Создан: {product?.created_at ? new Date(product.created_at).toLocaleDateString() : '—'}
              </div>
            </div>

            <div className="simplified-card">
              <div className="simplified-card__header">
                <div>
                  <strong>Опции калькулятора</strong>
                  <div className="text-muted text-sm">Чекбоксы, доступные при расчёте.</div>
                </div>
              </div>
              <div className="simplified-card__content">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={state.simplified.use_layout !== false}
                    onChange={(e) => handleSimplifiedChange({ ...state.simplified, use_layout: e.target.checked })}
                  />
                  Раскладка на лист
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={!!state.simplified.cutting}
                    onChange={(e) => handleSimplifiedChange({ ...state.simplified, cutting: e.target.checked })}
                  />
                  Резка стопой
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={state.simplified.duplex_as_single_x2 === true}
                    onChange={(e) => handleSimplifiedChange({ ...state.simplified, duplex_as_single_x2: e.target.checked })}
                  />
                  Дуплекс как 2×односторонняя
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={state.simplified.include_material_cost !== false}
                    onChange={(e) => handleSimplifiedChange({ ...state.simplified, include_material_cost: e.target.checked })}
                  />
                  Учитывать стоимость материалов
                </label>
              </div>
            </div>

            <ProductTypesCard
              value={state.simplified}
              onChange={handleSimplifiedChange}
              selectedTypeId={simplifiedTypes.selectedTypeId}
              onSelectType={handleSelectType}
              onAddType={simplifiedTypes.addType}
              setDefaultType={simplifiedTypes.setDefaultType}
              removeType={simplifiedTypes.removeType}
              services={simplifiedServices}
              allMaterials={allMaterials as any}
            />
          </aside>

          <section className="product-template__main">
            {loading && <Alert type="info">Загружаем данные шаблона…</Alert>}
            {!loading && (
              <SimplifiedTemplateSection
                value={state.simplified}
                onChange={handleSimplifiedChange}
                onSave={() => void persistTemplateConfig('Шаблон упрощённого калькулятора сохранён')}
                saving={saving}
                allMaterials={allMaterials as any}
                showPagesConfig={product?.product_type === 'multi_page'}
                types={simplifiedTypes}
                services={simplifiedServices}
              />
            )}
          </section>
        </div>
      ) : (
      <>
        {/* Локальные вкладки для разделения основных настроек, материалов и тиража */}
        <div className="product-tabs">
          <button
            type="button"
            className={`product-tab ${activeTab === 'main' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('main')}
          >
            Основные настройки
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'run' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('run')}
          >
            Тираж
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'operations' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('operations')}
          >
            Операции и цена
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'materials' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('materials')}
          >
            Материалы
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'print' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('print')}
          >
            Печать
          </button>
        </div>

        {notFound && (
          <Alert type="error">Продукт не найден или недоступен.</Alert>
        )}

        <div className="product-template__body">
          <aside className="product-template__sidebar">
            <div className="template-summary-card">
              <div className="template-summary-card__icon">{state.meta.icon || product?.icon || <AppIcon name="package" size="md" />}</div>
              <div className="template-summary-card__name">{state.meta.name || product?.name || 'Без названия'}</div>
              <ul className="template-summary-card__list">
                {summaryStats.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))}
              </ul>
              <div className="template-summary-card__meta">
                Создан: {product?.created_at ? new Date(product.created_at).toLocaleDateString() : '—'}
              </div>
                </div>

            {productId && (
              <ProductSetupStatus 
                productId={productId}
                onStatusChange={() => {
                  // Можно добавить обновление данных продукта при изменении статуса
                  console.log('Setup status changed');
                }}
              />
            )}

          </aside>

          <section className="product-template__main">
            {loading && <Alert type="info">Загружаем данные шаблона…</Alert>}
            {!loading && (
              <>
                {loadingLists && <Alert type="info">Обновляем связанные списки…</Alert>}
                {/* Основные секции */}
                {activeTab === 'main' && (
                  <div className="template-sections-list">
                    {/* Секция: Формат в сложенном виде */}
                    <div className="template-section template-section--trim" id="section-format">
                      <div className="template-section__header">
                        <h3 className="template-section__title">Формат в сложенном виде</h3>
                      </div>
                      <div className="template-section__content">
                        <TrimSizeSection
                          trimWidth={trimWidth}
                          trimHeight={trimHeight}
                          saving={saving}
                          existingFormats={(() => {
                            // Извлекаем список форматов из параметра "format"
                            const formatParam = parameters.find(p => p.name === 'format');
                            if (formatParam && formatParam.options) {
                              if (Array.isArray(formatParam.options)) {
                                return formatParam.options;
                              }
                              // Если options - строка, пытаемся распарсить
                              try {
                                const parsed = typeof formatParam.options === 'string' 
                                  ? JSON.parse(formatParam.options) 
                                  : formatParam.options;
                                return Array.isArray(parsed) ? parsed : [];
                              } catch {
                                return [];
                              }
                            }
                            return [];
                          })()}
                          onChange={(field, value) => dispatch({ type: 'setTrim', field, value })}
                          onSave={() => void persistTrimSizeWithFormat('Формат сохранён и добавлен в параметры калькулятора')}
                        />
                      </div>
                    </div>

                  {/* Секция: Параметры продукта */}
                  <div className="template-section template-section--parameters" id="section-parameters">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Параметры продукта</h3>
                      <p className="template-section__description">
                        Настройте параметры, которые клиент будет выбирать в калькуляторе
                      </p>
                    </div>
                    <div className="template-section__content">
                      <ParametersSection
                        parameters={parameters}
                        presets={parameterPresets}
                        presetsLoading={parameterPresetsLoading}
                        onAddParam={handleAddParameter}
                        onDeleteParam={handleRemoveParameter}
                        onUpdateParam={handleUpdateParameter}
                        productType={product?.product_type}
                      />
                    </div>
                  </div>

                  {/* Секция: Отделка */}
                  <div className="template-section" id="section-finishing">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Отделка</h3>
                    </div>
                    <div className="template-section__content">
                      <FinishingSection
                        items={state.finishing}
                        saving={saving}
                        onChange={(items) => dispatch({ type: 'setFinishing', value: items })}
                        onSave={() => void persistTemplateConfig('Отделка сохранена')}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Секция: Тираж */}
              {activeTab === 'run' && (
                <div className="template-sections-list">
                  <div className="template-section" id="section-run">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Тираж</h3>
                    </div>
                    <div className="template-section__content">
                      <RunSection
                        enabled={state.print_run.enabled}
                        min={state.print_run.min}
                        max={state.print_run.max}
                        saving={saving}
                        onChange={(patch) => dispatch({ type: 'setRun', patch })}
                        onSave={() => void persistTemplateConfig('Диапазон тиражей сохранён')}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Вкладка с материалами */}
              {activeTab === 'materials' && (
                <div className="template-sections-list template-sections-list--full-width">
                  <div className="template-section template-section--collapsible template-section--full-width" id="section-materials">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Материалы {materials.length > 0 && `(${materials.length})`}</h3>
                    </div>
                    <div className="template-section__content template-section__content--two-columns">
                      <div className="materials-column">
                        <h4 className="materials-column__title">Разрешенные типы материалов</h4>
                        <AllowedMaterialsSection
                          selectedPaperTypes={state.constraints.overrides.allowedPaperTypes || []}
                          saving={saving}
                          onChange={(paperTypes) => dispatch({ type: 'setOverrides', patch: { allowedPaperTypes: paperTypes } })}
                          onSave={() => void persistTemplateConfig('Разрешённые типы бумаги сохранены')}
                        />
                      </div>
                      <div className="materials-column">
                        <h4 className="materials-column__title">Плотности материалов</h4>
                        <MaterialsSection
                          materials={materials}
                          allMaterials={allMaterials}
                          productId={productId}
                          allowedPaperTypes={state.constraints.overrides.allowedPaperTypes || []}
                          onAdd={handleAddMaterial}
                          onUpdate={handleUpdateMaterialQuantity}
                          onBulkAdd={handleBulkAddMaterials}
                          onRemove={handleRemoveMaterial}
                          productType={product?.product_type}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Вкладка с настройками печати */}
              {activeTab === 'print' && productId && (
                <PrintTab
                  productId={productId}
                  product={product}
                  saving={savingPrintSettings}
                  onSave={async (settings: ProductPrintSettings) => {
                    if (!productId) return;
                    try {
                      setSavingPrintSettings(true);
                      await updateProduct(productId, { print_settings: settings } as any);
                      alert('Настройки печати сохранены');
                      // Перезагружаем данные продукта
                      window.location.reload();
                    } catch (error) {
                      console.error(error);
                      alert('Ошибка сохранения настроек печати');
                    } finally {
                      setSavingPrintSettings(false);
                    }
                  }}
                />
              )}

              {/* Вкладка с операциями и ценой */}
              {activeTab === 'operations' && (
                <div className="template-sections-list">
                  <div className="template-section" id="section-operations">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Операции и расчет цены</h3>
                      <p className="template-section__description">
                        Настройте операции для расчета стоимости. Используйте условия для применения операций в зависимости от параметров.
                      </p>
                    </div>
                    <div className="template-section__content">
                      <OperationsSection
                        productOperations={operations.productOperations}
                        availableOperations={operations.availableOperations}
                        selectedOperationId={operations.selectedOperationId}
                        addingOperation={operations.addingOperation}
                        deletingOperationId={operations.deletingOperationId}
                        operationError={operations.operationError}
                        showBulkModal={operations.showBulkModal}
                        bulkSelected={operations.bulkSelected}
                        bulkRequired={operations.bulkRequired}
                        bulkAdding={operations.bulkAdding}
                        parameters={parameters}
                        materials={allMaterials}
                        productType={product?.product_type}
                        onSelectOperation={operations.setSelectedOperationId}
                        onAddOperation={operations.handleAddOperation}
                        onRemoveOperation={operations.handleRemoveOperation}
                        onUpdateOperation={operations.handleUpdateOperation}
                        onShowBulkModal={operations.setShowBulkModal}
                        onBulkSelectedChange={operations.setBulkSelected}
                        onBulkRequiredChange={operations.setBulkRequired}
                        onBulkAdd={operations.handleBulkAdd}
                        onErrorDismiss={() => operations.setOperationError(null)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      </>
      )}

      <Modal
        isOpen={showMetaModal}
        onClose={() => setShowMetaModal(false)}
        title="Основные поля продукта"
        size="lg"
      >
        <MetaSection
          name={state.meta.name}
          description={state.meta.description}
          icon={state.meta.icon}
          operator_percent={state.meta.operator_percent}
          category_id={state.meta.category_id}
          categories={categories}
          saving={saving}
          onChange={(patch) => dispatch({ type: 'setMeta', patch })}
          onSave={async () => {
            await handleMetaSave();
            setShowMetaModal(false);
          }}
        />
      </Modal>
    </div>
    </AdminPageLayout>
  );
};

export default ProductTemplatePage;

