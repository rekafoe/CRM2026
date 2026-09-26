import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer, Order } from '../../../types';
import { getCustomer } from '../../../api';
import { getApiErrorMessage } from '../../../utils/downloadBlob';
import {
  generateCustomerOrderLegalDocument,
  ORDER_LEGAL_DOC_LABELS,
  type OrderLegalDocKind,
} from '../../../pages/admin/clients/customerOrderLegalDocuments';

export type { OrderLegalDocKind } from '../../../pages/admin/clients/customerOrderLegalDocuments';

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
  // Не показывать кнопку/меню, пока подтянут клиент именно этого заказа
  // (иначе после смены заказа в пуле остаётся previous legalCustomer → чужой договор).
  const matchedLegalCustomer =
    legalCustomer && Number(legalCustomer.id) === customerId ? legalCustomer : null;

  useEffect(() => {
    setDocsMenuOpen(false);
    setLegalCustomer(null);
    if (!customerId) {
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
      if (!matchedLegalCustomer) return;
      setDocsMenuOpen(false);
      setGeneratingKind(kind);
      try {
        await generateCustomerOrderLegalDocument({ customer: matchedLegalCustomer, order, kind });
        addToast({ type: 'success', title: 'Успешно', message: `${ORDER_LEGAL_DOC_LABELS[kind]} по заказу скачан` });
      } catch (error) {
        const message = await getApiErrorMessage(error, 'Не удалось сформировать документ');
        addToast({ type: 'error', title: 'Ошибка', message });
      } finally {
        setGeneratingKind(null);
      }
    },
    [addToast, matchedLegalCustomer, order],
  );

  return {
    showLegalDocsButton: Boolean(matchedLegalCustomer),
    docsMenuOpen,
    setDocsMenuOpen,
    docsMenuRef,
    generatingKind,
    generateLegalDocument,
  };
}
