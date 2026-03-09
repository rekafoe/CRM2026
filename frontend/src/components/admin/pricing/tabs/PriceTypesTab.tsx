import React, { useState, useEffect, useCallback } from 'react';
import { Button, FormField, StatusBadge, EmptyState } from '../../../common';
import { getPriceTypes, updatePriceType, createPriceType, deletePriceType } from '../../../services/pricing';
import type { PriceType } from '../../../types/pricing';

const formatMultiplier = (m: number) => {
  if (m >= 1) return `×${m} (+${((m - 1) * 100).toFixed(0)}%)`;
  return `×${m} (−${((1 - m) * 100).toFixed(1)}%)`;
};

interface PriceTypesTabProps {
  searchTerm: string;
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
}

export const PriceTypesTab: React.FC<PriceTypesTabProps> = ({
  searchTerm,
  onError,
  onSuccess,
}) => {
  const [items, setItems] = useState<PriceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PriceType>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getPriceTypes(false);
      setItems(list);
    } catch (e: any) {
      onError?.(e?.message || 'Не удалось загрузить типы цен');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = items.filter(
    (item) =>
      !searchTerm ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = useCallback((item: PriceType) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      multiplier: item.multiplier,
      productionDays: item.productionDays,
      description: item.description ?? '',
    });
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({});
  }, []);

  const handleSave = useCallback(async () => {
    if (editingId == null) return;
    try {
      setSaving(true);
      if (editingId === -1) {
        await createPriceType({
          key: (editForm.key ?? '').trim() || 'custom',
          name: (editForm.name ?? '').trim() || 'Новый тип',
          multiplier: Number(editForm.multiplier ?? 1),
          productionDays: Number(editForm.productionDays ?? 3),
          description: editForm.description || undefined,
          sortOrder: items.length,
        });
        onSuccess?.('Тип цены создан');
      } else {
        await updatePriceType(editingId, {
          name: editForm.name,
          multiplier: editForm.multiplier,
          productionDays: editForm.productionDays,
          description: editForm.description ?? null,
        });
        onSuccess?.('Тип цены обновлён');
      }
      await load();
      handleCancel();
    } catch (e: any) {
      onError?.(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [editingId, editForm, items.length, load, handleCancel, onSuccess, onError]);

  const handleDelete = useCallback(
    async (id: number, isSystem: boolean) => {
      if (isSystem) {
        onError?.('Нельзя удалить системный тип цены (standard, online)');
        return;
      }
      if (!confirm('Удалить этот тип цены?')) return;
      try {
        setSaving(true);
        await deletePriceType(id);
        onSuccess?.('Тип цены удалён');
        await load();
      } catch (e: any) {
        onError?.(e?.message || 'Ошибка удаления');
      } finally {
        setSaving(false);
      }
    },
    [load, onSuccess, onError]
  );

  const handleAddNew = useCallback(() => {
    setEditingId(-1);
    setEditForm({
      key: '',
      name: '',
      multiplier: 1,
      productionDays: 3,
      description: '',
    });
  }, []);

  if (loading) {
    return (
      <div className="pricing-section">
        <div className="section-header">
          <h3>Типы цен</h3>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Типы цен</h3>
        <p>Стандартная (×1) и Онлайн (−17,5%) всегда доступны. Остальные настраиваются для каждого продукта.</p>
        <div className="mt-2">
          <Button variant="primary" size="sm" onClick={handleAddNew} disabled={editingId !== null}>
            ➕ Добавить тип цены
          </Button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          icon="💰"
          title="Нет типов цен"
          description="Типы цен загружаются из базы. Проверьте миграции."
        />
      ) : (
        <div className="data-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>{item.name}</h4>
                  <StatusBadge status={item.isActive ? 'active' : 'inactive'} />
                  {item.isSystem && (
                    <span className="badge badge-secondary ms-2" title="Системный">система</span>
                  )}
                </div>
                {editingId === item.id || editingId === -1 ? (
                  <div className="card-actions">
                    <Button variant="success" size="sm" onClick={handleSave} loading={saving}>
                      Сохранить
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleCancel}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <div className="card-actions">
                    <Button variant="primary" size="sm" onClick={() => handleEdit(item)}>
                      Изменить
                    </Button>
                    {!item.isSystem && (
                      <Button variant="error" size="sm" onClick={() => handleDelete(item.id, item.isSystem)}>
                        Удалить
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="card-content">
                <div className="field-group">
                  <FormField label="Ключ">
                    <span className="field-value">{item.key}</span>
                  </FormField>
                  <FormField label="Множитель">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        max="3"
                        value={editForm.multiplier ?? 1}
                        onChange={(e) => setEditForm({ ...editForm, multiplier: parseFloat(e.target.value) || 1 })}
                        className="form-control"
                      />
                    ) : (
                      <span className="field-value">{formatMultiplier(item.multiplier)}</span>
                    )}
                  </FormField>
                  <FormField label="Срок (дней)">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={editForm.productionDays ?? 3}
                        onChange={(e) => setEditForm({ ...editForm, productionDays: parseInt(e.target.value, 10) || 3 })}
                        className="form-control"
                      />
                    ) : (
                      <span className="field-value">{item.productionDays} дн.</span>
                    )}
                  </FormField>
                  <FormField label="Описание">
                    {editingId === item.id ? (
                      <input
                        type="text"
                        value={editForm.description ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="form-control"
                        placeholder="Описание"
                      />
                    ) : (
                      <span className="field-value">{item.description || '—'}</span>
                    )}
                  </FormField>
                  {editingId === -1 && (
                    <FormField label="Ключ (латиница)">
                      <input
                        type="text"
                        value={editForm.key ?? ''}
                        onChange={(e) => setEditForm({ ...editForm, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                        className="form-control"
                        placeholder="custom_key"
                      />
                    </FormField>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
