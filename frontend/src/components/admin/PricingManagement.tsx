import React, { useEffect, useMemo, useState, Suspense, lazy, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Alert, FormField, LoadingState, Modal } from '../common';
import './PricingManagement.css';
import { api } from '../../api';
import { numberInputFromString, numberInputToNullable, type NumberInputValue } from '../../utils/numberInput';
import { useDebounce } from '../../hooks/useDebounce';
import {
  usePricingManagementState,
  PrintPrice,
  ServicePrice,
  MarkupSetting,
  QuantityDiscount,
  PricingItemType,
  EditingItem,
  EditingValues,
} from './hooks/usePricingManagementState';

// Lazy loading для компонентов вкладок
const PrintTechnologiesTab = lazy(() => import('./pricing/tabs/PrintTechnologiesTab').then(m => ({ default: m.PrintTechnologiesTab })));
const PrintersTab = lazy(() => import('./pricing/tabs/PrintersTab').then(m => ({ default: m.PrintersTab })));
const PrintPricesTab = lazy(() => import('./pricing/tabs/PrintPricesTab').then(m => ({ default: m.PrintPricesTab })));
const ServicesTab = lazy(() => import('./pricing/tabs/ServicesTab').then(m => ({ default: m.ServicesTab })));
const MarkupTab = lazy(() => import('./pricing/tabs/MarkupTab').then(m => ({ default: m.MarkupTab })));
const DiscountsTab = lazy(() => import('./pricing/tabs/DiscountsTab').then(m => ({ default: m.DiscountsTab })));
const PriceTypesTab = lazy(() => import('./pricing/tabs/PriceTypesTab').then(m => ({ default: m.PriceTypesTab })));

type PricingMode = 'per_sheet' | 'per_meter';

interface PrintTechnology {
  code: string;
  name: string;
  pricing_mode: PricingMode;
  supports_duplex: number;
  is_active: number;
  price_single?: number | null;
  price_duplex?: number | null;
  price_per_meter?: number | null;
  price_is_active?: number;
}

interface PrinterRow {
  id: number;
  code: string;
  name: string;
  technology_code?: string | null;
  counter_unit?: 'sheets' | 'meters';
  max_width_mm?: number | null;
  color_mode?: 'bw' | 'color' | 'both';
  printer_class?: 'office' | 'pro';
  price_single?: number | null;
  price_duplex?: number | null;
  price_per_meter?: number | null;
  price_bw_single?: number | null;
  price_bw_duplex?: number | null;
  price_color_single?: number | null;
  price_color_duplex?: number | null;
  price_bw_per_meter?: number | null;
  price_color_per_meter?: number | null;
  is_active?: number;
}

interface PricingManagementProps {
  initialTab?: 'tech' | 'printers' | 'print' | 'services' | 'markup' | 'discounts' | 'price-types';
  mode?: 'full' | 'printing';
}

