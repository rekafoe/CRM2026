import React, { useState, useEffect, useCallback } from 'react';
import { Customer } from '../../types';
import { getCustomers, updateOrderCustomer, createCustomer } from '../../api';
import { useToast } from '../Toast';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(currentCustomerId || null);
  const { addToast } = useToast();

  // Загружаем клиентов
  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCustomers({ search: searchQuery || undefined });
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
  }, [searchQuery, addToast]);

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
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
        Клиент
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={selectedCustomerId || ''}
          onChange={(e) => {
            const value = e.target.value;
            handleCustomerChange(value ? Number(value) : null);
          }}
          style={{
            flex: 1,
            padding: '6px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        >
          <option value="">— Без клиента —</option>
          {customers.map(customer => (
            <option key={customer.id} value={customer.id}>
              {getCustomerDisplayName(customer)}
              {customer.phone ? ` (${customer.phone})` : ''}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: 150,
            padding: '6px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            whiteSpace: 'nowrap'
          }}
        >
          + Создать
        </button>
      </div>
      {selectedCustomer && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Создать клиента</h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
              Тип клиента
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'individual' | 'legal')}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="individual">Физическое лицо</option>
              <option value="legal">Юридическое лицо</option>
            </select>
          </div>

          {type === 'individual' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Фамилия</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Имя</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Отчество</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Название компании *</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Юридическое название</label>
                <input
                  type="text"
                  value={formData.legal_name}
                  onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>УНП</label>
                <input
                  type="text"
                  value={formData.tax_id}
                  onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                  style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Телефон</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Адрес</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Примечания</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px',
                backgroundColor: saving ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
