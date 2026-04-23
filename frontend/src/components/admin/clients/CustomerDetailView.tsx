import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LoadingState } from '../../common';
import {
  createCustomerLegalDocument,
  getCustomer,
  getOrders,
  updateCustomer,
  generateDocumentByType,
  generateDocumentByTypeFromOrders,
} from '../../../api';
import { Customer, Order, TemplateData } from '../../../types';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import * as XLSX from 'xlsx';
import '../../admin/ProductManagement.css';
import {
  getCustomerDisplayName,
  getOrderTotal,
  formatDateValue,
  formatDateForFile,
  getOrderItemProductionRows,
  distributeItemSumToRows,
} from '../../../pages/admin/clients/customerDocumentHelpers';
import '../../../pages/admin/CustomersAdminPage.css';
import './CustomerDetailView.css';
import { DEFAULT_CUSTOMER_DETAIL_TAB, type CustomerDetailTab } from './customerDetail/customerDetailTab';
import { CustomerDetailOverviewPanel } from './customerDetail/CustomerDetailOverviewPanel';
import { CustomerDetailProfilePanel } from './customerDetail/CustomerDetailProfilePanel';
import { CustomerDetailOrdersPanel } from './customerDetail/CustomerDetailOrdersPanel';

export const CustomerDetailView: React.FC<{
  customerId: number;
  /** Имя для шапки страницы (AdminPageLayout titleSuffix) */
  onDisplayNameChange?: (displayName: string | null) => void;
}> = ({ customerId, onDisplayNameChange }) => {
  const [pageLoading, setPageLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>(DEFAULT_CUSTOMER_DETAIL_TAB);
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
  const [generatingDocument, setGeneratingDocument] = useState<string | null>(null);
  const [legalDocsRefresh, setLegalDocsRefresh] = useState(0);

  const refreshCustomer = useCallback(async () => {
    try {
      const res = await getCustomer(customerId);
      if (res.data) setCustomer(res.data);
    } catch {
      // список обновит родитель при необходимости
    }
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageLoading(true);
      setError(null);
      setCustomer(null);
      try {
        const res = await getCustomer(customerId);
        if (cancelled) return;
        setCustomer(res.data);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Не удалось загрузить клиента');
          setCustomer(null);
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!onDisplayNameChange) return;
    if (customer) {
      onDisplayNameChange(getCustomerDisplayName(customer));
    } else {
      onDisplayNameChange(null);
    }
  }, [customer, onDisplayNameChange]);

  useEffect(() => {
    if (!customer || customer.type !== 'legal') {
      setLegalForm({ bank_details: '', authorized_person: '' });
      return;
    }
    setLegalForm({
      bank_details: customer.bank_details || '',
      authorized_person: customer.authorized_person || '',
    });
  }, [customer]);

  useEffect(() => {
    if (!customer) {
      setEditForm({
        first_name: '', last_name: '', middle_name: '', company_name: '', legal_name: '', tax_id: '',
        phone: '', email: '', address: '', notes: '',
      });
      return;
    }
    setEditForm({
      first_name: customer.first_name ?? '',
      last_name: customer.last_name ?? '',
      middle_name: customer.middle_name ?? '',
      company_name: customer.company_name ?? '',
      legal_name: customer.legal_name ?? '',
      tax_id: customer.tax_id ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
  }, [customer]);

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

  useEffect(() => {
    if (!customer) {
      setOrders([]);
      return;
    }
    void loadOrdersForCustomer(customer);
  }, [customer, loadOrdersForCustomer]);

  useEffect(() => {
    setActiveTab(DEFAULT_CUSTOMER_DETAIL_TAB);
  }, [customerId]);

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
    if (!customer) {
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
  }, [filteredOrders, customer]);

  const recordLegalExport = useCallback(
    async (kind: 'act' | 'invoice' | 'contract') => {
      if (!customer || customer.type !== 'legal') return;
      const dayStr = new Date().toLocaleDateString('ru-RU');
      const mkTitle = (orderRef: string) =>
        kind === 'act'
          ? `Акт (Excel) — ${orderRef} — ${dayStr}`
          : kind === 'invoice'
            ? `Счёт (Excel) — ${orderRef} — ${dayStr}`
            : `Договор (Word) — ${orderRef} — ${dayStr}`;
      try {
        if (filteredOrders.length === 0) {
          await createCustomerLegalDocument(customer.id, {
            title: mkTitle('без заказа в периоде'),
            document_kind: kind,
            issued_at: new Date().toISOString(),
            returned_at: null,
            notes: 'В выбранном периоде нет заказов; сводная выгрузка',
            order_id: null,
          });
        } else {
          for (const order of filteredOrders) {
            const orderRef = order.number || `№${order.id}`;
            await createCustomerLegalDocument(customer.id, {
              title: mkTitle(orderRef),
              document_kind: kind,
              issued_at: new Date().toISOString(),
              returned_at: null,
              notes: null,
              order_id: order.id,
            });
          }
        }
        setLegalDocsRefresh((n) => n + 1);
        await refreshCustomer();
      } catch (e) {
        console.warn('[Клиенты] Не удалось записать документ в журнал', e);
      }
    },
    [customer, refreshCustomer, filteredOrders],
  );

  const handleSaveLegalDetails = useCallback(async () => {
    if (!customer || customer.type !== 'legal') return;
    try {
      setSavingLegal(true);
      const { data } = await updateCustomer(customer.id, {
        bank_details: legalForm.bank_details.trim(),
        authorized_person: legalForm.authorized_person.trim(),
      });
      if (data) setCustomer(data);
      await refreshCustomer();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить реквизиты');
    } finally {
      setSavingLegal(false);
    }
  }, [customer, legalForm, refreshCustomer]);

  const handleSaveCustomerDetails = useCallback(async () => {
    if (!customer) return;
    try {
      setSavingCustomer(true);
      setError(null);
      const payload: Parameters<typeof updateCustomer>[1] = {
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      };
      if (customer.type === 'individual') {
        payload.first_name = editForm.first_name.trim();
        payload.last_name = editForm.last_name.trim();
        payload.middle_name = editForm.middle_name.trim() || undefined;
      } else {
        payload.company_name = editForm.company_name.trim();
        payload.legal_name = editForm.legal_name.trim() || undefined;
        payload.tax_id = editForm.tax_id.trim() || undefined;
      }
      const { data } = await updateCustomer(customer.id, payload);
      if (data) setCustomer(data);
      await refreshCustomer();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить данные клиента');
    } finally {
      setSavingCustomer(false);
    }
  }, [customer, editForm, refreshCustomer]);

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
    if (!customer) return;
    
    try {
      setGeneratingDocument('act');
      const orderIds = filteredOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        try {
          const response = await generateDocumentByTypeFromOrders('act', orderIds);
          const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          let filename = `АКТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`;
          const contentDisposition = response.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch?.[1]) {
              try {
                filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
              } catch {
                filename = filenameMatch[1].replace(/['"]/g, '');
              }
            }
          }
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          void recordLegalExport('act');
          return;
        } catch (fromOrdersErr: any) {
          const msg = fromOrdersErr?.message || '';
          if (!msg.includes('404') && !msg.includes('не найден') && !msg.includes('Шаблон')) {
            setError(`Ошибка генерации акта: ${msg || 'Неизвестная ошибка'}`);
            return;
          }
        }
      }

      // Запасной вариант: сбор строк на фронте (если бэкенд не вернул документ)
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
          const rowAmounts = distributeItemSumToRows(itemAmount, lines);
          lines.forEach((line, idx) => {
            const rowAmount = rowAmounts[idx] ?? 0;
            const rowPrice = line.quantity > 0 && rowAmount > 0
              ? Math.round((rowAmount / line.quantity) * 100) / 100
              : 0;
            allOrderItems.push({
              number: itemNumber++,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity,
              price: rowPrice,
              amount: rowAmount,
              vatRate,
              vatAmount,
              totalWithVat: rowAmount,
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
          customerName: customer.company_name || customer.legal_name || getCustomerDisplayName(customer),
          companyName: customer.company_name || '',
          legalName: customer.legal_name || '',
          legalAddress: customer.address || '—',
          taxId: customer.tax_id || '—',
          bankDetails: customer.type === 'legal' ? (legalForm.bank_details.trim() || customer.bank_details || '—') : (customer.bank_details || '—'),
          authorizedPerson: customer.type === 'legal' ? (legalForm.authorized_person.trim() || customer.authorized_person || '—') : (customer.authorized_person || '—'),
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
        let filename = `АКТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`; // Fallback
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
        void recordLegalExport('act');
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
      const fileName = `АКТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      void recordLegalExport('act');
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать акт');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, recordLegalExport, customer]);

  const handleExportInvoice = useCallback(async () => {
    if (!customer) return;
    
    try {
      setGeneratingDocument('invoice');
      const orderIds = filteredOrders.map((o) => o.id);
      if (orderIds.length > 0) {
        try {
          const response = await generateDocumentByTypeFromOrders('invoice', orderIds);
          const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          let filename = `СЧЁТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`;
          const contentDisposition = response.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch?.[1]) {
              try {
                filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
              } catch {
                filename = filenameMatch[1].replace(/['"]/g, '');
              }
            }
          }
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          void recordLegalExport('invoice');
          return;
        } catch (fromOrdersErr: any) {
          const msg = fromOrdersErr?.message || '';
          if (!msg.includes('404') && !msg.includes('не найден') && !msg.includes('Шаблон')) {
            setError(`Ошибка генерации счёта: ${msg || 'Неизвестная ошибка'}`);
            return;
          }
        }
      }

      // Запасной вариант: сбор строк на фронте
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
          const rowAmounts = distributeItemSumToRows(itemAmount, lines);
          lines.forEach((line, idx) => {
            const rowAmount = rowAmounts[idx] ?? 0;
            const rowPrice = line.quantity > 0 && rowAmount > 0
              ? Math.round((rowAmount / line.quantity) * 100) / 100
              : 0;
            allOrderItems.push({
              number: itemNumber++,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity,
              price: rowPrice,
              amount: rowAmount,
              vatRate: 'Без НДС',
              vatAmount: 0,
              totalWithVat: rowAmount,
            });
          });
        }
      }
      
      // Пытаемся использовать шаблон
      try {
        const templateData: TemplateData = {
          customerName: customer.company_name || customer.legal_name || getCustomerDisplayName(customer),
          companyName: customer.company_name || '',
          legalName: customer.legal_name || '',
          legalAddress: customer.address || '—',
          taxId: customer.tax_id || '—',
          bankDetails: customer.type === 'legal' ? (legalForm.bank_details.trim() || customer.bank_details || '—') : (customer.bank_details || '—'),
          authorizedPerson: customer.type === 'legal' ? (legalForm.authorized_person.trim() || customer.authorized_person || '—') : (customer.authorized_person || '—'),
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
        let filename = `СЧЁТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`; // Fallback
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
        void recordLegalExport('invoice');
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
      const fileName = `СЧЁТ-${formatDateForFile(new Date())}-${customer.id}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      void recordLegalExport('invoice');
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать счёт');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, recordLegalExport, customer]);

  const handleExportContract = useCallback(async () => {
    if (!customer) return;
    
    try {
      setGeneratingDocument('contract');
      
      const contractNumber = `CONTRACT-${formatDateForFile(new Date())}-${customer.id}`;
      const customerName = customer.company_name || customer.legal_name || getCustomerDisplayName(customer);
      
      // Пытаемся использовать шаблон
      try {
        const templateData: TemplateData = {
          customerName,
          companyName: customer.company_name || '',
          legalName: customer.legal_name || '',
          legalAddress: customer.address || '—',
          taxId: customer.tax_id || '—',
          bankDetails: customer.type === 'legal' ? (legalForm.bank_details.trim() || customer.bank_details || '—') : (customer.bank_details || '—'),
          authorizedPerson: customer.type === 'legal' ? (legalForm.authorized_person.trim() || customer.authorized_person || '—') : (customer.authorized_person || '—'),
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
        void recordLegalExport('contract');
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
      const bankDetails = customer.type === 'legal' ? (legalForm.bank_details.trim() || customer.bank_details || '—') : (customer.bank_details || '—');
      const authorizedPerson = customer.type === 'legal' ? (legalForm.authorized_person.trim() || customer.authorized_person || '—') : (customer.authorized_person || '—');
      const legalAddress = customer.address || '—';

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
                  new TextRun({ text: customer.tax_id || '—' }),
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
      void recordLegalExport('contract');
    } catch (error: any) {
      setError(error?.message || 'Не удалось создать договор');
    } finally {
      setGeneratingDocument(null);
    }
  }, [buildOrdersTableRows, filteredOrders, legalForm, recordLegalExport, customer]);

  if (pageLoading) {
    return (
      <div className="pm-loading">
        <LoadingState message="Загрузка карточки клиента…" />
      </div>
    );
  }

  if (!customer) {
    return <Alert type="error">{error || 'Клиент не найден'}</Alert>;
  }

  const tabItems: { key: CustomerDetailTab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'profile', label: 'Данные' },
    {
      key: 'orders',
      label: customer.type === 'legal' ? 'Заказы и документы' : 'Заказы',
    },
  ];
  const visibleTabs = tabItems;
  const displayName = getCustomerDisplayName(customer);

  return (
    <>
      {error && <Alert type="error">{error}</Alert>}
      <div className="customer-detail-view">
        <div className="product-controls">
          <div
            className="product-quick-filters customer-detail-view__chips"
            role="tablist"
            aria-label="Разделы карточки клиента"
          >
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`product-filter-chip ${activeTab === tab.key ? 'product-filter-chip--active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="customer-detail-view__period">
            <span className="customer-detail-view__period-label">Период</span>
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
            <p className="customer-detail-view__period-hint">
              Метрики, список заказов и выгрузка документов учитывают выбранный период; если даты не заданы — учитываются
              все заказы.
            </p>
          </div>
        </div>

        <div className="management-content customer-detail-view__content">
          {activeTab === 'overview' && (
            <CustomerDetailOverviewPanel
              customer={customer}
              displayName={displayName}
              customerMetrics={customerMetrics}
            />
          )}
          {activeTab === 'profile' && (
            <CustomerDetailProfilePanel
              customer={customer}
              editForm={editForm}
              setEditForm={setEditForm}
              onSaveDetails={handleSaveCustomerDetails}
              savingCustomer={savingCustomer}
              legalForm={legalForm}
              setLegalForm={setLegalForm}
              onSaveLegal={handleSaveLegalDetails}
              savingLegal={savingLegal}
            />
          )}
          {activeTab === 'orders' && (
            <CustomerDetailOrdersPanel
              ordersLoading={ordersLoading}
              filteredOrders={filteredOrders}
              legalBlock={
                customer.type === 'legal'
                  ? {
                      customerId: customer.id,
                      orders,
                      legalDocsRefresh,
                      ordersLoading,
                      generatingDocument,
                      onExportContract: handleExportContract,
                      onExportAct: handleExportAct,
                      onExportInvoice: handleExportInvoice,
                    }
                  : null
              }
            />
          )}
        </div>
      </div>
    </>
  );
};
