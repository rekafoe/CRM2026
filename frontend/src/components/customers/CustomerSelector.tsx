import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Customer, Order } from '../../types';
import { getCustomers, updateOrderCustomer, createCustomer, updateOrderPaymentChannel } from '../../api';
import { useToast } from '../Toast';
import './CustomerSelector.css';

interface CustomerSelectorProps {
  orderId: number;
  currentCustomerId?: number | null;
  onCustomerChange?: () => void;
  onOrderPatch?: (orderId: number, patch: Partial<Order>) => void;
  /** Inline: без лейбла, в одну строку с кнопками (Создать | Селект 160px | Поиск) */
  inline?: boolean;
}

export const CustomerSelector: React.FC<CustomerSelectorProps> = ({
  orderId,
  currentCustomerId,
  onCustomerChange,
  onOrderPatch,
  inline = false,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(currentCustomerId || null);
  const { addToast } = useToast();

  // Загружаем клиентов
  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCustomers({ search: debouncedQuery || undefined, stats: 0 });
      setCustomers(response.data);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: error.message || 'Не удалось загрузить клиентов'
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Обновляем выбранного клиента при изменении пропса
  useEffect(() => {
    setSelectedCustomerId(currentCustomerId || null);
  }, [currentCustomerId]);

  // Обработка изменения клиента. customer — для автоподстановки канала оплаты (юрлицо → счёт).
  const handleCustomerChange = useCallback(async (customerId: number | null, customer?: Customer | null) => {
    try {
      const updated = await updateOrderCustomer(orderId, customerId);
      const data = updated.data;
      setSelectedCustomerId(customerId);
      const c = customerId ? (customer ?? customers.find((x) => x.id === customerId)) : null;
      const paymentPatch = data?.payment_channel
        ? { payment_channel: data.payment_channel }
        : c?.type === 'legal'
          ? ({ payment_channel: 'invoice' } as const)
          : c?.type === 'individual'
            ? ({ payment_channel: 'cash' } as const)
            : {};
      onOrderPatch?.(orderId, {
        customer_id: customerId,
        ...paymentPatch,
        ...(typeof data?.prepaymentAmount === 'number' ? { prepaymentAmount: data.prepaymentAmount } : {}),
        ...('prepaymentStatus' in (data ?? {}) ? { prepaymentStatus: data.prepaymentStatus ?? undefined } : {}),
        ...('paymentMethod' in (data ?? {}) ? { paymentMethod: data.paymentMethod ?? undefined } : {}),
        ...(typeof data?.debt === 'number' ? { debt: data.debt } : {}),
        ...(typeof data?.totalAmount === 'number' ? { totalAmount: data.totalAmount } : {}),
        ...(typeof data?.subtotal === 'number' ? { subtotal: data.subtotal } : {}),
        ...(typeof data?.discountAmount === 'number' ? { discountAmount: data.discountAmount } : {}),
      });
      if (c?.type === 'legal') {
        await updateOrderPaymentChannel(orderId, 'invoice');
      } else if (c?.type === 'individual') {
        await updateOrderPaymentChannel(orderId, 'cash');
      }
      addToast({
        type: 'success',
        title: 'Успешно',
        message: customerId ? 'Клиент привязан к заказу' : 'Клиент отвязан от заказа'
      });
      onCustomerChange?.();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: error.message || 'Не удалось обновить клиента заказа'
      });
    }
  }, [orderId, onCustomerChange, onOrderPatch, addToast, customers]);

  // Получить отображаемое имя клиента
  const getCustomerDisplayName = (customer: Customer): string => {
    if (customer.type === 'legal') {
      return customer.company_name || customer.legal_name || 'Без названия';
    } else {
      const parts = [
        customer.last_name,
        customer.first_name,
        customer.middle_name
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : 'Без имени';
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
      <div className={`customer-selector ${inline ? 'customer-selector--inline' : ''}`}>
      {!inline && <label className="customer-selector__label">Клиент</label>}
      <div className="customer-selector__row">
        <select
          value={selectedCustomerId || ''}
          onChange={(e) => {
            const value = e.target.value;
            const id = value ? Number(value) : null;
            const c = id ? customers.find((x) => x.id === id) : undefined;
            handleCustomerChange(id, c);
          }}
          className="customer-selector__select"
        >
          <option value="">— Без клиента —</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>
              {getCustomerDisplayName(customer)}
              {customer.phone ? ` (${customer.phone})` : ''}
            </option>
          ))}
        </select>
        <div className="customer-selector__search">
          <input
            type="text"
            placeholder="Поиск по имени, телефону, УНП..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="customer-selector__search-input"
          />
          {searchQuery.trim().length > 0 && (
            <div className="customer-selector__suggestions">
              {loading ? (
                <div className="customer-selector__suggestion muted">Поиск...</div>
              ) : customers.length === 0 ? (
                <div className="customer-selector__suggestion muted">Ничего не найдено</div>
              ) : (
                customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="customer-selector__suggestion"
                    onClick={() =>{
                      handleCustomerChange(customer.id, customer);
                      setSearchQuery('');
                    }}
                  >
                    <span className="customer-selector__suggestion-name">
                      {getCustomerDisplayName(customer)}
                    </span>
                    <span className="customer-selector__suggestion-meta">
                      {customer.phone || customer.email || customer.tax_id || ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          onClick={() =>setShowCreateModal(true)}
          className="customer-selector__create"
        >
          Создать
        </button>
      </div>
      {selectedCustomer && (
        <div className="customer-selector__details">
          {selectedCustomer.type === 'legal' ? (
            <>
              {selectedCustomer.company_name && <div>Компания: {selectedCustomer.company_name}</div>}
              {selectedCustomer.tax_id && <div>УНП: {selectedCustomer.tax_id}</div>}
              {(selectedCustomer.signer_position || selectedCustomer.signer_name) && (
                <div>
                  Подписант: {[selectedCustomer.signer_position, selectedCustomer.signer_name].filter(Boolean).join(' ')}
                </div>
              )}
              {selectedCustomer.signer_name_genitive && (
                <div>
                  В лице: {[selectedCustomer.signer_position_genitive, selectedCustomer.signer_name_genitive].filter(Boolean).join(' ')}
                </div>
              )}
              {selectedCustomer.authority_basis && <div>Основание: {selectedCustomer.authority_basis}</div>}
              {!selectedCustomer.signer_name && selectedCustomer.authorized_person && (
                <div>Уполномоченное лицо: {selectedCustomer.authorized_person}</div>
              )}
              {selectedCustomer.bank_details && <div>Расчётный счёт: {selectedCustomer.bank_details}</div>}
            </>
          ) : (
            <>
              {selectedCustomer.first_name && <div>Имя: {selectedCustomer.first_name}</div>}
              {selectedCustomer.last_name && <div>Фамилия: {selectedCustomer.last_name}</div>}
            </>
          )}
          {selectedCustomer.phone && <div>Телефон: {selectedCustomer.phone}</div>}
          {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
        </div>
      )}

      {showCreateModal && (
        <CreateCustomerModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async (customer) => {
            await loadCustomers();
            await handleCustomerChange(customer.id, customer);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
};

// Модальное окно для создания клиента
interface CreateCustomerModalProps {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onCreated }) => {
  const [type, setType] = useState<'individual' | 'legal'>('individual');
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    company_name: '',
    legal_name: '',
    tax_id: '',
    authorized_person: '',
    signer_position: '',
    signer_position_genitive: '',
    signer_name: '',
    signer_name_genitive: '',
    authority_basis: '',
    bank_details: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (type === 'individual' && !formData.first_name && !formData.last_name) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: 'Для физ. лица необходимо указать имя или фамилию'
      });
      return;
    }

    if (type === 'legal' && !formData.company_name) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: 'Для юр. лица необходимо указать название компании'
      });
      return;
    }

    try {
      setSaving(true);
      const signerName = formData.signer_name.trim();
      const authorityBasis = formData.authority_basis.trim();
      const response = await createCustomer({
        type,
        ...formData,
        authorized_person:
          signerName && authorityBasis
            ? `${signerName}, действует на основании: ${authorityBasis}`
            : signerName || formData.authorized_person,
      });
      addToast({
        type: 'success',
        title: 'Успешно',
        message: 'Клиент создан'
      });
      // Сбрасываем форму после успешного создания
      setFormData({
        first_name: '',
        last_name: '',
        middle_name: '',
        company_name: '',
        legal_name: '',
        tax_id: '',
        authorized_person: '',
        signer_position: '',
        signer_position_genitive: '',
        signer_name: '',
        signer_name_genitive: '',
        authority_basis: '',
        bank_details: '',
        phone: '',
        email: '',
        address: '',
        notes: ''
      });
      onCreated(response.data);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Ошибка',
        message: error.message || 'Не удалось создать клиента'
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    // Клик по фону не закрывает модалку: иначе пропадает уже введённая форма.
    <div className="customer-modal-overlay" role="presentation">
      <div
        className="customer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-customer-title"
      >
        <div className="customer-modal__header">
          <h3 id="create-customer-title" className="customer-modal__title">Создать клиента</h3>
          <button
            type="button"
            className="customer-modal__close"
            onClick={onClose}
            disabled={saving}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="customer-modal__form">
          <div className="customer-modal__body">
            <div className="customer-modal__field">
              <label className="customer-modal__label" htmlFor="create-customer-type">Тип клиента</label>
              <select
                id="create-customer-type"
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as 'individual' | 'legal';
                  setType(newType);
                  if (newType === 'individual') {
                    setFormData(prev => ({
                      ...prev,
                      company_name: '',
                      legal_name: '',
                      tax_id: '',
                      authorized_person: '',
                      signer_position: '',
                      signer_position_genitive: '',
                      signer_name: '',
                      signer_name_genitive: '',
                      authority_basis: '',
                      bank_details: '',
                    }));
                  } else {
                    setFormData(prev => ({
                      ...prev,
                      first_name: '',
                      last_name: '',
                      middle_name: '',
                    }));
                  }
                }}
                className="customer-modal__input"
              >
                <option value="individual">Физическое лицо</option>
                <option value="legal">Юридическое лицо</option>
              </select>
            </div>

            {type === 'individual' ? (
              <section className="customer-modal__section">
                <h4 className="customer-modal__section-title">ФИО</h4>
                <div className="customer-modal__grid customer-modal__grid--3">
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-last-name">Фамилия</label>
                    <input
                      id="create-customer-last-name"
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-first-name">Имя</label>
                    <input
                      id="create-customer-first-name"
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-middle-name">Отчество</label>
                    <input
                      id="create-customer-middle-name"
                      type="text"
                      value={formData.middle_name}
                      onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                      className="customer-modal__input"
                    />
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="customer-modal__section">
                  <h4 className="customer-modal__section-title">Компания</h4>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-company">Название компании *</label>
                    <input
                      id="create-customer-company"
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      required
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-legal-name">Юридическое название</label>
                    <input
                      id="create-customer-legal-name"
                      type="text"
                      value={formData.legal_name}
                      onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field customer-modal__field--narrow">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-tax-id">УНП</label>
                    <input
                      id="create-customer-tax-id"
                      type="text"
                      value={formData.tax_id}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                      className="customer-modal__input"
                    />
                  </div>
                </section>
                <section className="customer-modal__section">
                  <h4 className="customer-modal__section-title">Реквизиты</h4>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-position">Должность</label>
                    <input
                      id="create-customer-position"
                      type="text"
                      value={formData.signer_position}
                      onChange={(e) => setFormData({ ...formData, signer_position: e.target.value })}
                      placeholder="Директор"
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-signer">ФИО</label>
                    <input
                      id="create-customer-signer"
                      type="text"
                      value={formData.signer_name}
                      onChange={(e) => setFormData({ ...formData, signer_name: e.target.value })}
                      placeholder="Иванов Иван Иванович"
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-position-gen">Должность в родительном падеже</label>
                    <input
                      id="create-customer-position-gen"
                      type="text"
                      value={formData.signer_position_genitive}
                      onChange={(e) => setFormData({ ...formData, signer_position_genitive: e.target.value })}
                      placeholder="директора"
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-signer-gen">ФИО в родительном падеже</label>
                    <input
                      id="create-customer-signer-gen"
                      type="text"
                      value={formData.signer_name_genitive}
                      onChange={(e) => setFormData({ ...formData, signer_name_genitive: e.target.value })}
                      placeholder="Иванова Ивана Ивановича"
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-basis">Основание полномочий</label>
                    <input
                      id="create-customer-basis"
                      type="text"
                      value={formData.authority_basis}
                      onChange={(e) => setFormData({ ...formData, authority_basis: e.target.value })}
                      placeholder="Устава"
                      className="customer-modal__input"
                    />
                  </div>
                  <div className="customer-modal__field">
                    <label className="customer-modal__label-sm" htmlFor="create-customer-bank">Расчётный счёт</label>
                    <textarea
                      id="create-customer-bank"
                      value={formData.bank_details}
                      onChange={(e) => setFormData({ ...formData, bank_details: e.target.value })}
                      placeholder="р/с, банк, БИК и т.д."
                      rows={3}
                      className="customer-modal__textarea"
                    />
                  </div>
                </section>
              </>
            )}

            <section className="customer-modal__section">
              <h4 className="customer-modal__section-title">Контакты</h4>
              <div className="customer-modal__grid customer-modal__grid--2">
                <div className="customer-modal__field">
                  <label className="customer-modal__label-sm" htmlFor="create-customer-phone">Телефон</label>
                  <input
                    id="create-customer-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="customer-modal__input"
                  />
                </div>
                <div className="customer-modal__field">
                  <label className="customer-modal__label-sm" htmlFor="create-customer-email">Email</label>
                  <input
                    id="create-customer-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="customer-modal__input"
                  />
                </div>
              </div>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm" htmlFor="create-customer-address">Адрес</label>
                <input
                  id="create-customer-address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
            </section>

            <section className="customer-modal__section">
              <h4 className="customer-modal__section-title">Примечание</h4>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm" htmlFor="create-customer-notes">Комментарий</label>
                <textarea
                  id="create-customer-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="customer-modal__textarea"
                />
              </div>
            </section>
          </div>

          <div className="customer-modal__actions">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="customer-modal__button customer-modal__button--secondary"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="customer-modal__button customer-modal__button--primary"
            >
              {saving ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
