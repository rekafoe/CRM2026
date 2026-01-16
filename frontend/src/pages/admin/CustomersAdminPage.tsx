import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button } from '../../components/common';
import { getCustomers, getOrders } from '../../api';
import { Customer, Order } from '../../types';
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

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCustomers({ type: activeTab });
      setCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setSelectedCustomer(null);
    setOrders([]);
    setShowOrders(false);
  }, [activeTab]);

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

  const customerMetrics = useMemo(() => {
    if (!selectedCustomer) {
      return {
        ordersCount: 0,
        averageCheck: 0,
        averageIntervalDays: null as number | null,
      };
    }
    if (orders.length === 0) {
      return {
        ordersCount: 0,
        averageCheck: 0,
        averageIntervalDays: null,
      };
    }
    const total = orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    const averageCheck = total / orders.length;
    const sorted = [...orders].sort((a, b) => {
      const aDate = new Date(a.created_at || (a as any).created_at || 0).getTime();
      const bDate = new Date(b.created_at || (b as any).created_at || 0).getTime();
      return aDate - bDate;
    });
    if (sorted.length < 2) {
      return { ordersCount: orders.length, averageCheck, averageIntervalDays: null };
    }
    const intervals = sorted.slice(1).map((order, index) => {
      const prev = sorted[index];
      const diffMs = new Date(order.created_at || (order as any).created_at || 0).getTime() -
        new Date(prev.created_at || (prev as any).created_at || 0).getTime();
      return Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
    });
    const averageIntervalDays = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    return { ordersCount: orders.length, averageCheck, averageIntervalDays };
  }, [orders, selectedCustomer]);

  return (
    <AdminPageLayout title="Клиенты CRM" icon="👥" onBack={() => navigate('/adminpanel')}>
      {error && <Alert type="error">{error}</Alert>}

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
                          {orders.length === 0 && (
                            <tr>
                              <td colSpan={4} className="customers-muted">
                                Нет заказов у этого клиента
                              </td>
                            </tr>
                          )}
                          {orders.map((order) => (
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
