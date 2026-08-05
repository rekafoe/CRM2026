import React, { useState, useEffect, useRef } from 'react';
import { Material } from '../../types/shared';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { spendMaterial } from '../../api';
import { formatRollStockLabel, isRollMaterial } from '../../utils/materialRollLabels';
import { getMaterialMinStock, getSuggestedReplenishQty } from '../../utils/materialStockOps';
import './EnhancedMaterialTransactionModal.css';

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
  /** Предзаполнить количество (напр. «до минимума» из дефицита) */
  initialQuantity?: number | null;
}

const TITLE_BY_TYPE: Record<string, string> = {
  in: 'Приход материала',
  out: 'Списание материала',
  adjustment: 'Корректировка остатка',
  transfer: 'Перемещение материала',
};

const REASON_BY_TYPE: Record<string, string> = {
  in: 'Поступление материалов',
  out: 'Списание материалов',
  adjustment: 'Корректировка остатков',
  transfer: 'Перемещение материалов',
};

function formatQtyHint(value: number, material: Material | null): string {
  if (!material || !isRollMaterial(material as any)) {
    return String(value);
  }
  return formatRollStockLabel({
    sheet_width: (material as any).sheet_width,
    quantity: value,
  });
}

export const EnhancedMaterialTransactionModal: React.FC<EnhancedMaterialTransactionModalProps> = ({
  isOpen,
  onClose,
  material,
  transactionType,
  onSuccess,
  initialQuantity = null,
}) => {
  const [formData, setFormData] = useState({
    quantity: '',
    reason: '',
    notes: '',
    orderId: '',
    supplier_id: '',
    delivery_number: '',
    invoice_number: '',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_notes: ''
  });
  const [showNotes, setShowNotes] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const prefill =
      initialQuantity != null && Number.isFinite(initialQuantity) && initialQuantity > 0
        ? String(initialQuantity)
        : '';

    setFormData({
      quantity: prefill,
      reason: REASON_BY_TYPE[transactionType] || '',
      notes: '',
      orderId: '',
      supplier_id: material?.supplier_id?.toString() || '',
      delivery_number: '',
      invoice_number: '',
      delivery_date: new Date().toISOString().split('T')[0],
      delivery_notes: ''
    });
    setShowNotes(false);
    setError(null);

    const t = window.setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, material, transactionType, initialQuantity]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onClose]);

  const loadSuppliers = async () => {
    try {
      const response = await api.get<Supplier[]>(ENDPOINTS.SUPPLIERS.LIST);
      setSuppliers(response.data.filter(s => s.is_active));
    } catch {
      setError('Ошибка загрузки списка поставщиков');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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

      const delta = transactionType === 'out' ? -quantity : quantity;
      const payload: Parameters<typeof spendMaterial>[0] = {
        materialId: material.id!,
        delta,
        reason: formData.reason,
        orderId: formData.orderId ? parseInt(formData.orderId, 10) : undefined,
      };

      if (delta > 0) {
        if (formData.supplier_id) {
          payload.supplier_id = Number(formData.supplier_id);
        }
        if (formData.delivery_number.trim()) {
          payload.delivery_number = formData.delivery_number.trim();
        }
        if (formData.invoice_number.trim()) {
          payload.invoice_number = formData.invoice_number.trim();
        }
        if (formData.delivery_date.trim()) {
          payload.delivery_date = formData.delivery_date.trim();
        }
        if (formData.delivery_notes.trim()) {
          payload.delivery_notes = formData.delivery_notes.trim();
        }
      }
      if (formData.notes.trim()) {
        payload.notes = formData.notes.trim();
      }

      await spendMaterial(payload);

      onSuccess();
      onClose();
    } catch (err: any) {
      const apiMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(apiMessage || 'Ошибка создания операции');
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
  const isRoll = material ? isRollMaterial(material as any) : false;
  const selectedSupplier = suppliers.find(s => s.id.toString() === formData.supplier_id);
  const stockLabel = material
    ? (isRoll
      ? formatRollStockLabel(material as any)
      : `${material.quantity || 0} ${material.unit || ''}`.trim())
    : '';

  const suggestedInQty = material ? getSuggestedReplenishQty(material) : 0;
  const minStock = material ? getMaterialMinStock(material) : 0;

  const qtyNum = parseFloat(formData.quantity);
  const previewQty = material && !isNaN(qtyNum)
    ? (transactionType === 'in'
      ? (material.quantity || 0) + qtyNum
      : transactionType === 'out'
        ? Math.max(0, (material.quantity || 0) - qtyNum)
        : qtyNum)
    : null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !loading) onClose();
    }}>
      <div className="modal-content enhanced-transaction-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{TITLE_BY_TYPE[transactionType] || 'Операция со складом'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {material && (
            <div className="material-info">
              <h4>{material.name}</h4>
              <p>Текущий остаток: <strong>{stockLabel}</strong></p>
              {transactionType === 'in' && (
                <p>Мин. остаток: <strong>{formatQtyHint(minStock, material)}</strong></p>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>{isRoll && transactionType !== 'adjustment' ? 'Намотка, м *' : 'Количество *'}</label>
              <input
                ref={qtyInputRef}
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                placeholder={isRoll ? 'Метры намотки' : 'Сколько'}
                required
                autoFocus
              />
              {isRoll && (
                <p className="qty-field-hint">
                  Вводите метры — на экране будет как{' '}
                  <strong>
                    {formatRollStockLabel({
                      sheet_width: (material as any)?.sheet_width,
                      quantity: !isNaN(qtyNum) && qtyNum > 0 ? qtyNum : 50,
                    })}
                  </strong>
                </p>
              )}
              {transactionType === 'in' && material && suggestedInQty > 0 && (
                <div className="qty-quick-actions">
                  <button
                    type="button"
                    className="qty-chip"
                    onClick={() => handleChange('quantity', String(suggestedInQty))}
                  >
                    До минимума (+{formatQtyHint(suggestedInQty, material)})
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Причина *</label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                placeholder="Зачем эта операция"
                required
              />
            </div>
          </div>

          {previewQty !== null && material && (
            <div className="preview-info">
              <p>
                После операции остаток:{' '}
                <strong>
                  {isRoll
                    ? formatRollStockLabel({
                        sheet_width: (material as any).sheet_width,
                        quantity: previewQty,
                      })
                    : `${previewQty} ${material.unit || ''}`.trim()}
                </strong>
              </p>
            </div>
          )}

          {isDeliveryTransaction && (
            <details className="inv-optional-block">
              <summary>Документы поставки — сохраняются в историю</summary>
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
              {selectedSupplier && (
                <p className="inv-material-meta">Выбран: {selectedSupplier.name}</p>
              )}
              <div className="form-group">
                <label>Примечания к поставке</label>
                <textarea
                  value={formData.delivery_notes}
                  onChange={(e) => handleChange('delivery_notes', e.target.value)}
                  placeholder="Дополнительно о поставке"
                  rows={2}
                />
              </div>
            </details>
          )}

          {!showNotes ? (
            <button
              type="button"
              className="action-btn action-btn--text inv-link-btn"
              onClick={() => setShowNotes(true)}
            >
              + Примечание
            </button>
          ) : (
            <div className="form-group">
              <label>Примечание</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Дополнительная информация"
                rows={2}
              />
            </div>
          )}

          <div className="modal-actions">
            <p className="modal-kbd-hint">Enter — провести · Esc — закрыть</p>
            <div className="modal-actions__btns">
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
                {loading ? 'Сохранение...' : 'Провести'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
