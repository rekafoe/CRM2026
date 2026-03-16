import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button } from '../../components/common';
import { 
  createCustomer, 
  getCustomers, 
  getOrders, 
  updateCustomer,
  generateDocumentByType,
  getDocumentTemplatesByType
} from '../../api';
import { Customer, Order, TemplateData } from '../../types';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import * as XLSX from 'xlsx';
import '../../components/admin/PricingManagement.css';
import './CustomersAdminPage.css';

type CustomerTab = 'individual' | 'legal';

const getCustomerDisplayName = (customer: Customer) => {
  if (customer.type === 'legal') {
    return customer.company_name || customer.legal_name || `Юр. лицо #${customer.id}`;
  }
  const parts = [customer.last_name, customer.first_name, customer.middle_name].filter(Boolean);
  return parts.join(' ') || `Клиент #${customer.id}`;
};

/** Итог заказа с учётом скидки (для отображения и документов). */
const getOrderTotal = (order: Order) => {
  const anyOrder = order as any;
  const subtotal = Number(order.totalAmount ?? anyOrder.total_amount ?? 0) ||
    (Array.isArray(anyOrder.items) ? anyOrder.items.reduce(
      (s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
      0
    ) : 0);
  const pct = Number(anyOrder.discount_percent) || 0;
  return Math.round(subtotal * (1 - pct / 100) * 100) / 100;
};

const formatDateValue = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
};

const formatDateForFile = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Фраза о расходуемой бумаге для документов: "Печать на (тип) бумаге (плотность) (односторонняя/двухсторонняя)".
 * Возвращает пустую строку, если данных нет.
 */
const getOrderItemPaperPhrase = (item: any): string => {
  const params = item.params || {};
  const specs = params.specifications || {};
  const ps: Array<{ label?: string; key?: string; value?: string }> = Array.isArray(params.parameterSummary) ? params.parameterSummary : [];
  let paperType = specs.paperType ? String(specs.paperType).trim() : '';
  let density = specs.paperDensity != null ? String(specs.paperDensity).replace(/\s*г\/м².*/i, '').trim() : '';
  if (!paperType && ps.length) {
    const ptEntry = ps.find((x: any) => /тип\s*бумаги|paperType|бумага|материал/i.test(String(x.label || x.key || '')));
    if (ptEntry?.value) paperType = String(ptEntry.value).trim();
  }
  if (!density && ps.length) {
    const denEntry = ps.find((x: any) => /плотность|density|г\/м/i.test(String(x.label || x.key || '')));
    if (denEntry?.value) density = String(denEntry.value).replace(/\s*г\/м².*/i, '').trim();
  }
  const sides = specs.sides ?? (typeof specs.sides === 'number' ? specs.sides : undefined);
  let sidesStr = '';
  if (sides === 1) sidesStr = 'односторонняя';
  else if (sides === 2) sidesStr = 'двухсторонняя';
  if (!sidesStr && ps.length) {
    const sidesEntry = ps.find((x: any) => /сторон|печать|sides/i.test(String(x.label || x.key || '')));
    if (sidesEntry?.value) {
      const v = String(sidesEntry.value);
      sidesStr = /двух|2/i.test(v) ? 'двухсторонняя' : 'односторонняя';
    }
  }
  if (!paperType && !density && !sidesStr) return '';
  const typePart = paperType ? ` на ${paperType.toLowerCase()} бумаге` : (density && /\d/.test(density) ? ' на бумаге' : '');
  const densityPart = density && /\d/.test(density) ? ` ${density}${/г\s*$/i.test(density) ? '' : ' г'}/м²` : '';
  const sidesPart = sidesStr ? ` ${sidesStr}` : '';
  return `Печать${typePart}${densityPart}${sidesPart}`.trim();
};

/**
 * Подробное наименование позиции для акта/счёта: тираж, листы печати, резки + расходуемая бумага.
 * Пример: "96 Визитки: 4 листа печати, 13 резок. Печать на мелованной бумаге 300 г/м² двухсторонняя."
 * Работает для любого продукта: при отсутствии раскладки — только название и при наличии — бумага.
 */
const getOrderItemProductionName = (item: any): string => {
  // Всегда по имени (дизайн, ламинация, визитки и т.д.), тип — только запасной вариант
  const productName =
    item.name ||
    item.params?.productName ||
    item.params?.name ||
    item.params?.description ||
    item.type ||
    'Услуга';
  const qty = Number(item.quantity) || 1;
  const params = item.params || {};
  const specs = params.specifications || {};
  const layout = params.layout || specs.layout || {};
  const sheetsNeeded = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0;
  const cutsPerSheet = Number(layout.cutsPerSheet) || 0;
  const hasSheets = sheetsNeeded > 0;
  const hasCuts = cutsPerSheet > 0;

  const paperPhrase = getOrderItemPaperPhrase(item);

  // Порядок как инструкция: печать (листы) → послепечатные операции по имени → резка. Без названия — не показываем.
  const servicesList: Array<{ name: string; qty: number; unit: string }> = [];
  const rawServices = params.services;
  if (Array.isArray(rawServices) && rawServices.length > 0) {
    for (const s of rawServices) {
      const name = String(s.operationName || s.service || s.name || '').trim();
      if (!name || name.toLowerCase() === 'операция') continue;
      const serviceQty = Number(s.quantity);
      if (!Number.isFinite(serviceQty) || serviceQty <= 0) continue;
      const pu = String(s.priceUnit || s.unit || '').toLowerCase();
      const unit = pu.includes('sheet') || pu.includes('лист') ? 'лист.' : 'шт.';
      servicesList.push({ name, qty: serviceQty, unit });
    }
  }

  let main = productName;
  const parts: string[] = [];
  // 1) Печать — листы
  if (hasSheets) {
    const sheetWord = sheetsNeeded === 1 ? 'лист' : sheetsNeeded < 5 ? 'листа' : 'листов';
    parts.push(`${sheetsNeeded} ${sheetWord} печати`);
  }
  // 2) Послепечатные операции (ламинация, скругление и т.д.)
  for (const op of servicesList) {
    parts.push(`${op.name} ${op.qty} ${op.unit}`);
  }
  // 3) Резка
  if (hasCuts) {
    const cutWord = cutsPerSheet === 1 ? 'рез' : cutsPerSheet < 5 ? 'реза' : 'резок';
    parts.push(`${cutsPerSheet} ${cutWord}`);
  }

  if (parts.length > 0) {
    main = `${qty} ${productName}: ${parts.join(', ')}`;
  } else if (qty > 1) {
    main = `${qty} ${productName}`;
  }

  if (paperPhrase) return `${main}. ${paperPhrase}`;
  return main;
};

