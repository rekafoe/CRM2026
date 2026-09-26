import React, { useCallback, useState } from 'react';
import { Customer, Order } from '../../../../types';
import { Button } from '../../../common';
import { MoneyAmount } from '../../../ui';
import { formatDateValue, getOrderTotal } from '../../../../pages/admin/clients/customerDocumentHelpers';
import {
  generateCustomerOrderLegalDocument,
  ORDER_LEGAL_DOC_LABELS,
  type OrderLegalDocKind,
} from '../../../../pages/admin/clients/customerOrderLegalDocuments';
import { getApiErrorMessage } from '../../../../utils/downloadBlob';

interface CustomerDetailAllOrdersPanelProps {
  customer: Customer;
  orders: Order[];
  ordersLoading: boolean;
  onDocumentGenerated?: () => void;
}

export const CustomerDetailAllOrdersPanel: React.FC<CustomerDetailAllOrdersPanelProps> = ({
  customer,
  orders,
  ordersLoading,
  onDocumentGenerated,
}) => {
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(
    async (order: Order, kind: OrderLegalDocKind) => {
      setError(null);
      if (Number(order.customer_id) !== Number(customer.id)) {
        setError('Заказ не относится к этому клиенту — обновите список заказов');
        return;
      }
      setGeneratingKey(`${order.id}:${kind}`);
      try {
        await generateCustomerOrderLegalDocument({ customer, order, kind });
        onDocumentGenerated?.();
      } catch (err) {
        setError(await getApiErrorMessage(err, `Не удалось сформировать ${ORDER_LEGAL_DOC_LABELS[kind].toLowerCase()}`));
      } finally {
        setGeneratingKey(null);
      }
    },
    [customer, onDocumentGenerated],
  );

  return (
    <div className="customers-orders customer-detail-view__orders">
      <h4 className="customer-detail-view__orders-heading">Все заказы клиента</h4>
      <p className="customer-detail-view__doc-intro">
        Полный список заказов этого юрлица, без фильтра периода и без лимита пула. Документы формируются по выбранному заказу.
      </p>
      {error && <div className="customers-muted customer-detail-all-orders__error">{error}</div>}
      {ordersLoading ? (
        <div className="customers-muted">Загрузка заказов...</div>
      ) : (
        <div className="customers-table-wrapper">
          <table className="customers-table clients-crm__table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Дата заказа</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Документы</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="customers-muted">
                    У этого клиента пока нет заказов
                  </td>
                </tr>
              )}
              {orders.map((order) => {
                const busy = generatingKey?.startsWith(`${order.id}:`);
                return (
                  <tr key={order.id}>
                    <td>{order.number || `#${order.id}`}</td>
                    <td>{formatDateValue(order.created_at || (order as { created_at?: string }).created_at)}</td>
                    <td><MoneyAmount value={getOrderTotal(order)} /></td>
                    <td>{order.status ?? '—'}</td>
                    <td>
                      <div className="customer-detail-all-orders__docs">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(busy)}
                          onClick={() => void handleGenerate(order, 'contract')}
                        >
                          {generatingKey === `${order.id}:contract` ? 'Генерация...' : 'Договор'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(busy)}
                          onClick={() => void handleGenerate(order, 'act')}
                        >
                          {generatingKey === `${order.id}:act` ? 'Генерация...' : 'Акт'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(busy)}
                          onClick={() => void handleGenerate(order, 'invoice')}
                        >
                          {generatingKey === `${order.id}:invoice` ? 'Генерация...' : 'Счёт'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
