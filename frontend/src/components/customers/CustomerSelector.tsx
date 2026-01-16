import React, { useState, useEffect, useCallback } from 'react';
import { Customer } from '../../types';
import { getCustomers, updateOrderCustomer, createCustomer } from '../../api';
import { useToast } from '../Toast';
import './CustomerSelector.css';

interface CustomerSelectorProps {
  orderId: number;
  currentCustomerId?: number | null;
  onCustomerChange?: () => void;
}

export const CustomerSelector: React.FC<CustomerSelectorProps> = ({
  orderId,
  currentCustomerId,
  onCustomerChange,
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
      const response = await getCustomers({ search: debouncedQuery || undefined });
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

  // Обработка изменения клиента
  const handleCustomerChange = useCallback(async (customerId: number | null) => {
    try {
      await updateOrderCustomer(orderId, customerId);
      setSelectedCustomerId(customerId);
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
  }, [orderId, onCustomerChange, addToast]);

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
    <div className="customer-selector">
      <label className="customer-selector__label">Клиент</label>
      <div className="customer-selector__row">
        <select
          value={selectedCustomerId || ''}
          onChange={(e) => {
            const value = e.target.value;
            handleCustomerChange(value ? Number(value) : null);
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
                    onClick={() => {
                      handleCustomerChange(customer.id);
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
          onClick={() => setShowCreateModal(true)}
          className="customer-selector__create"
        >
          + Создать
        </button>
      </div>
      {selectedCustomer && (
        <div className="customer-selector__details">
          {selectedCustomer.type === 'legal' ? (
            <>
              {selectedCustomer.company_name && <div>Компания: {selectedCustomer.company_name}</div>}
              {selectedCustomer.tax_id && <div>УНП: {selectedCustomer.tax_id}</div>}
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
            await handleCustomerChange(customer.id);
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
      const response = await createCustomer({
        type,
        ...formData
      });
      addToast({
        type: 'success',
        title: 'Успешно',
        message: 'Клиент создан'
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

  return (
    <div className="customer-modal-overlay" onClick={onClose}>
      <div
        className="customer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="customer-modal__title">Создать клиента</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="customer-modal__field">
            <label className="customer-modal__label">Тип клиента</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'individual' | 'legal')}
              className="customer-modal__input"
            >
              <option value="individual">Физическое лицо</option>
              <option value="legal">Юридическое лицо</option>
            </select>
          </div>

          {type === 'individual' ? (
            <>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">Фамилия</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">Имя</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">Отчество</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
            </>
          ) : (
            <>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">Название компании *</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                  className="customer-modal__input"
                />
              </div>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">Юридическое название</label>
                <input
                  type="text"
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
              <div className="customer-modal__field">
                <label className="customer-modal__label-sm">УНП</label>
                <input
                  type="text"
                  value={formData.tax_id}
                  onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                  className="customer-modal__input"
                />
              </div>
            </>
          )}

          <div className="customer-modal__field">
            <label className="customer-modal__label-sm">Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="customer-modal__input"
            />
          </div>
          <div className="customer-modal__field">
            <label className="customer-modal__label-sm">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="customer-modal__input"
            />
          </div>
          <div className="customer-modal__field">
            <label className="customer-modal__label-sm">Адрес</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="customer-modal__input"
            />
          </div>
          <div className="customer-modal__field">
            <label className="customer-modal__label-sm">Примечания</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="customer-modal__textarea"
            />
          </div>

          <div className="customer-modal__actions">
            <button
              type="button"
              onClick={onClose}
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
    </div>
  );
};
