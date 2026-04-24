import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert } from '../../components/common';
import { createCustomer, getCustomers } from '../../api';
import { Customer } from '../../types';
import * as XLSX from 'xlsx';
import '../../components/admin/ProductManagement.css';
import {
  getCustomerDisplayName,
  getCustomerSourceLabel,
  formatDateValue,
  formatLastOrderAmount,
} from './clients/customerDocumentHelpers';
import './CustomersAdminPage.css';

type CustomerTab = 'individual' | 'legal';

interface CustomersAdminPageProps {
  backTo?: string;
}

const CustomersAdminPage: React.FC<CustomersAdminPageProps> = ({ backTo = '/adminpanel' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<CustomerTab>('individual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
    const rows = customers.map((c) => ({
      Тип: c.type === 'legal' ? 'Юридическое лицо' : 'Физическое лицо',
      Клиент: getCustomerDisplayName(c),
      Фамилия: c.last_name || '',
      Имя: c.first_name || '',
      Отчество: c.middle_name || '',
      Компания: c.company_name || '',
      'Юридическое название': c.legal_name || '',
      УНП: c.tax_id || '',
      'Уполномоченное лицо': c.authorized_person || '',
      'Расчётный счёт': c.bank_details || '',
      Телефон: c.phone || '',
      Email: c.email || '',
      Адрес: c.address || '',
      Примечание: c.notes || '',
      'Дата создания': c.created_at ? new Date(c.created_at).toLocaleDateString('ru-RU') : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Клиенты');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const fileName = `clients-${activeTab}-${dateSuffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }, [activeTab, customers]);

  const handleImport = useCallback(
    async (file: File) => {
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
    },
    [loadCustomers],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleImport(file);
        event.target.value = '';
      }
    },
    [handleImport],
  );

  return (
    <div className="product-management clients-crm-page">
      <div className="product-management__header">
        <div className="product-management__header-left">
          <button type="button" className="lg-btn" onClick={() => navigate(backTo)}>
            ← Назад
          </button>
          <div className="product-management__title-row">
            <AppIcon name="users" size="lg" circle />
            <div>
              <h1 className="product-management__title">Клиенты CRM</h1>
              <p className="product-management__subtitle">Поиск, импорт и экспорт базы клиентов</p>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {importError && <Alert type="error">{importError}</Alert>}
      {importSummary && (
        <Alert type="success">
          Импортировано: {importSummary.created} из {importSummary.total}. Пропущено: {importSummary.skipped}.
        </Alert>
      )}

      <div className="product-controls">
        <div className="product-controls__main-row">
          <div className="product-controls__search-row">
            <div className="product-controls__search">
              <span className="product-controls__search-icon">
                <AppIcon name="search" size="xs" />
              </span>
              <input
                className="product-controls__search-input"
                type="text"
                placeholder="Поиск по имени, телефону, УНП..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="customers-file-input"
            />
            <button
              type="button"
              className="lg-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? 'Импорт…' : 'Импорт Excel'}
            </button>
            <button type="button" className="lg-btn" onClick={handleExport} disabled={loading}>
              Экспорт Excel
            </button>
            <button type="button" className="lg-btn" onClick={loadCustomers} disabled={loading}>
              {loading ? 'Загрузка…' : 'Обновить'}
            </button>
          </div>
        </div>
        <div className="product-quick-filters">
          <button
            type="button"
            className={`product-filter-chip ${activeTab === 'individual' ? 'product-filter-chip--active' : ''}`}
            onClick={() => setActiveTab('individual')}
          >
            <AppIcon name="user" size="xs" />
            <span>Физические лица</span>
            {activeTab === 'individual' && (
              <span className="product-filter-chip__count">{customers.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`product-filter-chip ${activeTab === 'legal' ? 'product-filter-chip--active' : ''}`}
            onClick={() => setActiveTab('legal')}
          >
            <AppIcon name="building" size="xs" />
            <span>Юридические лица</span>
            {activeTab === 'legal' && <span className="product-filter-chip__count">{customers.length}</span>}
          </button>
        </div>
      </div>

      <div className="management-content">
        <div className="products-table-wrapper">
          <table className="customers-table clients-crm__table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>Email</th>
                    <th>Последний заказ</th>
                    <th>Сумма</th>
                    <th>Источник</th>
                    <th>Дата создания</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="customers-muted">
                        Нет клиентов этого типа
                      </td>
                    </tr>
                  )}
                  {customers.map((c) => {
                    const isOpen = location.pathname === `/adminpanel/clients/${c.id}`;
                    return (
                      <tr
                        key={c.id}
                        className={isOpen ? 'customers-row--active' : ''}
                        onClick={() => navigate(`/adminpanel/clients/${c.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/adminpanel/clients/${c.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td>{getCustomerDisplayName(c)}</td>
                        <td>{c.phone || '—'}</td>
                        <td>{c.email || '—'}</td>
                        <td>{c.last_order_at ? formatDateValue(c.last_order_at) : '—'}</td>
                        <td>{formatLastOrderAmount(c.last_order_amount)}</td>
                        <td>{getCustomerSourceLabel(c.source)}</td>
                        <td>{new Date(c.created_at).toLocaleDateString('ru-RU')}</td>
                      </tr>
                    );
                  })}
                </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CustomersAdminPage;
