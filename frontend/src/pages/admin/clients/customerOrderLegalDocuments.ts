import type { Customer, Order, TemplateData } from '../../../types';
import {
  createCustomerLegalDocument,
  generateDocumentByType,
  generateDocumentByTypeFromOrders,
} from '../../../api';
import { downloadAxiosBlob } from '../../../utils/downloadBlob';
import {
  formatDateForFile,
  formatDateValue,
  getCustomerDisplayName,
  getOrderTotal,
} from './customerDocumentHelpers';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type OrderLegalDocKind = 'contract' | 'act' | 'invoice';

export const ORDER_LEGAL_DOC_LABELS: Record<OrderLegalDocKind, string> = {
  contract: 'Договор',
  act: 'Акт',
  invoice: 'Счёт',
};

export function buildContractTemplateData(customer: Customer, order: Order): TemplateData {
  const orderRef = order.number || `#${order.id}`;
  return {
    customerName: customer.company_name || customer.legal_name || getCustomerDisplayName(customer),
    companyName: customer.company_name || '',
    legalName: customer.legal_name || '',
    legalAddress: customer.address || '—',
    taxId: customer.tax_id || '—',
    bankDetails: customer.bank_details || '—',
    authorizedPerson: customer.authorized_person || '—',
    contractNumber: `CONTRACT-${formatDateForFile(new Date())}-${order.id}`,
    contractDate: new Date().toLocaleDateString('ru-RU'),
    orders: [
      {
        number: orderRef,
        date: formatDateValue(order.created_at),
        amount: getOrderTotal(order),
        status: String(order.status ?? '—'),
      },
    ],
    totalAmount: getOrderTotal(order),
  };
}

export async function recordOrderLegalExport(
  customerId: number,
  order: Order,
  kind: OrderLegalDocKind,
): Promise<void> {
  const orderRef = order.number || `№${order.id}`;
  const dayStr = new Date().toLocaleDateString('ru-RU');
  const title =
    kind === 'act'
      ? `Акт (Excel) — ${orderRef} — ${dayStr}`
      : kind === 'invoice'
        ? `Счёт (Excel) — ${orderRef} — ${dayStr}`
        : `Договор (Word) — ${orderRef} — ${dayStr}`;
  await createCustomerLegalDocument(customerId, {
    title,
    document_kind: kind,
    issued_at: new Date().toISOString(),
    returned_at: null,
    notes: null,
    order_id: order.id,
  });
}

export async function generateCustomerOrderLegalDocument(args: {
  customer: Customer;
  order: Order;
  kind: OrderLegalDocKind;
}): Promise<void> {
  const { customer, order, kind } = args;
  const orderRef = order.number || String(order.id);
  if (kind === 'act' || kind === 'invoice') {
    const response = await generateDocumentByTypeFromOrders(kind, [order.id]);
    downloadAxiosBlob(
      response,
      kind === 'act' ? `АКТ-${orderRef}.xlsx` : `СЧЁТ-${orderRef}.xlsx`,
      XLSX_MIME,
    );
  } else {
    const response = await generateDocumentByType('contract', buildContractTemplateData(customer, order));
    downloadAxiosBlob(response, `CONTRACT-${orderRef}.docx`, DOCX_MIME);
  }
  try {
    await recordOrderLegalExport(customer.id, order, kind);
  } catch (journalError) {
    console.warn('[Клиенты] Не удалось записать документ в журнал', journalError);
  }
}
