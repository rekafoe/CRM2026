import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Order } from '../../types';
import {
  createPostalShipment,
  downloadPostalBlankPdf,
  getOrganizations,
  getPostalShipments,
  updatePostalShipment,
  type Organization,
  type PostalCarrier,
  type PostalShipment,
} from '../../api';
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

async function openPdf(data: BlobPart) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
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
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [trackingDrafts, setTrackingDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const response = await getPostalShipments(order.id);
    const rows = Array.isArray(response.data) ? response.data : [];
    setShipments(rows);
    setTrackingDrafts(Object.fromEntries(rows.map((row) => [row.id, row.tracking_number || ''])));
  }, [order.id]);

  useEffect(() => {
    setCarrier(guessCarrier(order));
    setName(recipientName(order));
    setPhone(order.customerPhone || order.customer?.phone || '');
    setAddress(recipientAddress(order));
    load().catch(() => setShipments([]));
    // Поля заказа читаем только при смене заказа: иначе повторный рендер карточки стирает ввод.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, load]);

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

  const createAndPrint = async () => {
    if (!name.trim() || !address.trim()) {
      onNotify('error', 'Укажите получателя и адрес');
      return;
    }
    try {
      setBusy(true);
      const weightValue = weight.trim() ? Number(weight.replace(',', '.')) : null;
      const created = await createPostalShipment(order.id, {
        carrier,
        organization_id: organizationId === '' ? null : organizationId,
        recipient_name: name.trim(),
        recipient_phone: phone.trim(),
        recipient_address: address.trim(),
        places: Math.max(1, Number(places) || 1),
        weight_kg: weightValue != null && Number.isFinite(weightValue) ? weightValue : null,
        notes: notes.trim(),
      });
      const pdf = await downloadPostalBlankPdf(order.id, created.data.id);
      await openPdf(pdf.data);
      await load();
      onNotify('success', `Бланк ${created.data.blank_number} открыт. Доставку оплачивает ${payerLabel}`);
    } catch (error: any) {
      onNotify('error', error?.response?.data?.message || error?.message || 'Не удалось создать доставку');
    } finally {
      setBusy(false);
    }
  };

  const reprint = async (shipment: PostalShipment) => {
    try {
      setBusy(true);
      const pdf = await downloadPostalBlankPdf(order.id, shipment.id);
      await openPdf(pdf.data);
      await load();
    } catch (error: any) {
      onNotify('error', error?.response?.data?.message || 'Не удалось открыть бланк');
    } finally {
      setBusy(false);
    }
  };

  const saveTracking = async (shipment: PostalShipment) => {
    try {
      setBusy(true);
      const tracking = (trackingDrafts[shipment.id] || '').trim();
      await updatePostalShipment(order.id, shipment.id, {
        tracking_number: tracking,
      });
      await load();
      onNotify(
        'success',
        tracking
          ? 'Трек сохранён, отправление отмечено как переданное'
          : 'Трек очищен',
      );
    } catch (error: any) {
      onNotify('error', error?.response?.data?.message || 'Не удалось сохранить трек');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="postal-shipment">
      <div className="postal-shipment__head">
        <h3>Белпочта / Европочта</h3>
        <p>
          Доставку оплачивает наше юрлицо ({payerLabel}). Получатель наложенный платёж не платит.
          {' '}
          {carrier === 'belpost'
            ? 'Для Белпочты печатается сопроводительный адрес к посылке, ф. 116.'
            : 'Для Европочты печатается накладная на отправление.'}
        </p>
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
        <label className="postal-shipment__wide">
          Примечание
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button type="button" onClick={createAndPrint} disabled={busy}>
          {busy
            ? 'Готовим бланк…'
            : carrier === 'belpost'
              ? 'Создать доставку и ф. 116'
              : 'Создать доставку и накладную'}
        </button>
      </div>
      {shipments.length > 0 ? (
        <ul className="postal-shipment__list">
          {shipments.map((shipment) => (
            <li key={shipment.id}>
              <div>
                <strong>{shipment.carrier_title}</strong> · {shipment.blank_number} · {STATUS_LABEL[shipment.status]}
                <div>{shipment.recipient_name}, {shipment.recipient_address}</div>
              </div>
              <div className="postal-shipment__row-actions">
                <input
                  value={trackingDrafts[shipment.id] ?? ''}
                  placeholder="Трек-номер"
                  onChange={(event) => setTrackingDrafts((prev) => ({ ...prev, [shipment.id]: event.target.value }))}
                />
                <button type="button" onClick={() => saveTracking(shipment)} disabled={busy}>Трек</button>
                <button type="button" onClick={() => reprint(shipment)} disabled={busy}>
                  {shipment.carrier === 'belpost' ? 'ф. 116' : 'Накладная'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
