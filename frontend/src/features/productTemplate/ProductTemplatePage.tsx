import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, StatusBadge, Alert, Modal } from '../../components/common';
import { useDebounce } from '../../hooks/useDebounce';
import '../../components/admin/ProductManagement.css';
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
import { ProductSetupWizard } from './components/ProductSetupWizard';
import './ProductTemplateLayout.css';
import useProductTemplatePage from './hooks/useProductTemplatePage';
import { useProductOperations } from './hooks/useProductOperations';
import { PrintTab, ProductPrintSettings } from '../../pages/admin/product-edit/PrintTab';
import { updateProduct } from '../../services/products';


const ProductTemplatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const parsedProductId = id ? Number(id) : NaN;
  const productId = Number.isFinite(parsedProductId) ? parsedProductId : undefined;
  const navigate = useNavigate();

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

  // Обработчик навигации из мастера настройки
  const handleWizardNavigate = (tab: string) => {
    const sectionMap: Record<string, string> = {
      'structure': 'section-format',
      'materials': 'section-materials',
      'operations': 'section-operations',
      'pricing': 'section-pricing',
      'parameters': 'section-parameters',
      'finishing': 'section-finishing',
      'run': 'section-run'
    };

    // Переключаем вкладку в зависимости от секции
    if (tab === 'materials') {
      setActiveTab('materials');
    } else if (tab === 'run') {
      setActiveTab('run');
    } else {
      setActiveTab('main');
    }

    const sectionId = sectionMap[tab];
    if (sectionId) {
      // Дадим React время переключить вкладку, затем скроллим
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  };

  return (
    <div className="product-template">
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

      <div className="product-template__header">
        <div className="product-template__header-left">
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => navigate('/adminpanel/products')}
            style={{ marginRight: '16px' }}
          >
            ← Назад
          </Button>
          <div className="product-template__title">
            <span className="product-template__icon">{state.meta.icon || product?.icon || '📦'}</span>
            <div>
              <h2>{state.meta.name || product?.name || 'Без названия'}</h2>
            </div>
          </div>
        </div>
        <div className="product-template__header-right">
          {product && (
            <StatusBadge
              status={product.is_active ? 'Активен' : 'Отключен'}
              color={product.is_active ? 'success' : 'error'}
              size="sm"
            />
          )}
          {/* Индикатор автосохранения (скрыт, если есть баннер) */}
          {!hasUnsavedChanges && autoSaveStatus !== 'idle' && (
            <div className="auto-save-indicator" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              fontSize: '12px',
              color: autoSaveStatus === 'saved' ? '#10b981' : autoSaveStatus === 'error' ? '#ef4444' : '#64748b'
            }}>
              {autoSaveStatus === 'saving' && <span>💾 Сохранение...</span>}
              {autoSaveStatus === 'saved' && <span>✅ Сохранено</span>}
              {autoSaveStatus === 'error' && <span>⚠️ Ошибка сохранения</span>}
            </div>
          )}
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => setShowMetaModal(true)}
            icon={<span style={{ marginRight: '4px' }}>✏️</span>}
          >
            Основные поля
          </Button>
        </div>
      </div>

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
            <div className="template-summary-card__icon">{state.meta.icon || product?.icon || '📦'}</div>
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
          saving={saving}
          onChange={(patch) => dispatch({ type: 'setMeta', patch })}
          onSave={async () => {
            await handleMetaSave();
            setShowMetaModal(false);
          }}
        />
      </Modal>

      {productId && (
        <ProductSetupWizard
          productId={productId}
          onNavigateToStep={handleWizardNavigate}
          onComplete={() => {
            // Можно обновить данные после завершения настройки
            console.log('Setup wizard completed');
          }}
        />
      )}
    </div>
  );
};

export default ProductTemplatePage;

