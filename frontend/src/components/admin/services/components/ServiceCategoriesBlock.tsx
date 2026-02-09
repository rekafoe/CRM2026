import React, { useState, useCallback } from 'react';
import { Button, Modal } from '../../../common';
import { ServiceCategory } from '../../../../types/pricing';
import {
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
} from '../../../../services/pricing';

interface ServiceCategoriesBlockProps {
  categories: ServiceCategory[];
  onReload: () => void | Promise<void>;
}

const normSortOrder = (c: ServiceCategory) =>
  typeof (c as any).sort_order === 'number' ? (c as any).sort_order : (c.sortOrder ?? 0);

export const ServiceCategoriesBlock: React.FC<ServiceCategoriesBlockProps> = ({ categories, onReload }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      setError('Введите название категории');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createServiceCategory(name, newSortOrder);
      setNewName('');
      setNewSortOrder(categories.length);
      setShowAdd(false);
      await Promise.resolve(onReload());
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать категорию');
    } finally {
      setBusy(false);
    }
  }, [newName, newSortOrder, categories.length, onReload]);

  const startEdit = useCallback((c: ServiceCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSortOrder(normSortOrder(c));
    setError(null);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (editingId == null) return;
    const name = editName.trim();
    if (!name) {
      setError('Введите название');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateServiceCategory(editingId, { name, sortOrder: editSortOrder });
      setEditingId(null);
      await Promise.resolve(onReload());
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }, [editingId, editName, editSortOrder, onReload]);

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      if (!window.confirm(`Удалить категорию «${name}»? Услуги этой категории станут без категории.`)) return;
      setBusy(true);
      setError(null);
      try {
        await deleteServiceCategory(id);
        if (editingId === id) setEditingId(null);
        await Promise.resolve(onReload());
      } catch (e: any) {
        setError(e?.message || 'Не удалось удалить категорию');
      } finally {
        setBusy(false);
      }
    },
    [onReload, editingId]
  );

  const sortedCategories = [...categories].sort(
    (a, b) => normSortOrder(a) - normSortOrder(b)
  );

  return (
    <div className="service-categories-block">
      <div className="service-categories-block__header">
        <h3 className="service-categories-block__title">Категории услуг</h3>
        <p className="service-categories-block__desc">
          Категории задают группировку в списке услуг и в калькуляторе (например: Ламинация, Резка).
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)} disabled={busy}>
          + Добавить категорию
        </Button>
      </div>
      {error && (
        <div className="service-categories-block__error" role="alert">
          {error}
        </div>
      )}
      <ul className="service-categories-block__list">
        {sortedCategories.length === 0 && !showAdd && (
          <li className="service-categories-block__empty">Пока нет категорий</li>
        )}
        {sortedCategories.map((c) => (
          <li key={c.id} className="service-categories-block__item">
            {editingId === c.id ? (
              <div className="service-categories-block__edit">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Название"
                  className="service-categories-block__input"
                />
                <input
                  type="number"
                  min={0}
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                  className="service-categories-block__input-num"
                />
                <Button variant="primary" size="sm" onClick={handleUpdate} disabled={busy}>
                  Сохранить
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                  Отмена
                </Button>
              </div>
            ) : (
              <>
                <span className="service-categories-block__item-name">{c.name}</span>
                <span className="service-categories-block__item-order">Порядок: {normSortOrder(c)}</span>
                <div className="service-categories-block__item-actions">
                  <Button variant="info" size="sm" onClick={() => startEdit(c)}>
                    Изменить
                  </Button>
                  <Button variant="error" size="sm" onClick={() => handleDelete(c.id, c.name)}>
                    Удалить
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {showAdd && (
        <Modal
          isOpen={true}
          title="Новая категория"
          onClose={() => {
            if (!busy) setShowAdd(false);
          }}
        >
          <div className="service-categories-block__form">
            <label className="service-categories-block__label">
              Название
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Например: Ламинация"
                className="service-categories-block__input"
              />
            </label>
            <label className="service-categories-block__label">
              Порядок (число для сортировки)
              <input
                type="number"
                min={0}
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value) || 0)}
                className="service-categories-block__input"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 w-full mt-4 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={busy}>
              {busy ? 'Сохранение…' : 'Создать'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ServiceCategoriesBlock;
