import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Alert, Modal } from '../../components/common';
import TrimSizeSection from './components/TrimSizeSection';
import PriceRulesSection from './components/PriceRulesSection';
import FinishingSection from './components/FinishingSection';
import PackagingSection from './components/PackagingSection';
import RunSection from './components/RunSection';
import MaterialsSection from './components/MaterialsSection';
import OperationsSection from './components/OperationsSection/OperationsSection';
import AllowedMaterialsSection from './components/AllowedMaterialsSection';
import { AllowedPriceTypesSection } from './components/AllowedPriceTypesSection';
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
import { SimplifiedTemplateSection } from './components/SimplifiedTemplateSection';
import type { SimplifiedChecklistState, SimplifiedEditorTab } from './components/SimplifiedTemplateSection';
import { useSimplifiedTypes } from './hooks/useSimplifiedTypes';
import { useTemplatePricingServices } from './hooks/useTemplatePricingServices';
import { useTemplateAutoSave } from './hooks/useTemplateAutoSave';
import { AppIcon } from '../../components/ui/AppIcon';
import { ProductDuplicateModal } from '../../components/admin/ProductDuplicateModal';
import { TemplateHeaderExtra } from './components/TemplateHeaderExtra';
import { UnsavedChangesBanner } from './components/UnsavedChangesBanner';
import { SimplifiedTemplateSidebar } from './components/SimplifiedTemplateSidebar';
import { useUIStore } from '../../stores/uiStore';


const ProductTemplatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const parsedProductId = id ? Number(id) : NaN;
  const productId = Number.isFinite(parsedProductId) ? parsedProductId : undefined;
  const navigate = useNavigate();
  const categories = useProductDirectoryStore((s) => s.categories);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const fetchProducts = useProductDirectoryStore((s) => s.fetchProducts);
  const showToast = useUIStore((s) => s.showToast);

  useEffect(() => { initializeDirectory() }, [initializeDirectory]);

  // Все useState хуки должны быть объявлены ДО вызова кастомных хуков
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'base' | 'print' | 'materials' | 'pricing' | 'operations' | 'review'>('base');
  const [savingPrintSettings, setSavingPrintSettings] = useState(false);
  const [calcOptionsExpanded, setCalcOptionsExpanded] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [simplifiedEditorTab, setSimplifiedEditorTab] = useState<SimplifiedEditorTab>('print');
  const [simplifiedChecklist, setSimplifiedChecklist] = useState<SimplifiedChecklistState>({
    size: false,
    print: false,
    materials: false,
    finishing: false,
  });

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

  const { simplifiedServices, bindingServices } = useTemplatePricingServices(product?.calculator_type);

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

  const {
    autoSaveStatus,
    hasUnsavedChanges,
    triggerManualSave,
  } = useTemplateAutoSave({
    stateForAutoSave,
    loading,
    saving,
    productId,
    persistTemplateConfig,
  });



  const notFound = !loading && !product;

  const pageTitle = state.meta.name || product?.name || 'Шаблон продукта';
  const pageIcon = state.meta.icon || product?.icon || '';
  const hasTrimConfigured = Boolean(trimWidth && trimHeight && Number(trimWidth) > 0 && Number(trimHeight) > 0);
  const hasParametersConfigured = parameters.length > 0;
  const hasPrintConfigured = Boolean((product as any)?.print_settings && Object.keys((product as any).print_settings || {}).length > 0);
  const hasMaterialsConfigured = materials.length > 0 || (state.constraints.overrides.allowedPaperTypes?.length ?? 0) > 0;
  const hasPricingConfigured = Boolean(state.print_run.enabled || priceRules.length > 0);
  const hasOperationsConfigured = operationsLength > 0;
  type TabState = 'ready' | 'partial' | 'empty';

  const tabStatus = useMemo<Record<'base' | 'print' | 'materials' | 'pricing' | 'operations' | 'review', TabState>>(() => ({
    base: hasTrimConfigured && hasParametersConfigured ? 'ready' : (hasTrimConfigured || hasParametersConfigured ? 'partial' : 'empty'),
    print: hasPrintConfigured ? 'ready' : 'partial',
    materials: hasMaterialsConfigured ? 'ready' : 'empty',
    pricing: hasPricingConfigured ? 'ready' : 'partial',
    operations: hasOperationsConfigured ? 'ready' : 'empty',
    review: hasTrimConfigured && hasParametersConfigured && hasMaterialsConfigured && hasOperationsConfigured ? 'ready' : 'partial',
  }), [
    hasMaterialsConfigured,
    hasOperationsConfigured,
    hasParametersConfigured,
    hasPricingConfigured,
    hasPrintConfigured,
    hasTrimConfigured,
  ]);

  const tabStatusLabel: Record<TabState, string> = {
    ready: 'Готово',
    partial: 'Частично',
    empty: 'Пусто',
  };
  const tabStatusColor: Record<TabState, string> = {
    ready: '#10b981',
    partial: '#f59e0b',
    empty: '#94a3b8',
  };

  return (
    <AdminPageLayout
      title={pageTitle}
      icon={pageIcon}
      onBack={() => navigate('/adminpanel/products')}
      className="product-template-page"
      headerExtra={(
        <TemplateHeaderExtra
          product={product}
          hasUnsavedChanges={hasUnsavedChanges}
          autoSaveStatus={autoSaveStatus}
          onOpenMeta={() => setShowMetaModal(true)}
          onOpenDuplicate={() => setDuplicateModalOpen(true)}
        />
      )}
    >
    <div className="product-template product-template--admin-layout">
      <UnsavedChangesBanner
        visible={hasUnsavedChanges}
        saving={saving}
        onSave={() => triggerManualSave('Шаблон сохранён')}
      />

      {product?.calculator_type === 'simplified' ? (
        <div className="product-template__body product-template__body--simplified-with-sidebar">
          <SimplifiedTemplateSidebar
            product={product}
            icon={state.meta.icon}
            name={state.meta.name}
            summaryStats={summaryStats}
            value={state.simplified}
            onChange={handleSimplifiedChange}
            calcOptionsExpanded={calcOptionsExpanded}
            onToggleCalcOptions={() => setCalcOptionsExpanded((v) => !v)}
            types={simplifiedTypes}
            onSelectType={handleSelectType}
            services={simplifiedServices}
            allMaterials={allMaterials as any}
          />

          <section className="product-template__main">
            {loading && <Alert type="info">Загружаем данные шаблона…</Alert>}
            {!loading && (
              <>
                {simplifiedEditorTab === 'check' && (
                  <div className="simplified-checklist-hint">
                    {[
                      { ok: simplifiedChecklist.size, label: 'Размер' },
                      { ok: simplifiedChecklist.print, label: 'Печать' },
                      { ok: simplifiedChecklist.materials, label: 'Материалы' },
                      { ok: simplifiedChecklist.finishing, label: 'Отделка' },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={`simplified-checklist-hint__item ${item.ok ? 'is-ok' : 'is-missing'}`}
                        title={item.ok ? `${item.label}: готово` : `${item.label}: требует настройки`}
                      >
                        <span>{item.ok ? '✓' : '•'}</span>
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                <SimplifiedTemplateSection
                  value={state.simplified}
                  onChange={handleSimplifiedChange}
                  onSave={() => void persistTemplateConfig('Шаблон упрощённого калькулятора сохранён')}
                  saving={saving}
                  allMaterials={allMaterials as any}
                  showPagesConfig={product?.product_type === 'multi_page'}
                  types={simplifiedTypes}
                  services={simplifiedServices}
                  productId={productId}
                  bindingServices={bindingServices}
                  onEditorTabChange={setSimplifiedEditorTab}
                  onChecklistChange={setSimplifiedChecklist}
                />
              </>
            )}
          </section>
        </div>
      ) : (
      <>
        {/* Локальные вкладки для разделения основных настроек, материалов и тиража */}
        <div className="product-tabs">
          <button
            type="button"
            className={`product-tab ${activeTab === 'base' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('base')}
          >
            База <span style={{ color: tabStatusColor[tabStatus.base], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.base]}</span>
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'print' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('print')}
          >
            Печать <span style={{ color: tabStatusColor[tabStatus.print], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.print]}</span>
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'materials' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('materials')}
          >
            Материалы <span style={{ color: tabStatusColor[tabStatus.materials], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.materials]}</span>
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'pricing' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('pricing')}
          >
            Тираж и цена <span style={{ color: tabStatusColor[tabStatus.pricing], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.pricing]}</span>
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'operations' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('operations')}
          >
            Операции <span style={{ color: tabStatusColor[tabStatus.operations], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.operations]}</span>
          </button>
          <button
            type="button"
            className={`product-tab ${activeTab === 'review' ? 'product-tab--active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            Проверка <span style={{ color: tabStatusColor[tabStatus.review], marginLeft: 6, fontSize: 11 }}>{tabStatusLabel[tabStatus.review]}</span>
          </button>
        </div>

        {notFound && (
          <Alert type="error">Продукт не найден или недоступен.</Alert>
        )}

        <div className="product-template__body">
          <aside className="product-template__sidebar">
            <div className="template-summary-card">
              <div className="template-summary-card__icon">
                {product?.image_url ? (
                  <img
                    src={product.image_url}
                    alt={state.meta.name || product?.name || 'Изображение продукта'}
                    className="template-summary-card__image"
                  />
                ) : (
                  state.meta.icon || product?.icon || <AppIcon name="package" size="md" />
                )}
              </div>
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
                {activeTab === 'base' && (
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

              {/* Секция: Тираж и правила цены */}
              {activeTab === 'pricing' && (
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
                  <div className="template-section" id="section-price-rules">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Правила цены</h3>
                    </div>
                    <div className="template-section__content">
                      <PriceRulesSection
                        rules={state.price_rules}
                        saving={saving}
                        onChangeRule={(index, patch) => {
                          if (index < 0) {
                            dispatch({ type: 'addRule', rule: patch as any });
                            return;
                          }
                          dispatch({ type: 'updateRule', index, patch });
                        }}
                        onRemoveRule={(index) => dispatch({ type: 'removeRule', index })}
                        onSave={() => void persistTemplateConfig('Правила цены сохранены')}
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
                        <h4 className="materials-column__title" style={{ marginTop: '24px' }}>Разрешенные типы цен</h4>
                        <AllowedPriceTypesSection
                          selectedKeys={state.constraints.overrides.allowedPriceTypes ?? ['standard', 'online']}
                          saving={saving}
                          onChange={(keys) => dispatch({ type: 'setOverrides', patch: { allowedPriceTypes: keys } })}
                          onSave={() => void persistTemplateConfig('Разрешённые типы цен сохранены')}
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

              {activeTab === 'review' && (
                <div className="template-sections-list">
                  <div className="template-section">
                    <div className="template-section__header">
                      <h3 className="template-section__title">Проверка настройки листового шаблона</h3>
                      <p className="template-section__description">
                        Быстрый чек перед запуском продукта в работу.
                      </p>
                    </div>
                    <div className="template-section__content">
                      {[
                        { ok: hasTrimConfigured, label: 'Формат (ширина/высота) задан' },
                        { ok: hasParametersConfigured, label: 'Параметры калькулятора добавлены' },
                        { ok: hasPrintConfigured, label: 'Настройки печати заданы' },
                        { ok: hasMaterialsConfigured, label: 'Материалы или типы бумаги настроены' },
                        { ok: hasPricingConfigured, label: 'Тираж/правила цены настроены' },
                        { ok: hasOperationsConfigured, label: 'Операции добавлены' },
                      ].map((item) => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ color: item.ok ? '#10b981' : '#ef4444', fontWeight: 700 }}>{item.ok ? '✓' : '×'}</span>
                          <span>{item.label}</span>
                        </div>
                      ))}
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

      <ProductDuplicateModal
        visible={duplicateModalOpen && !!product}
        source={product && duplicateModalOpen ? { id: product.id, name: product.name } : null}
        onClose={() => setDuplicateModalOpen(false)}
        extraHint="В копию попадает версия шаблона из базы (последнее сохранение). Несохранённые на этой странице правки в копию не попадут."
        onDuplicated={async (newId) => {
          await fetchProducts(true);
          showToast('Копия продукта создана', 'success');
          navigate(`/adminpanel/products/${newId}/template`);
        }}
      />
    </div>
    </AdminPageLayout>
  );
};

export default ProductTemplatePage;

