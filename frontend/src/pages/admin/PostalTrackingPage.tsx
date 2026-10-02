import React, { useCallback, useEffect, useState } from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import {
  getPostalTracking,
  refreshPostalTracking,
  type PostalTrackingFilter,
  type PostalTrackingShipment,
} from '../../api';
import './PostalTrackingPage.css';

const FILTERS: Array<{ id: PostalTrackingFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'belpost', label: 'Белпочта' },
  { id: 'europost', label: 'Европочта' },
];

function formatWhen(value: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PostalTrackingPage: React.FC = () => {
  const [carrier, setCarrier] = useState<PostalTrackingFilter>('all');
  const [shipments, setShipments] = useState<PostalTrackingShipment[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | 'all' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (next: PostalTrackingFilter) => {
    setLoading(true);
    setError('');
    try {
      const response = await getPostalTracking(next);
      setShipments(Array.isArray(response.data?.shipments) ? response.data.shipments : []);
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Не удалось загрузить доставки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(carrier).catch(() => setError('Не удалось загрузить доставки'));
  }, [carrier, load]);

  const refresh = async (shipmentId?: number) => {
    setBusyId(shipmentId ?? 'all');
    setError('');
    setNotice('');
    try {
      const response = await refreshPostalTracking({ carrier, shipmentId });
      setShipments(Array.isArray(response.data?.shipments) ? response.data.shipments : []);
      setNotice(response.data?.message || '');
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Не удалось обновить статусы');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPageLayout
      title="Доставка"
      description="Текущий статус и история Белпочты и Европочты по отправлениям из заказов."
      icon=""
    >
      <div className="postal-tracking">
        <div className="postal-tracking__toolbar">
          <div className="postal-tracking__tabs">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={carrier === item.id ? 'postal-tracking__tab postal-tracking__tab--active' : 'postal-tracking__tab'}
                onClick={() =>setCarrier(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() =>refresh()} disabled={busyId !== null}>
            {busyId === 'all' ? 'Обновляем…' : 'Обновить статусы'}
          </button>
        </div>
        <p className="postal-tracking__hint">
          Белпочта отдаёт историю по номеру отправления и ограничивает частоту: за один раз обновляются первые 5.
          Европочта отвечает своим методом отслеживания, для него нужен доступ в настройках.
        </p>
        {error ? <p className="postal-tracking__error">{error}</p> : null}
        {notice ? <p className="postal-tracking__ok">{notice}</p> : null}
        {loading ? <p>Загружаем доставки…</p> : null}
        {!loading && shipments.length === 0 ? (
          <p>Доставок пока нет. Они появляются из кнопки «Доставка» в заказе.</p>
        ) : null}
        <div className="postal-tracking__list">
          {shipments.map((shipment) => {
            const open = openId === shipment.id;
            return (
              <article key={shipment.id} className="postal-tracking__card">
                <header>
                  <strong>{shipment.carrier_title}</strong>
                  <span>{shipment.order_number}</span>
                  {shipment.customer_name ? <span>{shipment.customer_name}</span> : null}
                </header>
                <p>{shipment.recipient_name}{shipment.recipient_address ? `, ${shipment.recipient_address}` : ''}</p>
                <p className="postal-tracking__status">
                  {shipment.current_status}
                  {shipment.current_place ? ` · ${shipment.current_place}` : ''}
                  {shipment.current_at ? ` · ${formatWhen(shipment.current_at)}` : ''}
                </p>
                <p className="postal-tracking__track">{shipment.tracking_number || 'Трек ещё не пришёл'}</p>
                {shipment.tracking_error && shipment.events.length > 0 ? (
                  <p className="postal-tracking__error">{shipment.tracking_error}</p>
                ) : null}
                <div className="postal-tracking__actions">
                  <button type="button" onClick={() =>setOpenId(open ? null : shipment.id)}>
                    {open ? 'Скрыть историю' : `История (${shipment.events.length})`}
                  </button>
                  <button type="button" onClick={() =>refresh(shipment.id)} disabled={busyId !== null || !shipment.tracking_number}>
                    {busyId === shipment.id ? 'Обновляем…' : 'Обновить'}
                  </button>
                </div>
                {open ? (
                  shipment.events.length === 0 ? (
                    <p>История появится после ответа перевозчика.</p>
                  ) : (
                    <ol className="postal-tracking__history">
                      {[...shipment.events].reverse().map((event) => (
                        <li key={event.id}>
                          <strong>{event.title}</strong>
                          <span>{[formatWhen(event.eventAt), event.place].filter(Boolean).join(' · ')}</span>
                        </li>
                      ))}
                    </ol>
                  )
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </AdminPageLayout>
  );
};

export default PostalTrackingPage;
