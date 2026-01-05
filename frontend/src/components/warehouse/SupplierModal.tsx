import React, { useState, useEffect } from 'react';
import { Supplier } from '../../types/shared';

interface SupplierModalProps {
  supplier?: Supplier | null;
  onSave: (supplierData: any) => void;
  onClose: () => void;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  supplier,
  onSave,
  onClose
}) => {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    is_active: true
  });

  useEffect(() => {
    if (supplier) {
      setFormData({
        name: supplier.name || '',
        contact: supplier.contact || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        is_active: supplier.is_active !== undefined ? supplier.is_active : true
      });
    }
  }, [supplier]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('=== ОТПРАВКА ФОРМЫ ПОСТАВЩИКА ===');
    console.log('formData:', formData);
    onSave(formData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{supplier ? 'Редактировать поставщика' : 'Добавить поставщика'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="supplier-form">
          <div className="form-row">
            <div className="form-group">
              <label>Название компании *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                placeholder="ООО &quot;Название компании&quot;"
              />
            </div>
            <div className="form-group">
              <label>Контактное лицо</label>
              <input
                type="text"
                value={formData.contact}
                onChange={(e) => handleChange('contact', e.target.value)}
                placeholder="Иванов Иван Иванович"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="info@company.ru"
              />
            </div>
            <div className="form-group">
              <label>Телефон</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+7 (495) 123-45-67"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Адрес</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="г. Москва, ул. Примерная, д. 1"
            />
          </div>

          <div className="form-group">
            <label>Примечания</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация о поставщике"
              rows={3}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
              />
              Поставщик активен
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              {supplier ? 'Сохранить изменения' : 'Добавить поставщика'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