const PricingManagement: React.FC<PricingManagementProps> = ({ initialTab = 'tech', mode = 'full' }) => {
  const navigate = useNavigate();
  const {
    state,
    setPrintPrices,
    setServicePrices,
    setMarkupSettings,
    setQuantityDiscounts,
    setLoading,
    setError,
    setSuccessMessage,
    setActiveTab,
    setEditingItem,
    setEditingValues,
    setSearchTerm,
  } = usePricingManagementState(initialTab);

  const {
    printPrices,
    servicePrices,
    markupSettings,
    quantityDiscounts,
    loading,
    error,
    successMessage,
    activeTab,
    editingItem,
    editingValues,
    searchTerm,
  } = state;

  const [printTechnologies, setPrintTechnologies] = useState<PrintTechnology[]>([]);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);

  // Debounce для поиска - оптимизация производительности
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  type PrinterFormState = Omit<Partial<PrinterRow>, 'max_width_mm' | 'price_single' | 'price_duplex' | 'price_per_meter' | 'price_bw_single' | 'price_bw_duplex' | 'price_color_single' | 'price_color_duplex' | 'price_bw_per_meter' | 'price_color_per_meter'> & {
    max_width_mm?: NumberInputValue | null;
    price_single?: NumberInputValue | null;
    price_duplex?: NumberInputValue | null;
    price_per_meter?: NumberInputValue | null;
    price_bw_single?: NumberInputValue | null;
    price_bw_duplex?: NumberInputValue | null;
    price_color_single?: NumberInputValue | null;
    price_color_duplex?: NumberInputValue | null;
    price_bw_per_meter?: NumberInputValue | null;
    price_color_per_meter?: NumberInputValue | null;
  };

  // Мемоизированные опции технологий
  const techOptions = useMemo(() => {
    if (!Array.isArray(printTechnologies)) return [];
    return printTechnologies.filter((t: PrintTechnology) => t.is_active !== 0);
  }, [printTechnologies]);

  const getPricingModeForTech = (techCode?: string | null): PricingMode | null => {
    if (!techCode) return null;
    const tech = printTechnologies.find((t: PrintTechnology) => t.code === techCode);
    return tech?.pricing_mode || null;
  };

  // === Принтеры ===
  // Логика вынесена в компонент PrintersTab

  const loadPricingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (mode === 'printing') {
        const results = await Promise.allSettled([
          api.get<PrintPrice[]>('/pricing/print-prices'),
          api.get<PrintTechnology[]>('/printing-technologies'),
          api.get<PrinterRow[]>('/printers'),
        ]);
        const [printRes, techRes, printersRes] = results;
        if (printRes.status === 'fulfilled') setPrintPrices(printRes.value.data || []);
        if (techRes.status === 'fulfilled') setPrintTechnologies(Array.isArray(techRes.value.data) ? techRes.value.data : []);
        if (printersRes.status === 'fulfilled') setPrinters(Array.isArray(printersRes.value.data) ? printersRes.value.data : []);
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) setError('Не удалось загрузить данные печати. Проверьте права/миграции.');
        return;
      }

      type Settled<T> = PromiseSettledResult<T>;
      const isFulfilledUnknown = (r: PromiseSettledResult<unknown>): r is PromiseFulfilledResult<unknown> =>
        r.status === 'fulfilled';
      const isRejectedUnknown = (r: PromiseSettledResult<unknown>): r is PromiseRejectedResult =>
        r.status === 'rejected';

      const keys = [
        'print-prices',
        'service-prices',
        'markup-settings',
        'quantity-discounts',
        'printing-technologies',
        'printers',
      ] as const;

      const results = await Promise.allSettled([
        api.get<PrintPrice[]>('/pricing/print-prices'),
        api.get<ServicePrice[]>('/pricing/service-prices'),
        api.get<MarkupSetting[]>('/pricing/markup-settings'),
        api.get<QuantityDiscount[]>('/pricing/quantity-discounts'),
        api.get<PrintTechnology[]>('/printing-technologies'),
        api.get<PrinterRow[]>('/printers'),
      ]);

      const [printRes, serviceRes, markupRes, discountRes, techRes, printersRes] = results as [
        Settled<Awaited<ReturnType<typeof api.get<PrintPrice[]>>>>,
        Settled<Awaited<ReturnType<typeof api.get<ServicePrice[]>>>>,
        Settled<Awaited<ReturnType<typeof api.get<MarkupSetting[]>>>>,
        Settled<Awaited<ReturnType<typeof api.get<QuantityDiscount[]>>>>,
        Settled<Awaited<ReturnType<typeof api.get<PrintTechnology[]>>>>,
        Settled<Awaited<ReturnType<typeof api.get<PrinterRow[]>>>>
      ];

      if (printRes.status === 'fulfilled') setPrintPrices(printRes.value.data || []);
      if (serviceRes.status === 'fulfilled') setServicePrices(serviceRes.value.data || []);
      if (markupRes.status === 'fulfilled') setMarkupSettings(markupRes.value.data || []);
      if (discountRes.status === 'fulfilled') setQuantityDiscounts(discountRes.value.data || []);
      if (techRes.status === 'fulfilled') setPrintTechnologies(Array.isArray(techRes.value.data) ? techRes.value.data : []);
      if (printersRes.status === 'fulfilled') setPrinters(Array.isArray(printersRes.value.data) ? printersRes.value.data : []);

      const failedDetails: string[] = [];
      (results as PromiseSettledResult<unknown>[]).forEach((r, idx) => {
        if (isRejectedUnknown(r)) {
          const anyErr: any = r.reason;
          const status = anyErr?.response?.status;
          const msg = anyErr?.response?.data?.message || anyErr?.message || 'Ошибка запроса';
          failedDetails.push(`${keys[idx]}: ${status ? `${status} ` : ''}${msg}`);
        }
        // если вдруг нужно — для fulfilled можно в будущем прокидывать диагностику
        if (isFulfilledUnknown(r)) {
          // noop
        }
      });
      if (failedDetails.length > 0) {
        setError(`Не удалось загрузить часть данных: ${failedDetails.join(' | ')}`);
      }
    } catch (error) {
      setError('Ошибка загрузки данных ценообразования');
      console.error('Error loading pricing data:', error);
    } finally {
      setLoading(false);
    }
  }, [mode, setPrintPrices, setServicePrices, setMarkupSettings, setQuantityDiscounts]);

  const ensureMarkupDefaults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.post<MarkupSetting[]>('/pricing/markup-settings/ensure-defaults', {});
      setMarkupSettings(res.data || []);
    } catch (error: any) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.message || error?.message || 'Ошибка';
      setError(`Не удалось создать дефолтные наценки: ${status ? `${status} ` : ''}${msg}`);
    } finally {
      setLoading(false);
    }
  }, [setMarkupSettings]);

  useEffect(() => {
    loadPricingData();
  }, [loadPricingData]);

  const updateServicePrice = async (id: number, price: number) => {
    try {
      await api.put(`/pricing/service-prices/${id}`, { price_per_unit: price });
      await loadPricingData();
    } catch (error) {
      console.error('Error updating service price:', error);
    }
  };

  const updateMarkupSetting = async (id: number, value: number) => {
    try {
      await api.put(`/pricing/markup-settings/${id}`, { setting_value: value });
      await loadPricingData();
    } catch (error) {
      console.error('Error updating markup setting:', error);
    }
  };

  const updateQuantityDiscount = async (id: number, discount: number) => {
    try {
      await api.put(`/pricing/quantity-discounts/${id}`, { discount_percent: discount });
      await loadPricingData();
    } catch (error) {
      console.error('Error updating quantity discount:', error);
    }
  };

  const getUpdateEndpoint = useCallback((type: PricingItemType): string => {
    const endpoints: Record<PricingItemType, string> = {
      'print-prices': '/pricing/print-prices',
      'service-prices': '/pricing/service-prices',
      'markup-settings': '/pricing/markup-settings',
      'quantity-discounts': '/pricing/quantity-discounts'
    };
    return endpoints[type];
  }, []);

  const handleEdit = useCallback(<T extends PrintPrice | ServicePrice | MarkupSetting | QuantityDiscount>(
    item: T,
    type: PricingItemType
  ) => {
    setEditingItem({ ...item, type } as EditingItem);
    setEditingValues({ ...item });
  }, []);

  const handleAddPrintPrice = useCallback(() => {
    const defaultTiers = [
      { price_mode: 'color_single', min_sheets: 1, max_sheets: 4, price_per_sheet: 8 },
      { price_mode: 'color_single', min_sheets: 5, max_sheets: 9, price_per_sheet: 6 },
      { price_mode: 'color_single', min_sheets: 10, max_sheets: 49, price_per_sheet: 4 },
      { price_mode: 'color_single', min_sheets: 50, max_sheets: 99, price_per_sheet: 2.5 },
      { price_mode: 'color_single', min_sheets: 100, max_sheets: 499, price_per_sheet: 1.5 },
      { price_mode: 'color_single', min_sheets: 500, max_sheets: 999, price_per_sheet: 1 },
      { price_mode: 'color_single', min_sheets: 1000, max_sheets: undefined, price_per_sheet: 0.85 },
    ];
    setEditingItem({
      id: -1,
      technology_code: '',
      counter_unit: 'sheets',
      sheet_width_mm: 320,
      sheet_height_mm: 450,
      price_bw_single: null,
      price_bw_duplex: null,
      price_color_single: null,
      price_color_duplex: null,
      price_bw_per_meter: null,
      price_color_per_meter: null,
      is_active: 1,
      type: 'print-prices',
    } as any);
    setEditingValues({
      technology_code: '',
      counter_unit: 'sheets',
      sheet_width_mm: 320,
      sheet_height_mm: 450,
      price_bw_single: '',
      price_bw_duplex: '',
      price_color_single: '',
      price_color_duplex: '',
      price_bw_per_meter: '',
      price_color_per_meter: '',
      is_active: 1,
      tiers: defaultTiers,
    });
  }, []);

  const handleAddQuantityDiscount = useCallback(() => {
    setEditingItem({
      id: -1,
      min_quantity: 1,
      max_quantity: null,
      discount_percent: 0,
      description: 'Скидка за объём печати (листы SRA3)',
      is_active: 1,
      type: 'quantity-discounts',
    } as any);
    setEditingValues({
      min_quantity: 1,
      max_quantity: '',
      discount_percent: 0,
      is_active: 1,
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingItem) return;

    try {
      setLoading(true);
      setError(null);
      
      if (!editingItem || !editingItem.type) {
        setError('Ошибка: не выбран элемент для редактирования');
        return;
      }
      
      const { type, id } = editingItem;
      const endpoint = getUpdateEndpoint(type);
      
      if ((type === 'print-prices' || type === 'quantity-discounts' || type === 'markup-settings') && id === -1) {
        await api.post(endpoint, editingValues);
      } else {
      await api.put(`${endpoint}/${id}`, editingValues);
      }
        setSuccessMessage('Изменения сохранены');
        setTimeout(() => setSuccessMessage(null), 3000);
        await loadPricingData();
        setEditingItem(null);
        setEditingValues({});
    } catch (error) {
      setError('Ошибка сохранения изменений');
      console.error('Error updating item:', error);
    } finally {
      setLoading(false);
    }
  }, [editingItem, editingValues, getUpdateEndpoint, loadPricingData]);

  const handleCancel = useCallback(() => {
    setEditingItem(null);
    setEditingValues({});
  }, []);

  // Вспомогательные функции для безопасного доступа к значениям
  const getEditingValue = useCallback((key: string): string | number => {
    const value = editingValues[key];
    if (value === undefined || value === null) return '';
    return typeof value === 'number' ? value : String(value);
  }, [editingValues]);

  const updateEditingValue = useCallback((key: string, value: string | number | unknown) => {
    setEditingValues({ ...editingValues, [key]: value });
  }, [editingValues]);

  // === Типы печати ===
  // Логика вынесена в компонент PrintTechnologiesTab

  // === Принтеры ===
  // Логика вынесена в компонент PrintersTab

  // renderPrintPrices вынесен в компонент PrintPricesTab

  // renderPrintTechnologies вынесен в компонент PrintTechnologiesTab
  // renderPrinters вынесен в компонент PrintersTab

  // renderServicePrices вынесен в компонент ServicesTab
  // renderMarkupSettings вынесен в компонент MarkupTab
  // renderQuantityDiscounts вынесен в компонент DiscountsTab

  return (
    <div className="pricing-management">
      <div className="pricing-header">
        <h2>💰 Управление ценами</h2>
        <p>Настройте цены печати, услуг и наценки для различных категорий продуктов</p>
      </div>

      {error && (
        <Alert type="error" onClose={() => setError(null)} className="mb-4">
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert type="success" onClose={() => setSuccessMessage(null)} className="mb-4">
          {successMessage}
        </Alert>
      )}

      {/* Поиск */}
      <div className="search-section">
        <FormField label="Поиск">
          <input
            type="text"
            placeholder="Поиск по названию, типу, описанию..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </FormField>
      </div>

      <div className="pricing-tabs">
        <button
          className={`tab ${activeTab === 'tech' ? 'active' : ''}`}
          onClick={() => setActiveTab('tech')}
        >
          🖨️ Типы печати
        </button>
        <button
          className={`tab ${activeTab === 'printers' ? 'active' : ''}`}
          onClick={() => setActiveTab('printers')}
        >
          🖨️ Принтеры
        </button>
        <button 
          className={`tab ${activeTab === 'print' ? 'active' : ''}`}
          onClick={() => setActiveTab('print')}
        >
          📄 Цены печати
        </button>
        {mode === 'full' && (
          <>
        <button 
          className={`tab ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          🔧 Услуги
        </button>
        <button 
          className={`tab ${activeTab === 'markup' ? 'active' : ''}`}
          onClick={() => setActiveTab('markup')}
        >
          📈 Наценки
        </button>
        <button 
          className={`tab ${activeTab === 'discounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('discounts')}
        >
          🎯 Скидки за объем печати
        </button>
        <button 
          className={`tab ${activeTab === 'price-types' ? 'active' : ''}`}
          onClick={() => setActiveTab('price-types')}
        >
          💰 Типы цен
        </button>
          </>
        )}
      </div>

      <div className="pricing-content">
        {loading ? (
          <LoadingState message="Загрузка данных ценообразования..." />
        ) : (
          <Suspense fallback={<LoadingState message="Загрузка вкладки..." />}>
            {activeTab === 'tech' && (
              <PrintTechnologiesTab
                printTechnologies={printTechnologies}
                loading={loading}
                onLoadData={loadPricingData}
                onError={setError}
                onSuccess={(msg) => {
                  setSuccessMessage(msg);
                  setTimeout(() => setSuccessMessage(null), 2000);
                }}
              />
            )}
            {activeTab === 'printers' && (
              <PrintersTab
                printers={printers}
                printTechnologies={printTechnologies}
                loading={loading}
                onLoadData={loadPricingData}
                onError={setError}
                onSuccess={(msg: string) => {
                  setSuccessMessage(msg);
                  setTimeout(() => setSuccessMessage(null), 2000);
                }}
                getPricingModeForTech={getPricingModeForTech}
              />
            )}
            {activeTab === 'print' && (
              <PrintPricesTab
                printPrices={printPrices}
                printTechnologies={printTechnologies}
                loading={loading}
                searchTerm={searchTerm}
                onNavigateToEdit={(id) => navigate(`/adminpanel/print-prices/${id}`)}
                onNavigateToAdd={() => navigate('/adminpanel/print-prices/new')}
              />
            )}
            {mode === 'full' && activeTab === 'services' && (
              <ServicesTab
                servicePrices={servicePrices}
                loading={loading}
                searchTerm={debouncedSearchTerm}
                editingItem={editingItem}
                editingValues={editingValues}
                onEdit={handleEdit}
                onSave={handleSave}
                onCancel={handleCancel}
                getEditingValue={getEditingValue}
                updateEditingValue={updateEditingValue}
              />
            )}
            {mode === 'full' && activeTab === 'markup' && (
              <MarkupTab
                markupSettings={markupSettings}
                loading={loading}
                searchTerm={debouncedSearchTerm}
                error={error}
                editingItem={editingItem}
                editingValues={editingValues}
                onEdit={handleEdit}
                onSave={handleSave}
                onCancel={handleCancel}
                onEnsureDefaults={ensureMarkupDefaults}
                getEditingValue={getEditingValue}
                updateEditingValue={updateEditingValue}
              />
            )}
            {mode === 'full' && activeTab === 'discounts' && (
              <DiscountsTab
                quantityDiscounts={quantityDiscounts}
                loading={loading}
                searchTerm={debouncedSearchTerm}
                editingItem={editingItem}
                editingValues={editingValues}
                onEdit={handleEdit}
                onSave={handleSave}
                onCancel={handleCancel}
                onAddNew={handleAddQuantityDiscount}
                getEditingValue={getEditingValue}
                updateEditingValue={updateEditingValue}
              />
            )}
            {mode === 'full' && activeTab === 'price-types' && (
              <PriceTypesTab
                searchTerm={debouncedSearchTerm}
                onError={setError}
                onSuccess={(msg) => {
                  setSuccessMessage(msg);
                  setTimeout(() => setSuccessMessage(null), 2000);
                }}
              />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default PricingManagement;