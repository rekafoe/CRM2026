import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer, Order, TemplateData } from '../../../types';
import {
  createCustomerLegalDocument,
  generateDocumentByType,
  generateDocumentByTypeFromOrders,
  getCustomer,
} from '../../../api';
import {
  formatDateForFile,
  formatDateValue,
  getCustomerDisplayName,
  getOrderTotal,
} from '../../../pages/admin/clients/customerDocumentHelpers';
import { downloadAxiosBlob, getApiErrorMessage } from '../../../utils/downloadBlob';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type OrderLegalDocKind = 'contract' | 'act' | 'invoice';

function buildContractTemplateData(customer: Customer, order: Order): TemplateData {
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

async function recordOrderLegalExport(customerId: number, order: Order, kind: OrderLegalDocKind): Promise<void> {
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

interface UseOrderLegalDocumentsParams {
  order: Order;
  addToast: (toast: { type: 'success' | 'error'; title: string; message: string }) => void;
}

export function useOrderLegalDocuments({ order, addToast }: UseOrderLegalDocumentsParams) {
  const [legalCustomer, setLegalCustomer] = useState<Customer | null>(null);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);
  const [generatingKind, setGeneratingKind] = useState<OrderLegalDocKind | null>(null);
  const docsMenuRef = useRef<HTMLDivElement>(null);
  const customerId = Number(order.customer_id) || 0;

  useEffect(() => {
    if (!customerId) {
      setLegalCustomer(null);
      return;
    }
    let cancelled = false;
    getCustomer(customerId)
      .then((res) => {
        if (cancelled) return;
        const customer = res.data;
        setLegalCustomer(customer?.type === 'legal' ? customer : null);
      })
      .catch(() => {
        if (!cancelled) setLegalCustomer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!docsMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (docsMenuRef.current && !docsMenuRef.current.contains(e.target as Node)) {
        setDocsMenuOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [docsMenuOpen]);

  const generateLegalDocument = useCallback(
    async (kind: OrderLegalDocKind) => {
      if (!legalCustomer) return;
      setDocsMenuOpen(false);
      setGeneratingKind(kind);
      const orderRef = order.number || String(order.id);
      try {
        if (kind === 'act' || kind === 'invoice') {
          const response = await generateDocumentByTypeFromOrders(kind, [order.id]);
          downloadAxiosBlob(
            response,
            kind === 'act' ? `АКТ-${orderRef}.xlsx` : `СЧЁТ-${orderRef}.xlsx`,
            XLSX_MIME,
          );
        } else {
          const response = await generateDocumentByType('contract', buildContractTemplateData(legalCustomer, order));
          downloadAxiosBlob(response, `CONTRACT-${orderRef}.docx`, DOCX_MIME);
        }
        try {
          await recordOrderLegalExport(legalCustomer.id, order, kind);
        } catch (journalError) {
          console.warn('[Заказ] Не удалось записать документ в журнал', journalError);
        }
        const labels: Record<OrderLegalDocKind, string> = {
          contract: 'Договор',
          act: 'Акт',
          invoice: 'Счёт',
        };
        addToast({ type: 'success', title: 'Успешно', message: `${labels[kind]} по заказу скачан` });
      } catch (error) {
        const message = await getApiErrorMessage(error, 'Не удалось сформировать документ');
        addToast({ type: 'error', title: 'Ошибка', message });
      } finally {
        setGeneratingKind(null);
      }
    },
    [addToast, legalCustomer, order],
  );

  return {
    showLegalDocsButton: Boolean(legalCustomer),
    docsMenuOpen,
    setDocsMenuOpen,
    docsMenuRef,
    generatingKind,
    generateLegalDocument,
  };
}
