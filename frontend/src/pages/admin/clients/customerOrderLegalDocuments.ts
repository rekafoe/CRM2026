import type { Customer, Order } from '../../../types';
import { generateDocumentByTypeFromOrders } from '../../../api';
import { downloadAxiosBlob } from '../../../utils/downloadBlob';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type OrderLegalDocKind = 'contract' | 'act' | 'invoice' | 'tn';

export const ORDER_LEGAL_DOC_LABELS: Record<OrderLegalDocKind, string> = {
  contract: 'Договор',
  act: 'Акт',
  invoice: 'Счёт',
  tn: 'Товарная накладная',
};

export async function generateCustomerOrderLegalDocument(args: {
  customer: Customer;
  order: Order;
  kind: OrderLegalDocKind;
}): Promise<void> {
  const { order, kind } = args;
  const orderRef = order.number || String(order.id);
  const response = await generateDocumentByTypeFromOrders(kind, [order.id]);
  const fallbackName =
    kind === 'act'
      ? `АКТ-${orderRef}.xlsx`
      : kind === 'invoice'
        ? `СЧЁТ-${orderRef}.xlsx`
        : kind === 'tn'
          ? `ТН-${orderRef}.xlsx`
          : `ДОГОВОР-${orderRef}.docx`;
  downloadAxiosBlob(response, fallbackName, kind === 'contract' ? DOCX_MIME : XLSX_MIME);
}
