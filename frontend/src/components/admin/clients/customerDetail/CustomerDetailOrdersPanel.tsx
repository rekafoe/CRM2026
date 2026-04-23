import React from 'react';
import { Order } from '../../../../types';
import { getOrderTotal } from '../../../../pages/admin/clients/customerDocumentHelpers';
import { Button } from '../../../common';
import { CustomerLegalDocumentsSection } from '../CustomerLegalDocumentsSection';

export interface CustomerDetailOrdersLegalBlockProps {
  customerId: number;
  /** Все заказы клиента (для привязки записей в журнале) */
  orders: Order[];
  legalDocsRefresh: number;
  ordersLoading: boolean;
  generatingDocument: string | null;
  onExportContract: () => void;
  onExportAct: () => void;
  onExportInvoice: () => void;
}

interface CustomerDetailOrdersPanelProps {
  ordersLoading: boolean;
  filteredOrders: Order[];
  /** Для юрлица: выгрузки + журнал с привязкой к заказам */
  legalBlock?: CustomerDetailOrdersLegalBlockProps | null;
}

export const CustomerDetailOrdersPanel: React.FC<CustomerDetailOrdersPanelProps> = ({
  ordersLoading,
  filteredOrders,
  legalBlock,
}) => (
  <div className="customer-detail-view__orders-stack">
    {legalBlock && (
      <div className="customer-detail-view__legal-exports">
        <p className="customer-detail-view__doc-intro">
          Выгрузка формирует файлы по заказам за выбранный период; в журнале создаётся отдельная запись на каждый
          заказ (если в периоде нет заказов — одна запись «без заказа в периоде»).
        </p>
        <div className="customers-doc-actions customer-detail-view__doc-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={legalBlock.onExportContract}
            disabled={legalBlock.ordersLoading || legalBlock.generatingDocument === 'contract'}
          >
            {legalBlock.generatingDocument === 'contract' ? 'Генерация...' : 'Договор Word'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={legalBlock.onExportAct}
            disabled={legalBlock.ordersLoading || legalBlock.generatingDocument === 'act'}
          >
            {legalBlock.generatingDocument === 'act' ? 'Генерация...' : 'Акт Excel'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={legalBlock.onExportInvoice}
            disabled={legalBlock.ordersLoading || legalBlock.generatingDocument === 'invoice'}
          >
            {legalBlock.generatingDocument === 'invoice' ? 'Генерация...' : 'Счёт Excel'}
          </Button>
        </div>

        <CustomerLegalDocumentsSection
          key={legalBlock.customerId}
          customerId={legalBlock.customerId}
          orders={legalBlock.orders}
          refreshToken={legalBlock.legalDocsRefresh}
        />
      </div>
    )}

    <div className="customers-orders customer-detail-view__orders">
      <h4 className="customer-detail-view__orders-heading">Заказы за период</h4>
      {ordersLoading ? (
        <div className="customers-muted">Загрузка заказов...</div>
      ) : (
        <div className="customers-table-wrapper">
          <table className="customers-table clients-crm__table">
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
                    Нет заказов у этого клиента за выбранный период
                  </td>
                </tr>
              )}
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.number || `#${order.id}`}</td>
                  <td>
                    {new Date(
                      order.created_at || (order as { created_at?: string }).created_at || '',
                    ).toLocaleDateString('ru-RU')}
                  </td>
                  <td>{getOrderTotal(order).toFixed(2)} BYN</td>
                  <td>{order.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);
