import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon, MoneyAmount } from '../../components/ui';
import { Alert } from '../../components/common';
import { createCustomer, getCustomers, getCustomersPage } from '../../api';
import { Customer } from '../../types';
import * as XLSX from 'xlsx';
import {
  getCustomerDisplayName,
  getCustomerSourceLabel,
  formatDateValue,
} from './clients/customerDocumentHelpers';
import './CustomersAdminPage.css';

type CustomerTab = 'individual' | 'legal';

const PAGE_SIZE = 50;

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
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
      const res = await getCustomersPage({
        type: activeTab,
        search: debouncedQuery || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      const payload = res.data;
      const rows = Array.isArray(payload?.customers) ? payload.customers : [];
      const nextTotal = typeof payload?.total === 'number' ? payload.total : rows.length;
      if (page > 0 && page * PAGE_SIZE >= nextTotal) {
        setPage(Math.max(0, Math.ceil(nextTotal / PAGE_SIZE) - 1));
        return;
      }
      setCustomers(rows);
      setTotal(nextTotal);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedQuery, page]);

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

  const handleExport = useCallback(async () => {
    setImportError(null);
    try {
      const res = await getCustomers({
        type: activeTab,
        search: debouncedQuery || undefined,
        stats: 0,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      if (list.length === 0) {
        setImportError('Нет клиентов для экспорта');
        return;
      }
    const rows = list.map((c) => ({
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
    } catch (err: any) {
      setImportError(err?.message || 'Не удалось выгрузить клиентов');
    }
  }, [activeTab, debouncedQuery]);

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

  const rangeFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, page * PAGE_SIZE + customers.length);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPageLayout
      title="Клиенты"
      description="Поиск, импорт и карточки базы"
      icon={<AppIcon name="users" size="md" />}
      backTo={backTo}
      className="clients-layout"
      headerExtra={
        <div className="clients-header-actions">
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
            {importing ? 'Импорт…' : 'Импорт'}
          </button>
          <button type="button" className="lg-btn" onClick={() => void handleExport()} disabled={loading}>
            Экспорт
          </button>
          <button type="button" className="lg-btn lg-btn--primary" onClick={() => void loadCustomers()} disabled={loading}>
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
        </div>
      }
    >
      <div className="clients-admin">
        {error && <Alert type="error">{error}</Alert>}
        {importError && <Alert type="error">{importError}</Alert>}
        {importSummary && (
          <Alert type="success">
            Импортировано: {importSummary.created} из {importSummary.total}. Пропущено: {importSummary.skipped}.
          </Alert>
        )}

        <div className="clients-toolbar">
          <div className="clients-tabs" role="tablist">
            <button
              type="button"
              className={`lg-btn${activeTab === 'individual' ? ' lg-btn--primary' : ''}`}
              onClick={() => {
                setActiveTab('individual');
                setPage(0);
              }}
            >
              Физические лица
              {activeTab === 'individual' ? <span className="clients-tab-count">{total}</span> : null}
            </button>
            <button
              type="button"
              className={`lg-btn${activeTab === 'legal' ? ' lg-btn--primary' : ''}`}
              onClick={() => {
                setActiveTab('legal');
                setPage(0);
              }}
            >
              Юридические лица
              {activeTab === 'legal' ? <span className="clients-tab-count">{total}</span> : null}
            </button>
          </div>
          <label className="clients-search">
            <AppIcon name="search" size="xs" />
            <input
              type="search"
              placeholder="Имя, телефон, почта, УНП"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>

        <div className="clients-table-card">
          <div className="clients-table-scroll">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th>Последний заказ</th>
                  <th>Сумма</th>
                  <th>Источник</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {loading && customers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="clients-table-empty">
                      Загрузка клиентов…
                    </td>
                  </tr>
                )}
                {!loading && customers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="clients-table-empty">
                      {debouncedQuery ? 'Ничего не найдено' : 'Нет клиентов этого типа'}
                    </td>
                  </tr>
                )}
                {customers.map((c) => {
                  const isOpen = location.pathname === `/adminpanel/clients/${c.id}`;
                  return (
                    <tr
                      key={c.id}
                      className={isOpen ? 'clients-row--active' : ''}
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
                      <td><MoneyAmount value={c.last_order_amount} /></td>
                      <td>{getCustomerSourceLabel(c.source)}</td>
                      <td>{new Date(c.created_at).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="clients-pager">
            <span>
              {total === 0 ? '0 клиентов' : `${rangeFrom}–${rangeTo} из ${total}`}
            </span>
            <div className="clients-pager-actions">
              <button
                type="button"
                className="lg-btn"
                disabled={page <= 0 || loading}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Назад
              </button>
              <span className="clients-pager-page">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="lg-btn"
                disabled={loading || (page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Дальше
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
};

export default CustomersAdminPage;
