import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Alert, StatusBadge } from '../../components/common';
import './product-edit/ProductEditPage.css';
import { updateProduct } from '../../services/products';
import usePricingServices from '../../hooks/pricing/usePricingServices';
import { useProductEditData } from './product-edit/useProductEditData';
import { useProductServices } from './product-edit/useProductServices';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { InfoTab } from './product-edit/InfoTab';
import { ServicesTab } from './product-edit/ServicesTab';
import { MaterialsTab } from './product-edit/MaterialsTab';
import { PrintTab, ProductPrintSettings } from './product-edit/PrintTab';
import { PriceTypesTab } from './product-edit/PriceTypesTab';
import { AddServiceModal } from './product-edit/AddServiceModal';
import { ProductDuplicateModal, productCanBeDuplicated } from '../../components/admin/ProductDuplicateModal';
import { useUIStore } from '../../stores/uiStore';

interface ProductDto {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  icon?: string;
  calculator_type?: string;
  product_type?: string;
  operator_percent?: number;
  is_active?: boolean;
}

const ProductEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const productId = useMemo(() => Number(id), [id]);

  const categories = useProductDirectoryStore((s) => s.categories);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const fetchProducts = useProductDirectoryStore((s) => s.fetchProducts);
  const showToast = useUIStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<'info' | 'services' | 'materials' | 'print' | 'priceTypes'>('info');
  const [savingPrintSettings, setSavingPrintSettings] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    description?: string;
    icon?: string;
    image_url?: string;
    calculator_type?: string;
    product_type?: string;
    category_id?: number;
    operator_percent?: string;
    route_key?: string;
  }>({ name: '' });
  const [saving, setSaving] = useState(false);
  const savePriceTypesRef = useRef<(() => Promise<void>) | null>(null);
  const registerPriceTypesSave = useCallback((fn: (() => Promise<void>) | null) => {
    savePriceTypesRef.current = fn;
  }, []);

  const {
    loading,
    unauthorized,
    product,
    materials,
    reloadData,
  } = useProductEditData(productId);

  const {
    productServicesLinks,
    servicesError,
    serviceAction,
    handleAddService,
    handleRemoveService,
    refreshProductServices,
  } = useProductServices(productId);

  const {
    services: availableServices,
    loading: servicesLoading,
    error: pricingServicesError,
  } = usePricingServices(true);

  const combinedServicesError = servicesError || pricingServicesError;

  const assignedServiceIds = useMemo(
    () => new Set(productServicesLinks.map((svc) => svc.service_id)),
    [productServicesLinks]
  );

  useEffect(() => { void initializeDirectory(); }, [initializeDirectory]);

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name || '',
      description: product.description || '',
      icon: product.icon || '',
      image_url: (product as any)?.image_url || '',
      calculator_type: (product as any)?.calculator_type || '',
      product_type: (product as any)?.product_type || '',
      category_id: (product as any)?.category_id,
      operator_percent: (product as any)?.operator_percent !== undefined ? String((product as any)?.operator_percent) : '',
      route_key: (product as any)?.route_key != null ? String((product as any).route_key) : '',
    });
  }, [product]);

  const handleSaveProduct = useCallback(async () => {
    if (!productId || !form.name) return;
    try {
      setSaving(true);
      const { name, description, icon, image_url, calculator_type, product_type, operator_percent, category_id, route_key } = form;
      const resolvedCalculatorType = product_type === 'multi_page' ? 'simplified' : calculator_type;
      const operatorPercentValue = operator_percent !== undefined && operator_percent !== ''
        ? Number(operator_percent)
        : undefined;
      await updateProduct(productId, {
        name,
        description,
        icon,
        image_url: image_url || undefined,
        calculator_type: resolvedCalculatorType,
        product_type,
        category_id: category_id ?? null,
        route_key: route_key?.trim() ? route_key.trim().toLowerCase() : null,
        ...(operatorPercentValue !== undefined && Number.isFinite(operatorPercentValue)
          ? { operator_percent: operatorPercentValue }
          : {}),
      } as any);
      if (activeTab === 'priceTypes' && savePriceTypesRef.current) {
        await savePriceTypesRef.current();
      }
      await reloadData();
      alert('Сохранено');
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [productId, form.name, form.description, form.icon, form.image_url, form.calculator_type, form.product_type, form.operator_percent, form.category_id, form.route_key, reloadData, activeTab]);

  const handleFormChange = useCallback((field: string, value: string) => {
    if (field === 'category_id') {
      setForm((prev) => ({ ...prev, category_id: value ? Number(value) : undefined }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSavePrintSettings = useCallback(async (settings: ProductPrintSettings) => {
    if (!productId) return;
    try {
      setSavingPrintSettings(true);
      await updateProduct(productId, { print_settings: settings } as any);
      alert('Настройки печати сохранены');
      // Перезагружаем данные продукта
      window.location.reload(); // Простой способ обновить данные
    } catch (error) {
      console.error(error);
      alert('Ошибка сохранения настроек печати');
    } finally {
      setSavingPrintSettings(false);
    }
  }, [productId]);

  const summaryData = useMemo(() => ([
    { label: 'ID продукта', value: product?.id ?? '—' },
    { label: 'Ключ URL', value: form.route_key?.trim() || (product as any)?.route_key || '—' },
    { label: 'Категория', value: (product as any)?.category_name ?? '—' },
    { label: 'Тип продукции', value: form.product_type || (product as any)?.product_type || '—' },
    { label: 'Тип калькулятора', value: form.calculator_type || (product as any)?.calculator_type || '—' }
  ]), [product, form.product_type, form.calculator_type, form.route_key]);

  const tabs = useMemo(() => ([
    { key: 'info' as const, label: 'Основное' },
    { key: 'services' as const, label: `Услуги (${productServicesLinks.length})` },
    { key: 'materials' as const, label: `Материалы (${materials.length})` },
    { key: 'priceTypes' as const, label: 'Типы цен' },
    { key: 'print' as const, label: 'Печать' }
  ]), [productServicesLinks.length, materials.length]);

  if (unauthorized) {
    return (
      <div className="product-edit">
        <div className="product-edit__header">
          <div className="product-edit__header-left">
            <Button variant="secondary" size="sm" onClick={() => navigate('/adminpanel/products')}>
              ← К списку продуктов
            </Button>
            <div className="product-edit__title">
              <span className="product-edit__icon">🔒</span>
              <div>
                <h1>Редактирование продукта</h1>
                <p>Нет доступа к данным</p>
              </div>
            </div>
          </div>
        </div>
        <Alert type="error">Нет доступа к данным продукта. Войдите в систему и обновите страницу.</Alert>
      </div>
    );
  }

  return (
    <div className="product-edit">
      <div className="product-edit__header">
        <div className="product-edit__header-left">
          <Button variant="secondary" size="sm" className="product-edit__back" onClick={() => navigate('/adminpanel/products')}>
            ← К списку продуктов
          </Button>
          <div className="product-edit__title">
            <span className="product-edit__icon">{form.icon || (product as any)?.icon || '📦'}</span>
            <div>
              <h1>Редактирование продукта</h1>
              <p>{product?.name || form.name || 'Новый продукт'}</p>
            </div>
          </div>
        </div>
        <div className="product-edit__header-right">
          {product && (
            <StatusBadge
              status={product.is_active ? 'Активен' : 'Отключен'}
              color={product.is_active ? 'success' : 'error'}
              size="sm"
            />
          )}
          {product && productCanBeDuplicated(product) && (
            <Button variant="secondary" size="sm" onClick={() => setDuplicateModalOpen(true)}>
              Копировать продукт…
            </Button>
          )}
          <Button variant="primary" onClick={handleSaveProduct} disabled={saving || !form.name}>
            {saving ? 'Сохранение…' : 'Сохранить изменения'}
          </Button>
        </div>
      </div>

      <div className="product-edit__body">
        <aside className="product-edit__sidebar">
          <div className="product-summary-card">
            <div className="product-summary-card__icon">{form.icon || (product as any)?.icon || '📦'}</div>
            <div className="product-summary-card__name">{product?.name || form.name || 'Без названия'}</div>
            <ul className="product-summary-card__list">
              {summaryData.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
            <div className="product-summary-card__meta">
              Создан: {product && (product as any)?.created_at ? new Date((product as any).created_at).toLocaleDateString() : '—'}
            </div>
          </div>
        </aside>

        <section className="product-edit__main">
          <div className="product-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`product-tab ${activeTab === tab.key ? 'product-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
                    </div>

          <div className="product-tab__content">
            {activeTab === 'info' && (
              <InfoTab
                loading={loading}
                form={form}
                product={product}
                saving={saving}
                categories={categories}
                onFormChange={handleFormChange}
                onSave={handleSaveProduct}
              />
            )}
            {activeTab === 'services' && (
              <ServicesTab
                productServicesLinks={productServicesLinks}
                availableServices={availableServices}
                servicesLoading={servicesLoading}
                servicesError={combinedServicesError}
                serviceAction={serviceAction}
                onAddService={handleAddService}
                onRemoveService={handleRemoveService}
                onOpenAddModal={() => setShowAddServiceModal(true)}
              />
            )}
            {activeTab === 'materials' && (
              <MaterialsTab materials={materials} />
            )}
            {activeTab === 'priceTypes' && (
              <PriceTypesTab productId={productId} onRegisterSave={registerPriceTypesSave} />
            )}
            {activeTab === 'print' && (
              <PrintTab
                productId={productId}
                product={product}
                saving={savingPrintSettings}
                onSave={handleSavePrintSettings}
              />
            )}
          </div>
        </section>
              </div>

      <AddServiceModal
        isOpen={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        availableServices={availableServices}
        assignedServiceIds={assignedServiceIds}
        serviceAction={serviceAction}
        onAddService={handleAddService}
      />

      <ProductDuplicateModal
        visible={duplicateModalOpen && !!product}
        source={product && duplicateModalOpen ? { id: product.id, name: product.name } : null}
        onClose={() => setDuplicateModalOpen(false)}
        extraHint="Копируется сохранённый в базе шаблон и настройки. Откроется страница шаблона новой копии."
        onDuplicated={async (newId) => {
          await fetchProducts(true);
          showToast('Копия продукта создана', 'success');
          navigate(`/adminpanel/products/${newId}/template`);
        }}
      />
    </div>
  );
};

export default ProductEditPage;
