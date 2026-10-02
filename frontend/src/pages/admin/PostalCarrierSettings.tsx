import React, { useEffect, useState } from 'react';
import { Alert } from '../../components/common';
import {
  checkPostalCarrierAccess,
  getPostalCarrierSettings,
  savePostalCarrierSettings,
} from '../../api';
import './PostalCarrierSettings.css';

type FormState = {
  belpostBaseUrl: string;
  belpostJwt: string;
  europostApiUrl: string;
  europostApiPort: string;
  europostServiceNumber: string;
  europostLogin: string;
  europostPassword: string;
  europostLoginTypeId: string;
  europostGoodsId: string;
  europostWarehouseId: string;
  europostWeightTypeId: string;
  europostDeliveryTypeId: string;
};

const EMPTY: FormState = {
  belpostBaseUrl: 'https://api.belpost.by',
  belpostJwt: '',
  europostApiUrl: '',
  europostApiPort: '',
  europostServiceNumber: '',
  europostLogin: '',
  europostPassword: '',
  europostLoginTypeId: '',
  europostGoodsId: '',
  europostWarehouseId: '',
  europostWeightTypeId: '',
  europostDeliveryTypeId: '',
};

export const PostalCarrierSettings: React.FC = () => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hints, setHints] = useState({ token: '', service: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPostalCarrierSettings()
      .then((response) => {
        const data = response.data;
        setForm((prev) => ({
          ...prev,
          belpostBaseUrl: data.belpostBaseUrl || prev.belpostBaseUrl,
          europostApiUrl: data.europostApiUrl || '',
          europostApiPort: data.europostApiPort || '',
          europostLogin: data.europostLogin || '',
          europostLoginTypeId: data.europostLoginTypeId || '',
          europostGoodsId: data.europostGoodsId || '',
          europostWarehouseId: data.europostWarehouseId || '',
          europostWeightTypeId: data.europostWeightTypeId || '',
          europostDeliveryTypeId: data.europostDeliveryTypeId || '',
        }));
        setHints({
          token: data.belpostTokenHint || '',
          service: data.europostServiceHint || '',
          password: data.europostPasswordHint || '',
        });
      })
      .catch((reason: any) => {
        setError(reason?.response?.data?.message || 'Доступы видит только администратор');
      });
  }, []);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const save = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    const body: Record<string, string> = {
      belpostBaseUrl: form.belpostBaseUrl.trim(),
      europostApiUrl: form.europostApiUrl.trim(),
      europostApiPort: form.europostApiPort.trim(),
      europostLogin: form.europostLogin.trim(),
      europostLoginTypeId: form.europostLoginTypeId.trim(),
      europostGoodsId: form.europostGoodsId.trim(),
      europostWarehouseId: form.europostWarehouseId.trim(),
      europostWeightTypeId: form.europostWeightTypeId.trim(),
      europostDeliveryTypeId: form.europostDeliveryTypeId.trim(),
    };
    if (form.belpostJwt.trim()) body.belpostJwt = form.belpostJwt.trim();
    if (form.europostServiceNumber.trim()) body.europostServiceNumber = form.europostServiceNumber.trim();
    if (form.europostPassword.trim()) body.europostPassword = form.europostPassword.trim();
    try {
      const response = await savePostalCarrierSettings(body);
      setHints({
        token: response.data.belpostTokenHint || '',
        service: response.data.europostServiceHint || '',
        password: response.data.europostPasswordHint || '',
      });
      setForm((prev) => ({ ...prev, belpostJwt: '', europostServiceNumber: '', europostPassword: '' }));
      setMessage('Доступы сохранены. В заказе кнопка «Доставка» отправит данные перевозчику и покажет его бланк.');
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await checkPostalCarrierAccess();
      const lines = [
        `Белпочта: ${response.data.belpost.message}`,
        `Европочта: ${response.data.europost.message}`,
      ];
      if (response.data.belpost.ok && response.data.europost.ok) setMessage(lines.join(' '));
      else setError(lines.join(' '));
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Проверка не прошла');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="postal-settings" id="postal-carriers">
      <p className="settings-lead">
        Сюда вставляется доступ, который выдаёт перевозчик. CRM отправляет отправление и хранит их трек и бланк.
        Почтовый сбор идёт по договору нашего юрлица.
      </p>
      {error ? <Alert type="error">{error}</Alert> : null}
      {message ? <Alert type="success">{message}</Alert> : null}
      <div className="postal-settings__groups">
        <fieldset className="postal-settings__group">
          <legend>Белпочта</legend>
          <p className="postal-settings__note">JWT из договора. Пустое поле токена при сохранении не затирает уже записанный доступ.</p>
          <div className="postal-settings__grid">
            <label>
              JWT
              <input value={form.belpostJwt} onChange={set('belpostJwt')} placeholder={hints.token || 'токен из договора'} autoComplete="off" />
            </label>
            <label>
              Адрес API
              <input value={form.belpostBaseUrl} onChange={set('belpostBaseUrl')} />
            </label>
          </div>
        </fieldset>
        <fieldset className="postal-settings__group">
          <legend>Европочта — доступ</legend>
          <p className="postal-settings__note">CRM сама запрашивает JWT по логину договора. Номер услуги и пароль тоже не стираются, если поля оставить пустыми.</p>
          <div className="postal-settings__grid">
            <label>
              Адрес API
              <input value={form.europostApiUrl} onChange={set('europostApiUrl')} placeholder="https://..." />
            </label>
            <label>
              Порт
              <input value={form.europostApiPort} onChange={set('europostApiPort')} placeholder="если не входит в адрес" />
            </label>
            <label>
              Номер услуги
              <input value={form.europostServiceNumber} onChange={set('europostServiceNumber')} placeholder={hints.service || '32 символа из договора'} autoComplete="off" />
            </label>
            <label>
              Логин
              <input value={form.europostLogin} onChange={set('europostLogin')} autoComplete="off" />
            </label>
            <label>
              Пароль
              <input type="password" value={form.europostPassword} onChange={set('europostPassword')} placeholder={hints.password || ''} autoComplete="new-password" />
            </label>
            <label>
              Тип логина
              <input value={form.europostLoginTypeId} onChange={set('europostLoginTypeId')} placeholder="число от Европочты" />
            </label>
          </div>
        </fieldset>
        <fieldset className="postal-settings__group">
          <legend>Европочта — справочники</legend>
          <p className="postal-settings__note">Пустые поля CRM подбирает сама: склад, если он один, товар, вес и доставку за счёт отправителя.</p>
          <div className="postal-settings__grid">
            <label>
              Склад отправки
              <input value={form.europostWarehouseId} onChange={set('europostWarehouseId')} placeholder="пусто, если склад один" />
            </label>
            <label>
              Товар
              <input value={form.europostGoodsId} onChange={set('europostGoodsId')} placeholder="пусто — взять из справочника" />
            </label>
            <label>
              Тип веса
              <input value={form.europostWeightTypeId} onChange={set('europostWeightTypeId')} placeholder="пусто — по весу отправления" />
            </label>
            <label>
              Тип доставки
              <input value={form.europostDeliveryTypeId} onChange={set('europostDeliveryTypeId')} placeholder="пусто — оплата отправителем" />
            </label>
          </div>
        </fieldset>
      </div>
      <div className="settings-actions">
        <button type="button" className="lg-btn" onClick={check} disabled={busy}>
          Проверить
        </button>
        <button type="button" className="lg-btn lg-btn--primary" onClick={save} disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};
