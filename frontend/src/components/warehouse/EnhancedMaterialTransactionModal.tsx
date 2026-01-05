import React, { useState, useEffect } from 'react';
import { Material } from '../../types/shared';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';

interface Supplier {
  id: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  is_active: boolean;
}

interface EnhancedMaterialTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: Material | null;
  transactionType: 'in' | 'out' | 'adjustment' | 'transfer';
  onSuccess: () => void;
}

export const EnhancedMaterialTransactionModal: React.FC<EnhancedMaterialTransactionModalProps> = ({
  isOpen,
  onClose,
  material,
  transactionType,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    quantity: '',
    reason: '',
    notes: '',
    supplier_id: '',
    delivery_number: '',
    invoice_number: '',
    delivery_date: new Date().toISOString().split('T')[0], // Сегодняшняя дата
    delivery_notes: ''
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загружаем поставщиков при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
    }
  }, [isOpen]);

  // Сбрасываем форму при изменении материала или типа транзакции
  useEffect(() => {
    if (isOpen) {
      setFormData({
        quantity: '',
        reason: transactionType === 'in' ? 'Поступление материалов' : 
                transactionType === 'out' ? 'Списание материалов' :
                transactionType === 'adjustment' ? 'Корректировка остатков' : 'Перемещение материалов',
        notes: '',
        supplier_id: material?.supplier_id?.toString() || '',
        delivery_number: '',
        invoice_number: '',
        delivery_date: new Date().toISOString().split('T')[0],
        delivery_notes: ''
      });
      setError(null);
    }
  }, [isOpen, material, transactionType]);

  const loadSuppliers = async () => {
    try {
      const response = await api.get<Supplier[]>(ENDPOINTS.SUPPLIERS.LIST);
      setSuppliers(response.data.filter(s => s.is_active));
    } catch (error) {
      console.error('Ошибка загрузки поставщиков:', error);
      setError('Ошибка загрузки списка поставщиков');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const quantity = parseFloat(formData.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        throw new Error('Введите корректное количество');
      }

      if (!material) {
        throw new Error('Материал не выбран');
      }

      // Подготавливаем данные для API
      const transactionData = {
        materialId: material.id,
        delta: transactionType === 'out' ? -quantity : quantity,
        reason: formData.reason,
        orderId: formData.orderId ? parseInt(formData.orderId) : undefined
      };

      console.log('=== ОТПРАВКА ТРАНЗАКЦИИ ===');
      console.log('transactionData:', transactionData);

      // Отправляем транзакцию
      await api.post('/materials/spend', transactionData);

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Ошибка создания транзакции:', error);
      setError(error.message || 'Ошибка создания транзакции');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) return null;

  const isDeliveryTransaction = transactionType === 'in';
  const selectedSupplier = suppliers.find(s => s.id.toString() === formData.supplier_id);

  return (
    <div className="modal-overlay">
      <div className="modal-content enhanced-transaction-modal">
        <div className="modal-header">
          <h3>
            {transactionType === 'in' && '📥 Поступление материалов'}
            {transactionType === 'out' && '📤 Списание материалов'}
            {transactionType === 'adjustment' && '🔧 Корректировка остатков'}
            {transactionType === 'transfer' && '🔄 Перемещение материалов'}
          </h3>
          <button 
            className="modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Информация о материале */}
          {material && (
            <div className="material-info">
              <h4>Материал: {material.name}</h4>
              <p>Текущий остаток: <strong>{material.quantity || 0} {material.unit}</strong></p>
              {material.supplier && (
                <p>Поставщик: <strong>{material.supplier.name}</strong></p>
              )}
            </div>
          )}

          {/* Основные поля */}
          <div className="form-row">
            <div className="form-group">
              <label>Количество *</label>
              <input 
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                placeholder="Введите количество"
                required
              />
            </div>

            <div className="form-group">
              <label>Причина *</label>
              <input 
                type="text"
                value={formData.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                placeholder="Причина операции"
                required
              />
            </div>
          </div>

          {/* Поля для поставок (только для поступлений) */}
          {isDeliveryTransaction && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Поставщик</label>
                  <select 
                    value={formData.supplier_id}
                    onChange={(e) => handleChange('supplier_id', e.target.value)}
                  >
                    <option value="">Выберите поставщика</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Дата поставки</label>
                  <input 
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => handleChange('delivery_date', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Номер поставки</label>
                  <input 
                    type="text"
                    value={formData.delivery_number}
                    onChange={(e) => handleChange('delivery_number', e.target.value)}
                    placeholder="Номер поставки"
                  />
                </div>

                <div className="form-group">
                  <label>Номер накладной</label>
                  <input 
                    type="text"
                    value={formData.invoice_number}
                    onChange={(e) => handleChange('invoice_number', e.target.value)}
                    placeholder="Номер накладной"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Примечания к поставке</label>
                <textarea 
                  value={formData.delivery_notes}
                  onChange={(e) => handleChange('delivery_notes', e.target.value)}
                  placeholder="Дополнительная информация о поставке"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Общие примечания */}
          <div className="form-group">
            <label>Примечания</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация"
              rows={2}
            />
          </div>

          {/* Предварительный просмотр */}
          {formData.quantity && material && (
            <div className="preview-info">
              <h4>Предварительный просмотр:</h4>
              <p>
                <strong>Новый остаток:</strong> {
                  transactionType === 'in' ? 
                    (material.quantity || 0) + parseFloat(formData.quantity) :
                    transactionType === 'out' ?
                      Math.max(0, (material.quantity || 0) - parseFloat(formData.quantity)) :
                      parseFloat(formData.quantity)
                } {material.unit}
              </p>
              {isDeliveryTransaction && selectedSupplier && (
                <p><strong>Поставщик:</strong> {selectedSupplier.name}</p>
              )}
            </div>
          )}

          {/* Кнопки */}
          <div className="modal-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Отмена
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || !formData.quantity || !formData.reason}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