/**
 * Разворачивает позицию заказа в отдельные строки для акта/счёта:
 * 1) Печать на X бумаге Y г/м² — кол-во листов (шт.)
 * 2) Каждая операция (скругление, ламинация и т.д.) — отдельная строка, кол-во в шт.
 * 3) Резка — отдельная строка, кол-во резок в шт.
 * Для позиций без раскладки/операций — одна строка с названием и quantity позиции.
 */
const getOrderItemProductionRows = (item: any): Array<{ name: string; quantity: number; unit: string }> => {
  const productName =
    item.name ||
    item.params?.productName ||
    item.params?.name ||
    item.params?.description ||
    item.type ||
    'Услуга';
  const params = item.params || {};
  const specs = params.specifications || {};
  const layout = params.layout || specs.layout || {};
  const sheetsNeeded = Number(params.sheetsNeeded ?? specs.sheetsNeeded ?? layout.sheetsNeeded) || 0;
  const cutsPerSheet = Number(layout.cutsPerSheet) || 0;
  const paperPhrase = getOrderItemPaperPhrase(item);

  const rows: Array<{ name: string; quantity: number; unit: string }> = [];

  if (sheetsNeeded > 0) {
    rows.push({ name: paperPhrase || 'Печать (листы)', quantity: sheetsNeeded, unit: 'шт.' });
  }
  const rawServices = params.services;
  if (Array.isArray(rawServices) && rawServices.length > 0) {
    for (const s of rawServices) {
      const name = String(s.operationName || s.service || s.name || '').trim();
      if (!name || name.toLowerCase() === 'операция') continue;
      const q = Number(s.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      const pu = String(s.priceUnit || s.unit || '').toLowerCase();
      const unit = pu.includes('sheet') || pu.includes('лист') ? 'лист.' : 'шт.';
      rows.push({ name, quantity: q, unit });
    }
  }
  if (cutsPerSheet > 0) {
    const cutWord = cutsPerSheet === 1 ? 'резка' : cutsPerSheet < 5 ? 'резки' : 'резок';
    rows.push({ name: cutWord.charAt(0).toUpperCase() + cutWord.slice(1), quantity: cutsPerSheet, unit: 'шт.' });
  }

  if (rows.length > 0) return rows;
  const qty = Number(item.quantity) || 1;
  return [{ name: productName, quantity: qty, unit: 'шт.' }];
};

interface CustomersAdminPageProps {
  /** Куда вести кнопка «Назад»: по умолчанию /adminpanel, на странице /clients — / */
  backTo?: string;
}

const CustomersAdminPage: React.FC<CustomersAdminPageProps> = ({ backTo = '/adminpanel' }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CustomerTab>('individual');
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [ordersFrom, setOrdersFrom] = useState('');
  const [ordersTo, setOrdersTo] = useState('');
  const [legalForm, setLegalForm] = useState({ bank_details: '', authorized_person: '' });
  const [savingLegal, setSavingLegal] = useState(false);
  const [editForm, setEditForm] = useState<{
    first_name: string;
    last_name: string;
    middle_name: string;
    company_name: string;
    legal_name: string;
    tax_id: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
  }>({
    first_name: '', last_name: '', middle_name: '', company_name: '', legal_name: '', tax_id: '',
    phone: '', email: '', address: '', notes: '',
  });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ total: number; created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [generatingDocument, setGeneratingDocument] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCustomers({
        type: activeTab,
        search: debouncedQuery || undefined,
      });
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedCustomer(null);
    setOrders([]);
    setShowOrders(false);
    setOrdersFrom('');
    setOrdersTo('');
  }, [activeTab]);

  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.type !== 'legal') {
      setLegalForm({ bank_details: '', authorized_person: '' });
      return;
    }
    setLegalForm({
      bank_details: selectedCustomer.bank_details || '',
      authorized_person: selectedCustomer.authorized_person || '',
    });
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedCustomer) {
      setEditForm({
        first_name: '', last_name: '', middle_name: '', company_name: '', legal_name: '', tax_id: '',
        phone: '', email: '', address: '', notes: '',
      });
      return;
    }
    setEditForm({
      first_name: selectedCustomer.first_name ?? '',
      last_name: selectedCustomer.last_name ?? '',
      middle_name: selectedCustomer.middle_name ?? '',
      company_name: selectedCustomer.company_name ?? '',
      legal_name: selectedCustomer.legal_name ?? '',
      tax_id: selectedCustomer.tax_id ?? '',
      phone: selectedCustomer.phone ?? '',
      email: selectedCustomer.email ?? '',
      address: selectedCustomer.address ?? '',
      notes: selectedCustomer.notes ?? '',
    });
  }, [selectedCustomer]);

  const loadOrdersForCustomer = useCallback(async (customer: Customer) => {
    try {
      setOrdersLoading(true);
      // Запрашиваем все заказы (all: true), чтобы видеть заказы клиента от любых пользователей — иначе при генерации акта/счёта orderItems пустые
      const res = await getOrders({ all: true });
      const list = Array.isArray(res.data) ? res.data : [];
      const filtered = list.filter((order) => {
        const anyOrder = order as any;
        return order.customer_id === customer.id || anyOrder.customer_id === customer.id || order.customer?.id === customer.id;
      });
      const sorted = [...filtered].sort((a, b) => {
        const aDate = new Date(a.created_at || (a as any).created_at || 0).getTime();
        const bDate = new Date(b.created_at || (b as any).created_at || 0).getTime();
        return bDate - aDate;
      });
      setOrders(sorted);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить заказы клиента');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const handleSelectCustomer = useCallback(async (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowOrders(false);
    await loadOrdersForCustomer(customer);
  }, [loadOrdersForCustomer]);

  const filteredOrders = useMemo(() => {
    if (!ordersFrom && !ordersTo) {
      return orders;
    }
    return orders.filter((order) => {
      const dateValue = order.created_at || (order as any).created_at;
      if (!dateValue) return false;
      const orderDate = new Date(dateValue);
      if (ordersFrom) {
        const from = new Date(`${ordersFrom}T00:00:00`);
        if (orderDate < from) return false;
      }
      if (ordersTo) {
        const to = new Date(`${ordersTo}T23:59:59`);
        if (orderDate > to) return false;
      }
      return true;
    });
  }, [orders, ordersFrom, ordersTo]);

  const customerMetrics = useMemo(() => {
    if (!selectedCustomer) {
      return {
        ordersCount: 0,
        averageCheck: 0,
        averageIntervalDays: null as number | null,
      };
    }
    if (filteredOrders.length === 0) {
      return {
        ordersCount: 0,
        averageCheck: 0,
        averageIntervalDays: null,
      };
    }
    const total = filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    const averageCheck = total / filteredOrders.length;
    const sorted = [...filteredOrders].sort((a, b) => {
      const aDate = new Date(a.created_at || (a as any).created_at || 0).getTime();
      const bDate = new Date(b.created_at || (b as any).created_at || 0).getTime();
      return aDate - bDate;
    });
    if (sorted.length < 2) {
      return { ordersCount: filteredOrders.length, averageCheck, averageIntervalDays: null };
    }
    const intervals = sorted.slice(1).map((order, index) => {
      const prev = sorted[index];
      const diffMs = new Date(order.created_at || (order as any).created_at || 0).getTime() -
        new Date(prev.created_at || (prev as any).created_at || 0).getTime();
      return Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
    });
    const averageIntervalDays = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    return { ordersCount: filteredOrders.length, averageCheck, averageIntervalDays };
  }, [filteredOrders, selectedCustomer]);

  const handleSaveLegalDetails = useCallback(async () => {
    if (!selectedCustomer || selectedCustomer.type !== 'legal') return;
    try {
      setSavingLegal(true);
      const { data } = await updateCustomer(selectedCustomer.id, {
        bank_details: legalForm.bank_details.trim(),
        authorized_person: legalForm.authorized_person.trim(),
      });
      if (data) setSelectedCustomer(data);
      await loadCustomers();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить реквизиты');
    } finally {
      setSavingLegal(false);
    }
  }, [legalForm, loadCustomers, selectedCustomer]);

  const handleSaveCustomerDetails = useCallback(async () => {
    if (!selectedCustomer) return;
    try {
      setSavingCustomer(true);
      setError(null);
      const payload: Parameters<typeof updateCustomer>[1] = {
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      };
      if (selectedCustomer.type === 'individual') {
        payload.first_name = editForm.first_name.trim();
        payload.last_name = editForm.last_name.trim();
        payload.middle_name = editForm.middle_name.trim() || undefined;
      } else {
        payload.company_name = editForm.company_name.trim();
        payload.legal_name = editForm.legal_name.trim() || undefined;
        payload.tax_id = editForm.tax_id.trim() || undefined;
      }
      const { data } = await updateCustomer(selectedCustomer.id, payload);
      if (data) setSelectedCustomer(data);
      await loadCustomers();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить данные клиента');
    } finally {
      setSavingCustomer(false);
    }
  }, [editForm, loadCustomers, selectedCustomer]);

  const buildOrdersTableRows = useCallback(
    (list: Order[]) =>
      list.map((order, index) => [
        String(index + 1),
        formatDateValue(order.created_at || (order as any).created_at),
        order.number || `#${order.id}`,
        getOrderTotal(order).toFixed(2),
        String(order.status ?? '—'),
      ]),
    []
  );

  const handleExportAct = useCallback(async () => {
    if (!selectedCustomer) return;
    
    try {
      setGeneratingDocument('act');
      
      // Собираем все позиции из всех заказов
      const allOrderItems: Array<{
        number: number;
        name: string;
        unit: string;
        quantity: number;
        price: number;
        amount: number;
        vatRate?: string;
        vatAmount?: number;
        totalWithVat?: number;
      }> = [];
      
      let itemNumber = 1;
      console.log(`[Frontend] Начинаем сбор позиций из ${filteredOrders.length} заказов`);
      
      // Проверяем, есть ли items в заказах
      let totalItemsFound = 0;
      for (const order of filteredOrders) {
        const orderItems = (order as any).items || [];
        totalItemsFound += orderItems.length;
        if (orderItems.length === 0) {
          console.warn(`[Frontend] Заказ ${order.id} (${order.number}) не содержит позиций!`, {
            hasItems: !!order.items,
            itemsArray: Array.isArray(order.items),
            itemsLength: order.items?.length || 0
          });
        }
      }
      
      console.log(`[Frontend] Всего найдено позиций: ${totalItemsFound} из ${filteredOrders.length} заказов`);
      
      // Функция для формирования краткого названия (если нет листов/резок)
      const buildSimplifiedItemName = (item: any): string => {
        const isCustomProduct = item.params?.customProduct === true;
        if (isCustomProduct) {
          return item.name || item.params?.customName || item.params?.productName || item.params?.description || item.type || 'Произвольный продукт';
        }
        return item.name || item.params?.productName || item.params?.name || item.params?.description || item.type || 'Услуга';
      };
      
      for (const order of filteredOrders) {
        const orderItems = (order as any).items || [];
        const discountPct = Number((order as any).discount_percent) || 0;
        for (const item of orderItems) {
          const rawPrice = Number(item.price) || 0;
          const price = Math.round(rawPrice * (1 - discountPct / 100) * 100) / 100;
          const itemAmount = Math.round(price * (Number(item.quantity) || 1) * 100) / 100;
          const vatRate = 'Без НДС';
          const vatAmount = 0;

          const lines = getOrderItemProductionRows(item);
          lines.forEach((line, idx) => {
            const isFirst = idx === 0;
            allOrderItems.push({
              number: itemNumber++,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity,
              price: isFirst ? price : 0,
              amount: isFirst ? itemAmount : 0,
              vatRate,
              vatAmount,
              totalWithVat: isFirst ? itemAmount : 0,
            });
          });
        }
      }
      
      console.log(`[Frontend] Собрано всего позиций для акта: ${allOrderItems.length}`, {
        items: allOrderItems.slice(0, 3).map(item => ({ 
          number: item.number,
          name: item.name, 
          quantity: item.quantity, 
          amount: item.amount 
        })),
        totalAmount: allOrderItems.reduce((sum, item) => sum + item.amount, 0),
        totalQuantity: allOrderItems.reduce((sum, item) => sum + item.quantity, 0)
      });
      
      // Пытаемся использовать шаблон
      try {
        const templateData: TemplateData = {
          customerName: selectedCustomer.company_name || selectedCustomer.legal_name || getCustomerDisplayName(selectedCustomer),
          companyName: selectedCustomer.company_name || '',
          legalName: selectedCustomer.legal_name || '',
          legalAddress: selectedCustomer.address || '—',
          taxId: selectedCustomer.tax_id || '—',
          bankDetails: selectedCustomer.type === 'legal' ? (legalForm.bank_details.trim() || selectedCustomer.bank_details || '—') : (selectedCustomer.bank_details || '—'),
          authorizedPerson: selectedCustomer.type === 'legal' ? (legalForm.authorized_person.trim() || selectedCustomer.authorized_person || '—') : (selectedCustomer.authorized_person || '—'),
          orders: filteredOrders.map((order, index) => ({
            number: order.number || `#${order.id}`,
            date: formatDateValue(order.created_at || (order as any).created_at),
            amount: getOrderTotal(order),
            status: String(order.status ?? '—'),
          })),
          orderItems: allOrderItems,
          totalAmount: filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0),
          totalQuantity: allOrderItems.reduce((sum, item) => sum + item.quantity, 0),
        };
        
        console.log(`[Frontend] Отправляем данные в шаблон:`, {
          orderItemsCount: allOrderItems.length,
          totalQuantity: templateData.totalQuantity,
          totalAmount: templateData.totalAmount,
          firstItem: allOrderItems[0],
          orderItemsArray: Array.isArray(templateData.orderItems),
          orderItemsType: typeof templateData.orderItems
        });
        
        const response = await generateDocumentByType('act', templateData);
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Извлекаем имя файла из заголовка Content-Disposition
        let filename = `ACT-${formatDateForFile(new Date())}-${selectedCustomer.id}.xlsx`; // Fallback
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            // Декодируем URL-encoded имя файла
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // Если не удалось декодировать, используем как есть
            }
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      } catch (templateError: any) {
        // Если шаблон не найден, используем старый способ
        const errorMessage = templateError?.response?.data?.message || templateError?.message || '';
        if (errorMessage.includes('404') || errorMessage.includes('не найден') || errorMessage.includes('Шаблон')) {
          console.log('Шаблон не найден, используем стандартную генерацию:', errorMessage);
        } else {
          // Показываем полную ошибку для отладки
          console.error('Ошибка генерации документа:', templateError);
          setError(`Ошибка генерации акта: ${errorMessage || 'Неизвестная ошибка'}`);
          return;
        }
      }
      
      // Стандартная генерация без шаблона
      const rows = [
        ['№', 'Дата', 'Заказ', 'Сумма', 'Статус'],
        ...buildOrdersTableRows(filteredOrders),
      ];
      const total = filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
      rows.push(['', '', 'Итого', total.toFixed(2), '']);

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Акт');
      const fileName = `ACT-${formatDateForFile(new Date())}-${selectedCustomer.id}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать акт');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, selectedCustomer]);

  const handleExportInvoice = useCallback(async () => {
    if (!selectedCustomer) return;
    
    try {
      setGeneratingDocument('invoice');
      
      // Собираем все позиции из всех заказов (аналогично акту)
      const allOrderItems: Array<{
        number: number;
        name: string;
        unit: string;
        quantity: number;
        price: number;
        amount: number;
        vatRate?: string;
        vatAmount?: number;
        totalWithVat?: number;
      }> = [];
      
      // Функция для формирования краткого названия товара для счёта
      const buildSimplifiedItemName = (item: any): string => {
        const isCustomProduct = item.params?.customProduct === true;
        if (isCustomProduct) {
          return item.name || item.params?.customName || item.params?.productName || item.params?.description || item.type || 'Произвольный продукт';
        }
        return item.name || item.params?.productName || item.params?.name || item.params?.description || item.type || 'Услуга';
      };
      
      let itemNumber = 1;
      for (const order of filteredOrders) {
        const orderItems = (order as any).items || [];
        const discountPct = Number((order as any).discount_percent) || 0;
        for (const item of orderItems) {
          const rawPrice = Number(item.price) || 0;
          const price = Math.round(rawPrice * (1 - discountPct / 100) * 100) / 100;
          const itemAmount = Math.round(price * (Number(item.quantity) || 1) * 100) / 100;

          const lines = getOrderItemProductionRows(item);
          lines.forEach((line, idx) => {
            const isFirst = idx === 0;
            allOrderItems.push({
              number: itemNumber++,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity,
              price: isFirst ? price : 0,
              amount: isFirst ? itemAmount : 0,
              vatRate: 'Без НДС',
              vatAmount: 0,
              totalWithVat: isFirst ? itemAmount : 0,
            });
          });
        }
      }
      
      // Пытаемся использовать шаблон
      try {
        const templateData: TemplateData = {
          customerName: selectedCustomer.company_name || selectedCustomer.legal_name || getCustomerDisplayName(selectedCustomer),
          companyName: selectedCustomer.company_name || '',
          legalName: selectedCustomer.legal_name || '',
          legalAddress: selectedCustomer.address || '—',
          taxId: selectedCustomer.tax_id || '—',
          bankDetails: selectedCustomer.type === 'legal' ? (legalForm.bank_details.trim() || selectedCustomer.bank_details || '—') : (selectedCustomer.bank_details || '—'),
          authorizedPerson: selectedCustomer.type === 'legal' ? (legalForm.authorized_person.trim() || selectedCustomer.authorized_person || '—') : (selectedCustomer.authorized_person || '—'),
          orders: filteredOrders.map((order, index) => ({
            number: order.number || `#${order.id}`,
            date: formatDateValue(order.created_at || (order as any).created_at),
            amount: getOrderTotal(order),
            status: String(order.status ?? '—'),
          })),
          orderItems: allOrderItems,
          totalAmount: filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0),
          totalQuantity: allOrderItems.reduce((sum, item) => sum + item.quantity, 0),
        };
        
        const response = await generateDocumentByType('invoice', templateData);
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Извлекаем имя файла из заголовка Content-Disposition
        let filename = `INVOICE-${formatDateForFile(new Date())}-${selectedCustomer.id}.xlsx`; // Fallback
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // Если не удалось декодировать, используем как есть
            }
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      } catch (templateError: any) {
        // Если шаблон не найден, используем старый способ
        if (templateError.message?.includes('404') || templateError.message?.includes('не найден')) {
          console.log('Шаблон не найден, используем стандартную генерацию');
        } else {
          throw templateError;
        }
      }
      
      // Стандартная генерация без шаблона
      const rows = [
        ['№', 'Дата', 'Заказ', 'Сумма', 'Статус'],
        ...buildOrdersTableRows(filteredOrders),
      ];
      const total = filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
      rows.push(['', '', 'Итого', total.toFixed(2), '']);

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Счёт');
      const fileName = `INVOICE-${formatDateForFile(new Date())}-${selectedCustomer.id}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать счёт');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, selectedCustomer]);

  const handleExportContract = useCallback(async () => {
    if (!selectedCustomer) return;
    
    try {
      setGeneratingDocument('contract');
      
      const contractNumber = `CONTRACT-${formatDateForFile(new Date())}-${selectedCustomer.id}`;
      const customerName = selectedCustomer.company_name || selectedCustomer.legal_name || getCustomerDisplayName(selectedCustomer);
      
      // Пытаемся использовать шаблон
      try {
        const templateData: TemplateData = {
          customerName,
          companyName: selectedCustomer.company_name || '',
          legalName: selectedCustomer.legal_name || '',
          legalAddress: selectedCustomer.address || '—',
          taxId: selectedCustomer.tax_id || '—',
          bankDetails: selectedCustomer.type === 'legal' ? (legalForm.bank_details.trim() || selectedCustomer.bank_details || '—') : (selectedCustomer.bank_details || '—'),
          authorizedPerson: selectedCustomer.type === 'legal' ? (legalForm.authorized_person.trim() || selectedCustomer.authorized_person || '—') : (selectedCustomer.authorized_person || '—'),
          contractNumber,
          contractDate: new Date().toLocaleDateString('ru-RU'),
          orders: filteredOrders.map((order, index) => ({
            number: order.number || `#${order.id}`,
            date: formatDateValue(order.created_at || (order as any).created_at),
            amount: getOrderTotal(order),
            status: String(order.status ?? '—'),
          })),
          totalAmount: filteredOrders.reduce((sum, order) => sum + getOrderTotal(order), 0),
        };
        
        const response = await generateDocumentByType('contract', templateData);
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Извлекаем имя файла из заголовка Content-Disposition
        let filename = `${contractNumber}.docx`; // Fallback
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // Если не удалось декодировать, используем как есть
            }
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      } catch (templateError: any) {
        // Если шаблон не найден, используем старый способ
        if (templateError.message?.includes('404') || templateError.message?.includes('не найден')) {
          console.log('Шаблон не найден, используем стандартную генерацию');
        } else {
          throw templateError;
        }
      }
      
      // Стандартная генерация без шаблона
      const title = `ДОГОВОР № ${contractNumber}`;
      const bankDetails = selectedCustomer.type === 'legal' ? (legalForm.bank_details.trim() || selectedCustomer.bank_details || '—') : (selectedCustomer.bank_details || '—');
      const authorizedPerson = selectedCustomer.type === 'legal' ? (legalForm.authorized_person.trim() || selectedCustomer.authorized_person || '—') : (selectedCustomer.authorized_person || '—');
      const legalAddress = selectedCustomer.address || '—';

      const tableRows = [
        new TableRow({
          children: ['№', 'Дата', 'Заказ', 'Сумма', 'Статус'].map((text) =>
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
            })
          ),
        }),
        ...buildOrdersTableRows(filteredOrders).map(
          (cells) =>
            new TableRow({
              children: cells.map((value) => new TableCell({ children: [new Paragraph(value)] })),
            })
        ),
      ];

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: title, spacing: { after: 300 } }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Клиент: ', bold: true }),
                  new TextRun({ text: customerName }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Юр. адрес: ', bold: true }),
                  new TextRun({ text: legalAddress }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'УНП: ', bold: true }),
                  new TextRun({ text: selectedCustomer.tax_id || '—' }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Расчётный счёт и банк: ', bold: true }),
                  new TextRun({ text: bankDetails }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Уполномоченное лицо: ', bold: true }),
                  new TextRun({ text: authorizedPerson }),
                ],
              }),
              new Paragraph({ text: ' ', spacing: { after: 200 } }),
              new Paragraph({ text: 'Заказы в периоде', spacing: { after: 100 } }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: tableRows,
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${contractNumber}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать договор');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, selectedCustomer]);

  const normalizeHeader = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, '');

  const headerMap: Record<string, string> = {
    фамилия: 'last_name',
    имя: 'first_name',
    отчество: 'middle_name',
    имяотчество: 'name',
    фио: 'name',
    клиент: 'name',
    наименование: 'name',
    компания: 'company_name',
    названиекомпании: 'company_name',
    торговаямарка: 'company_name',
    юридическоеназвание: 'legal_name',
    юрназвание: 'legal_name',
    унп: 'tax_id',
    инн: 'tax_id',
    taxid: 'tax_id',
    телефон: 'phone',
    phone: 'phone',
    email: 'email',
    почта: 'email',
    адрес: 'address',
    примечание: 'notes',
    комментарий: 'notes',
    тип: 'type',
    type: 'type',
    уполномоченноелицо: 'authorized_person',
    уполномоченное_лицо: 'authorized_person',
    authorized_person: 'authorized_person',
    authorizedperson: 'authorized_person',
    расчетныйсчет: 'bank_details',
    расчетный_счет: 'bank_details',
    банковскиереквизиты: 'bank_details',
    банковские_реквизиты: 'bank_details',
    bank_details: 'bank_details',
    bankdetails: 'bank_details',
  };

  const resolveCustomerType = (value?: string, taxId?: string): Customer['type'] => {
    const normalized = (value || '').toLowerCase();
    if (normalized.includes('юр') || normalized.includes('legal') || normalized.includes('company')) {
      return 'legal';
    }
    if (normalized.includes('физ') || normalized.includes('инд') || normalized.includes('individual')) {
      return 'individual';
    }
    if (taxId && taxId.trim().length > 0) {
      return 'legal';
    }
    return 'individual';
  };

  const splitName = (fullName?: string) => {
    if (!fullName) return { first_name: '', last_name: '', middle_name: '' };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { first_name: parts[0], last_name: '', middle_name: '' };
    }
    if (parts.length === 2) {
      return { first_name: parts[1], last_name: parts[0], middle_name: '' };
    }
    return { first_name: parts[1], last_name: parts[0], middle_name: parts.slice(2).join(' ') };
  };

  const handleExport = useCallback(() => {
    if (customers.length === 0) {
      setImportError('Нет клиентов для экспорта');
      return;
    }
    setImportError(null);
    const rows = customers.map((customer) => ({
      Тип: customer.type === 'legal' ? 'Юрлицо' : 'Физлицо',
      Клиент: getCustomerDisplayName(customer),
      Фамилия: customer.last_name || '',
      Имя: customer.first_name || '',
      Отчество: customer.middle_name || '',
      Компания: customer.company_name || '',
      'Юр. название': customer.legal_name || '',
      УНП: customer.tax_id || '',
      'Уполномоченное лицо': customer.authorized_person || '',
      'Расчётный счёт': customer.bank_details || '',
      Телефон: customer.phone || '',
      Email: customer.email || '',
      Адрес: customer.address || '',
      Примечание: customer.notes || '',
      'Дата создания': customer.created_at ? new Date(customer.created_at).toLocaleDateString('ru-RU') : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Клиенты');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const fileName = `clients-${activeTab}-${dateSuffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [activeTab, customers]);

  const handleImport = useCallback(async (file: File) => {
    try {
      setImportError(null);
      setImportSummary(null);
      setImporting(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setImportError('Файл пустой или не содержит листов');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, value]) => {
          const mapped = headerMap[normalizeHeader(key)];
          if (!mapped) return;
          normalizedRow[mapped] = String(value ?? '').trim();
        });
        const taxId = normalizedRow.tax_id || '';
        const type = resolveCustomerType(normalizedRow.type, taxId);
        let customerPayload: Omit<Customer, 'id' | 'created_at' | 'updated_at'> = {
          type,
          first_name: normalizedRow.first_name || '',
          last_name: normalizedRow.last_name || '',
          middle_name: normalizedRow.middle_name || '',
          company_name: normalizedRow.company_name || '',
          legal_name: normalizedRow.legal_name || '',
          tax_id: taxId || '',
          authorized_person: normalizedRow.authorized_person || '',
          bank_details: normalizedRow.bank_details || '',
          phone: normalizedRow.phone || '',
          email: normalizedRow.email || '',
          address: normalizedRow.address || '',
          notes: normalizedRow.notes || '',
        };

        if (type === 'individual') {
          if (!customerPayload.first_name && !customerPayload.last_name && normalizedRow.name) {
            const nameParts = splitName(normalizedRow.name);
            customerPayload = { ...customerPayload, ...nameParts };
          }
          if (!customerPayload.first_name && !customerPayload.last_name) {
            skipped += 1;
            continue;
          }
        } else {
          if (!customerPayload.company_name && normalizedRow.name) {
            customerPayload.company_name = normalizedRow.name;
          }
          if (!customerPayload.company_name && customerPayload.legal_name) {
            customerPayload.company_name = customerPayload.legal_name;
          }
          if (!customerPayload.company_name) {
            skipped += 1;
            continue;
          }
        }

        try {
          await createCustomer(customerPayload);
          created += 1;
        } catch {
          skipped += 1;
        }
      }
      setImportSummary({ total: rows.length, created, skipped });
      await loadCustomers();
    } catch (err: any) {
      setImportError(err?.message || 'Не удалось импортировать файл');
    } finally {
      setImporting(false);
    }
  }, [loadCustomers]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleImport(file);
      event.target.value = '';
    }
  }, [handleImport]);

  return (
    <AdminPageLayout title="Клиенты CRM" icon="👥" onBack={() => navigate(backTo)} className="customers-page">
      {error && <Alert type="error">{error}</Alert>}
      {importError && <Alert type="error">{importError}</Alert>}
      {importSummary && (
        <Alert type="success">
          Импортировано: {importSummary.created} из {importSummary.total}. Пропущено: {importSummary.skipped}.
        </Alert>
      )}

      <div className="pricing-tabs customers-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'individual' ? 'active' : ''}`}
          onClick={() => setActiveTab('individual')}
        >
          Физлица
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'legal' ? 'active' : ''}`}
          onClick={() => setActiveTab('legal')}
        >
          Юрлица
        </button>
      </div>

      <div className="pricing-section">
        <div className="data-card">
          <div className="card-header">
            <div className="card-title">
              <h4>Список клиентов</h4>
            </div>
            <div className="card-actions">
              <input
                type="text"
                className="customers-search-input"
                placeholder="Поиск по имени, телефону, УНП..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="customers-file-input"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? 'Импорт…' : 'Импорт Excel'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                disabled={loading}
              >
                Экспорт Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={loadCustomers} disabled={loading}>
                {loading ? 'Загрузка…' : 'Обновить'}
              </Button>
            </div>
          </div>
          <div className="card-content">
            <div className="customers-table-wrapper">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>Email</th>
                    <th>Дата создания</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="customers-muted">
                        Нет клиентов этого типа
                      </td>
                    </tr>
                  )}
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className={selectedCustomer?.id === customer.id ? 'customers-row--active' : ''}
                      onClick={() => handleSelectCustomer(customer)}
                    >
                      <td>{getCustomerDisplayName(customer)}</td>
                      <td>{customer.phone || '—'}</td>
                      <td>{customer.email || '—'}</td>
                      <td>{new Date(customer.created_at).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Слайдер с информацией о выбранном клиенте */}
      <>
        {selectedCustomer && (
          <div
            className="customers-slider-backdrop"
            onClick={() => setSelectedCustomer(null)}
          />
        )}
        <div className={`customers-slider ${selectedCustomer ? 'customers-slider--open' : ''}`}>
          {selectedCustomer && (
            <>
              <div className="customers-slider__header">
                <h4 className="customers-slider__title">
                  {getCustomerDisplayName(selectedCustomer)}
                </h4>
                <button
                  type="button"
                  className="customers-slider__close"
                  onClick={() => setSelectedCustomer(null)}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>
              <div className="customers-slider__body">
                <div className="customers-slider__toolbar">
                  <div className="customers-date-filter">
                    <input
                      type="date"
                      value={ordersFrom}
                      onChange={(e) => setOrdersFrom(e.target.value)}
                    />
                    <span>—</span>
                    <input
                      type="date"
                      value={ordersTo}
                      onChange={(e) => setOrdersTo(e.target.value)}
                    />
                  </div>
                  {selectedCustomer.type === 'legal' && (
                    <div className="customers-doc-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportContract}
                        disabled={ordersLoading || generatingDocument === 'contract'}
                      >
                        {generatingDocument === 'contract' ? 'Генерация...' : 'Договор Word'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportAct}
                        disabled={ordersLoading || generatingDocument === 'act'}
                      >
                        {generatingDocument === 'act' ? 'Генерация...' : 'Акт Excel'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportInvoice}
                        disabled={ordersLoading || generatingDocument === 'invoice'}
                      >
                        {generatingDocument === 'invoice' ? 'Генерация...' : 'Счёт Excel'}
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowOrders((prev) => !prev)}
                    disabled={ordersLoading}
                  >
                    {showOrders ? 'Скрыть заказы' : 'Показать заказы'}
                  </Button>
                </div>

                <div className="customers-edit-section">
                  <h5 className="customers-edit-section__title">Данные клиента</h5>
                  <div className="customers-edit-section__fields">
                    {selectedCustomer.type === 'individual' ? (
                      <>
                        <label className="customers-edit-field">
                          <span>Фамилия</span>
                          <input
                            type="text"
                            value={editForm.last_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                            placeholder="Фамилия"
                          />
                        </label>
                        <label className="customers-edit-field">
                          <span>Имя</span>
                          <input
                            type="text"
                            value={editForm.first_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                            placeholder="Имя"
                          />
                        </label>
                        <label className="customers-edit-field">
                          <span>Отчество</span>
                          <input
                            type="text"
                            value={editForm.middle_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, middle_name: e.target.value }))}
                            placeholder="Отчество"
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="customers-edit-field">
                          <span>Название компании</span>
                          <input
                            type="text"
                            value={editForm.company_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, company_name: e.target.value }))}
                            placeholder="Краткое название"
                          />
                        </label>
                        <label className="customers-edit-field">
                          <span>Юр. название</span>
                          <input
                            type="text"
                            value={editForm.legal_name}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, legal_name: e.target.value }))}
                            placeholder="Полное юридическое название"
                          />
                        </label>
                        <label className="customers-edit-field">
                          <span>УНП</span>
                          <input
                            type="text"
                            value={editForm.tax_id}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, tax_id: e.target.value }))}
                            placeholder="УНП"
                          />
                        </label>
                      </>
                    )}
                    <label className="customers-edit-field">
                      <span>Телефон</span>
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+375 ..."
                      />
                    </label>
                    <label className="customers-edit-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="email@example.com"
                      />
                    </label>
                    <label className="customers-edit-field">
                      <span>Адрес</span>
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                        placeholder="Адрес"
                      />
                    </label>
                    <label className="customers-edit-field">
                      <span>Примечание</span>
                      <input
                        type="text"
                        value={editForm.notes}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Заметки"
                      />
                    </label>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveCustomerDetails}
                    disabled={savingCustomer}
                  >
                    {savingCustomer ? 'Сохранение…' : 'Сохранить данные'}
                  </Button>
                </div>

                {selectedCustomer.type === 'legal' && (
                  <div className="customers-legal">
                    <div className="customers-legal__header">
                      <h5>Реквизиты юр. лица</h5>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveLegalDetails}
                        disabled={savingLegal}
                      >
                        {savingLegal ? 'Сохранение…' : 'Сохранить'}
                      </Button>
                    </div>
                    <div className="customers-legal__fields">
                      <label className="customers-legal__field">
                        <span>Расчётный счёт и банк</span>
                        <textarea
                          value={legalForm.bank_details}
                          onChange={(e) =>
                            setLegalForm((prev) => ({ ...prev, bank_details: e.target.value }))
                          }
                          placeholder="IBAN, банк, БИК, адрес"
                        />
                      </label>
                      <label className="customers-legal__field">
                        <span>Уполномоченное лицо</span>
                        <textarea
                          value={legalForm.authorized_person}
                          onChange={(e) =>
                            setLegalForm((prev) => ({ ...prev, authorized_person: e.target.value }))
                          }
                          placeholder="Действует на основании договора, устава и пр."
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="customers-summary">
                  <div className="customers-summary-card">
                    <div className="customers-summary-title">Средний чек</div>
                    <div className="customers-summary-value">
                      {customerMetrics.ordersCount > 0 ? `${customerMetrics.averageCheck.toFixed(2)} BYN` : '—'}
                    </div>
                  </div>
                  <div className="customers-summary-card">
                    <div className="customers-summary-title">Периодичность заказов</div>
                    <div className="customers-summary-value">
                      {customerMetrics.averageIntervalDays === null
                        ? '—'
                        : `${customerMetrics.averageIntervalDays.toFixed(1)} дн.`}
                    </div>
                  </div>
                  <div className="customers-summary-card">
                    <div className="customers-summary-title">Всего заказов</div>
                    <div className="customers-summary-value">{customerMetrics.ordersCount}</div>
                  </div>
                </div>

                {showOrders && (
                  <div className="customers-orders">
                    {ordersLoading ? (
                      <div className="customers-muted">Загрузка заказов...</div>
                    ) : (
                      <div className="customers-table-wrapper">
                        <table className="customers-table">
                          <thead>
                            <tr>
                              <th>Заказ</th>
                              <th>Дата</th>
                              <th>Сумма</th>
                              <th>Статус</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredOrders.length === 0 && (
                              <tr>
                                <td colSpan={4} className="customers-muted">
                                  Нет заказов у этого клиента
                                </td>
                              </tr>
                            )}
                            {filteredOrders.map((order) => (
                              <tr key={order.id}>
                                <td>{order.number || `#${order.id}`}</td>
                                <td>{new Date(order.created_at || (order as any).created_at || '').toLocaleDateString('ru-RU')}</td>
                                <td>{getOrderTotal(order).toFixed(2)} BYN</td>
                                <td>{order.status ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </>
    </AdminPageLayout>
  );
};

export default CustomersAdminPage;
