import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order } from '../../types';
import {
  createPostalShipment,
  downloadPostalBlankPdf,
  getOrganizations,
  getPostalCarrierStatus,
  getPostalShipments,
  type Organization,
  type PostalCarrier,
  type PostalShipment,
} from '../../api';
import { AppIcon } from '../ui/AppIcon';
import './PostalShipmentPanel.css';

type Props = {
  order: Order;
  onNotify: (type: 'success' | 'error', message: string) => void;
};

const STATUS_LABEL: Record<PostalShipment['status'], string> = {
  draft: 'Черновик',
  blank_issued: 'Бланк выписан',
  handed_over: 'Передано',
};

function guessCarrier(order: Order): PostalCarrier {
  const haystack = `${order.delivery?.label || ''} ${order.delivery?.providerId || ''}`.toLowerCase();
  if (haystack.includes('европочт') || haystack.includes('europost')) return 'europost';
  return 'belpost';
}

function recipientName(order: Order): string {
  const customer = order.customer;
  return (
    customer?.company_name ||
    customer?.legal_name ||
    order.customerName ||
    ''
  );
}

function recipientAddress(order: Order): string {
  return order.delivery?.address || order.customer?.address || '';
}

function formatByn(amount: number): string {
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`;
}

function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

async function explain(error: any, fallback: string): Promise<string> {
  const data = error?.response?.data;
  if (data && typeof data.text === 'function') {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return String(parsed.message);
    } catch {
      return fallback;
    }
  }
  return data?.message || error?.message || fallback;
}

function openCarrierFile(data: BlobPart, contentType: string, filename: string) {
  const type = contentType || 'application/octet-stream';
  const blob = new Blob([data], { type });
  const url = window.URL.createObjectURL(blob);
  if (type.includes('zip') || filename.toLowerCase().endsWith('.zip')) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'blank.zip';
    link.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('Браузер заблокировал открытие бланка');
  setTimeout(() => window.URL.revokeObjectURL(url), 30000);
}

export const PostalShipmentPanel: React.FC<Props> = ({ order, onNotify }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [shipments, setShipments] = useState<PostalShipment[]>([]);
  const [carrier, setCarrier] = useState<PostalCarrier>(() => guessCarrier(order));
  const [organizationId, setOrganizationId] = useState<number | ''>('');
  const [name, setName] = useState(() => recipientName(order));
  const [phone, setPhone] = useState(order.customerPhone || order.customer?.phone || '');
  const [address, setAddress] = useState(() => recipientAddress(order));
  const [places, setPlaces] = useState('1');
  const [weight, setWeight] = useState('');
  const [cod, setCod] = useState('');
  const [declared, setDeclared] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [carrierReady, setCarrierReady] = useState({ belpost: false, europost: false, belpostMessage: '', europostMessage: '' });
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await getPostalShipments(order.id);
    const rows = Array.isArray(response.data) ? response.data : [];
    setShipments(rows);
  }, [order.id]);

  useEffect(() => {
    setCarrier(guessCarrier(order));
    setName(recipientName(order));
    setPhone(order.customerPhone || order.customer?.phone || '');
    setAddress(recipientAddress(order));
    setCod('');
    setDeclared('');
    load().catch(() => setShipments([]));
    // Поля заказа читаем только при смене заказа: иначе повторный рендер карточки стирает ввод.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, load]);

  useEffect(() => {
    setOpen(false);
  }, [order.id]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [open]);

  useEffect(() => {
    getPostalCarrierStatus()
      .then((response) => {
        setCarrierReady({
          belpost: Boolean(response.data?.belpostReady),
          europost: Boolean(response.data?.europostReady),
          belpostMessage: response.data?.belpostMessage || '',
          europostMessage: response.data?.europostMessage || '',
        });
      })
      .catch(() => setCarrierReady({ belpost: false, europost: false, belpostMessage: '', europostMessage: '' }));
  }, []);

  useEffect(() => {
    getOrganizations()
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setOrganizations(rows);
        const preferred = rows.find((row) => row.is_default) || rows[0];
        if (preferred) setOrganizationId(preferred.id);
      })
      .catch(() => setOrganizations([]));
  }, []);

  const payerLabel = useMemo(() => {
    const org = organizations.find((row) => row.id === organizationId);
    if (!org) return 'наше юрлицо';
    return org.unp ? `${org.name}, УНП ${org.unp}` : org.name;
  }, [organizations, organizationId]);

  const ready = carrier === 'belpost' ? carrierReady.belpost : carrierReady.europost;
  const readyMessage = carrier === 'belpost' ? carrierReady.belpostMessage : carrierReady.europostMessage;

  const createAndPrint = async () => {
    if (!name.trim() || !address.trim()) {
      onNotify('error', 'Укажите получателя и адрес');
      return;
    }
    if (!weight.trim() || !(Number(weight.replace(',', '.')) > 0)) {
      onNotify('error', 'Укажите вес, кг');
      return;
    }
    try {
      setBusy(true);
      const weightValue = Number(weight.replace(',', '.'));
      const codAmount = carrier === 'belpost' ? parseMoneyInput(cod) : null;
      const declaredValue = carrier === 'belpost' ? parseMoneyInput(declared) : null;
      const created = await createPostalShipment(order.id, {
        carrier,
        organization_id: organizationId === '' ? null : organizationId,
        recipient_name: name.trim(),
        recipient_phone: phone.trim(),
        recipient_address: address.trim(),
        places: Math.max(1, Number(places) || 1),
        weight_kg: weightValue,
        cod_amount: codAmount,
        declared_value: declaredValue,
        notes: notes.trim(),
      });
      await load();
      if (created.data.has_blank) {
        const pdf = await downloadPostalBlankPdf(order.id, created.data.id);
        const contentType = String(pdf.headers['content-type'] || 'application/pdf');
        const disposition = String(pdf.headers['content-disposition'] || '');
        const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || 'blank.pdf';
        openCarrierFile(pdf.data, contentType, filename);
      }
      onNotify('success', created.data.carrier_message || `Отправление принято. Платит ${payerLabel}.`);
    } catch (error: any) {
      onNotify('error', await explain(error, 'Перевозчик не принял отправление'));
    } finally {
      setBusy(false);
    }
  };

  const reprint = async (shipment: PostalShipment) => {
    try {
      setBusy(true);
      const pdf = await downloadPostalBlankPdf(order.id, shipment.id);
      const contentType = String(pdf.headers['content-type'] || 'application/pdf');
      const disposition = String(pdf.headers['content-disposition'] || '');
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || 'blank.pdf';
      openCarrierFile(pdf.data, contentType, filename);
      await load();
    } catch (error: any) {
      onNotify('error', await explain(error, 'Перевозчик ещё не отдал бланк'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="postal-shipment" ref={rootRef}>
      <button
        type="button"
        className={`order-detail-action-btn order-detail-action-btn--neutral${open ? ' postal-shipment__toggle--open' : ''}`}
        title="Трек и бланк приходят от Белпочты или Европочты"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <AppIcon name="package" size="xs" />
        {shipments.length > 0 ? `Доставка ${shipments.length} ▼` : 'Доставка ▼'}
      </button>
      {open ? (
      <div className="postal-shipment__popover">
      <div className="postal-shipment__head">
        <h3>Белпочта / Европочта</h3>
        <p>
          Трек и бланк приходят ответом {carrier === 'belpost' ? 'Белпочты' : 'Европочты'}. Свой бланк CRM не печатает.
          Почтовый сбор платит {payerLabel}.
          {carrier === 'belpost'
            ? ' Наложенный платёж, если указать, Белпочта возьмёт у получателя за товар.'
            : ' Для Европочты наложенный платёж не отправляем.'}
        </p>
        {!ready ? <p className="postal-shipment__warn">{readyMessage || 'Доступ перевозчика не сохранён. Его добавляет администратор в общих настройках.'}</p> : null}
      </div>
      <div className="postal-shipment__form">
        <label>
          Перевозчик
          <select value={carrier} onChange={(event) => setCarrier(event.target.value as PostalCarrier)}>
            <option value="belpost">Белпочта</option>
            <option value="europost">Европочта</option>
          </select>
        </label>
        <label>
          Плательщик
          <select
            value={organizationId === '' ? '' : String(organizationId)}
            onChange={(event) => setOrganizationId(event.target.value ? Number(event.target.value) : '')}
          >
            {organizations.length === 0 ? <option value="">Организация по умолчанию</option> : null}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}{org.unp ? ` · УНП ${org.unp}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Получатель
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="postal-shipment__wide">
          {carrier === 'belpost' ? 'Адрес получателя' : 'Пункт выдачи или адрес'}
          <input value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label>
          Мест
          <input value={places} onChange={(event) => setPlaces(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          Вес, кг
          <input value={weight} onChange={(event) => setWeight(event.target.value)} inputMode="decimal" />
        </label>
        {carrier === 'belpost' ? (
          <>
            <label>
              Наложенный платёж, BYN
              <input
                value={cod}
                onChange={(event) => setCod(event.target.value)}
                inputMode="decimal"
                placeholder={order.debt && order.debt > 0 ? formatByn(order.debt) : ''}
              />
            </label>
            <label>
              Объявленная ценность, BYN
              <input
                value={declared}
                onChange={(event) => setDeclared(event.target.value)}
                inputMode="decimal"
                placeholder="от суммы наложенного платежа"
              />
            </label>
          </>
        ) : null}
        <label className="postal-shipment__wide">
          Примечание
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button type="button" onClick={createAndPrint} disabled={busy || !ready}>
          {busy ? 'Ждём ответ перевозчика…' : carrier === 'belpost' ? 'Отправить в Белпочту' : 'Отправить в Европочту'}
        </button>
      </div>
      {shipments.length > 0 ? (
        <ul className="postal-shipment__list">
          {shipments.map((shipment) => (
            <li key={shipment.id}>
              <div>
                <strong>{shipment.carrier_title}</strong> · {shipment.blank_number} · {STATUS_LABEL[shipment.status]}
                <div>{shipment.recipient_name}, {shipment.recipient_address}</div>
                <div>{shipment.tracking_number ? `Трек ${shipment.tracking_number}` : 'Трек ещё не пришёл'}</div>
                {shipment.carrier === 'belpost' && shipment.cod_amount ? (
                  <div>Наложенный платёж {formatByn(shipment.cod_amount)}</div>
                ) : null}
                {shipment.carrier_message ? <div className="postal-shipment__note">{shipment.carrier_message}</div> : null}
              </div>
              <div className="postal-shipment__row-actions">
                <button
                  type="button"
                  onClick={() => reprint(shipment)}
                  disabled={busy || (!shipment.has_blank && shipment.blank_status !== 'processing')}
                >
                  {shipment.has_blank ? 'Бланк перевозчика' : 'Забрать бланк'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      </div>
      ) : null}
    </div>
  );
};
