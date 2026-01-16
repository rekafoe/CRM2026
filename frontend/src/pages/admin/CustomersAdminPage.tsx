import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button } from '../../components/common';
import { createCustomer, getCustomers, getOrders, updateCustomer } from '../../api';
import { Customer, Order } from '../../types';
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

const getOrderTotal = (order: Order) => {
  const anyOrder = order as any;
  return Number(order.totalAmount ?? anyOrder.total_amount ?? 0);
};

const formatDateValue = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU');
};

const formatDateForFile = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');

const CustomersAdminPage: React.FC = () => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ total: number; created: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const loadOrdersForCustomer = useCallback(async (customer: Customer) => {
    try {
      setOrdersLoading(true);
      const res = await getOrders();
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
      await updateCustomer(selectedCustomer.id, {
        bank_details: legalForm.bank_details.trim(),
        authorized_person: legalForm.authorized_person.trim(),
      });
      await loadCustomers();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить реквизиты');
    } finally {
      setSavingLegal(false);
    }
  }, [legalForm, loadCustomers, selectedCustomer]);

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

  const handleExportAct = useCallback(() => {
    if (!selectedCustomer) return;
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
  }, [buildOrdersTableRows, filteredOrders, selectedCustomer]);

  const handleExportInvoice = useCallback(() => {
    if (!selectedCustomer) return;
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
  }, [buildOrdersTableRows, filteredOrders, selectedCustomer]);

  const handleExportContract = useCallback(async () => {
    if (!selectedCustomer) return;
    const title = `ДОГОВОР № CONTRACT-${formatDateForFile(new Date())}-${selectedCustomer.id}`;
    const customerName = selectedCustomer.company_name || selectedCustomer.legal_name || getCustomerDisplayName(selectedCustomer);
    const bankDetails = selectedCustomer.bank_details || '—';
    const authorizedPerson = selectedCustomer.authorized_person || '—';
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
    link.download = `CONTRACT-${formatDateForFile(new Date())}-${selectedCustomer.id}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [buildOrdersTableRows, filteredOrders, selectedCustomer]);

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
    <AdminPageLayout title="Клиенты CRM" icon="👥" onBack={() => navigate('/adminpanel')}>
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

      {selectedCustomer && (
        <div className="pricing-section">
          <div className="data-card">
            <div className="card-header">
              <div className="card-title">
                <h4>Сводка клиента</h4>
              </div>
              <div className="card-actions">
                <div className="customers-date-filter">
                  <input
                    type="date"
                    value={ordersFrom}
                    onChange={(event) => setOrdersFrom(event.target.value)}
                  />
                  <span>—</span>
                  <input
                    type="date"
                    value={ordersTo}
                    onChange={(event) => setOrdersTo(event.target.value)}
                  />
                </div>
                {selectedCustomer.type === 'legal' && (
                  <div className="customers-doc-actions">
                    <Button variant="secondary" size="sm" onClick={handleExportContract} disabled={ordersLoading}>
                      Договор Word
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleExportAct} disabled={ordersLoading}>
                      Акт Excel
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleExportInvoice} disabled={ordersLoading}>
                      Счёт Excel
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
            </div>
            <div className="card-content">
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
                        onChange={(event) =>
                          setLegalForm((prev) => ({ ...prev, bank_details: event.target.value }))
                        }
                        placeholder="IBAN, банк, БИК, адрес"
                      />
                    </label>
                    <label className="customers-legal__field">
                      <span>Уполномоченное лицо</span>
                      <textarea
                        value={legalForm.authorized_person}
                        onChange={(event) =>
                          setLegalForm((prev) => ({ ...prev, authorized_person: event.target.value }))
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
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
};

export default CustomersAdminPage;
