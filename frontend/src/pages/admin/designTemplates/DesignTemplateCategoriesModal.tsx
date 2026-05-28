import React, { useCallback, useEffect, useState } from 'react';

import { Modal } from '../../../components/common';

import '../../../components/admin/ProductManagement.css';

import { AppIcon } from '../../../components/ui/AppIcon';

import {

  createDesignTemplateCategory,

  deleteDesignTemplateCategory,

  getDesignTemplateCategories,

  updateDesignTemplateCategory,

  type DesignTemplateCategory,

} from '../../../api';



type Props = {

  isOpen: boolean;

  onClose: () => void;

  onChanged: () => void;

};



export const DesignTemplateCategoriesModal: React.FC<Props> = ({ isOpen, onClose, onChanged }) => {

  const [list, setList] = useState<DesignTemplateCategory[]>([]);

  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState('');

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [editingName, setEditingName] = useState('');



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const res = await getDesignTemplateCategories();

      setList(res.data);

    } catch {

      setError('Не удалось загрузить категории');

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    if (isOpen) void load();

  }, [isOpen, load]);



  const handleAdd = async () => {

    const name = newName.trim();

    if (!name) return;

    setSaving(true);

    setError(null);

    try {

      await createDesignTemplateCategory(name);

      setNewName('');

      await load();

      onChanged();

    } catch (err: unknown) {

      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;

      setError(msg ?? (err instanceof Error ? err.message : 'Ошибка'));

    } finally {

      setSaving(false);

    }

  };



  const startRename = (cat: DesignTemplateCategory) => {

    setEditingId(cat.id);

    setEditingName(cat.name);

  };



  const cancelRename = () => {

    setEditingId(null);

    setEditingName('');

  };



  const saveRename = async (cat: DesignTemplateCategory) => {

    const name = editingName.trim();

    if (!name || name === cat.name) {

      cancelRename();

      return;

    }

    setSaving(true);

    setError(null);

    try {

      await updateDesignTemplateCategory(cat.id, { name });

      cancelRename();

      await load();

      onChanged();

    } catch (err: unknown) {

      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;

      setError(msg ?? (err instanceof Error ? err.message : 'Ошибка переименования'));

    } finally {

      setSaving(false);

    }

  };



  const handleDelete = async (cat: DesignTemplateCategory) => {

    const note = cat.template_count

      ? `У ${cat.template_count} шаблонов снимется категория.`

      : '';

    if (!confirm(`Удалить «${cat.name}»? ${note}`)) return;

    try {

      await deleteDesignTemplateCategory(cat.id);

      await load();

      onChanged();

    } catch (err: unknown) {

      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;

      setError(msg ?? 'Ошибка удаления');

    }

  };



  const move = async (cat: DesignTemplateCategory, delta: number) => {

    const idx = list.findIndex((c) => c.id === cat.id);

    const swap = list[idx + delta];

    if (!swap) return;

    try {

      await updateDesignTemplateCategory(cat.id, { sort_order: swap.sort_order });

      await updateDesignTemplateCategory(swap.id, { sort_order: cat.sort_order });

      await load();

      onChanged();

    } catch {

      setError('Не удалось изменить порядок');

    }

  };



  return (

    <Modal isOpen={isOpen} onClose={onClose} title="Категории дизайнов" size="md" className="product-management design-templates-modal">

      <p className="design-categories-modal-lead">

        Категории группируют каталог. Переименование обновит категорию у всех шаблонов.

      </p>

      {error && <p className="design-categories-modal-error">{error}</p>}



      <div className="design-categories-modal-add">

        <input

          type="text"

          value={newName}

          placeholder="Новая категория…"

          onChange={(e) => setNewName(e.target.value)}

          onKeyDown={(e) => {

            if (e.key === 'Enter') void handleAdd();

          }}

        />

        <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleAdd()} disabled={saving || !newName.trim()}>

          <AppIcon name="plus" size="xs" /> Добавить

        </button>

      </div>



      {loading ? (

        <p className="design-categories-modal-hint">Загрузка…</p>

      ) : (

        <ul className="design-categories-list">

          {list.map((cat, index) => (

            <li key={cat.id} className="design-categories-list__item">

              {editingId === cat.id ? (

                <div className="design-categories-list__rename">

                  <input

                    type="text"

                    value={editingName}

                    onChange={(e) => setEditingName(e.target.value)}

                    onKeyDown={(e) => {

                      if (e.key === 'Enter') void saveRename(cat);

                      if (e.key === 'Escape') cancelRename();

                    }}

                    autoFocus

                  />

                  <button type="button" className="lg-btn lg-btn--primary" onClick={() => void saveRename(cat)} disabled={saving}>

                    OK

                  </button>

                  <button type="button" className="lg-btn" onClick={cancelRename}>

                    Отмена

                  </button>

                </div>

              ) : (

                <span className="design-categories-list__name">{cat.name}</span>

              )}

              <span className="design-categories-list__count">{cat.template_count ?? 0} шабл.</span>

              <div className="design-categories-list__actions">

                {editingId !== cat.id && (

                  <button

                    type="button"

                    className="lg-btn lg-btn--icon"

                    onClick={() => startRename(cat)}

                    title="Переименовать"

                    aria-label="Переименовать"

                  >

                    <AppIcon name="edit" size="xs" />

                  </button>

                )}

                <button

                  type="button"

                  className="lg-btn lg-btn--icon"

                  disabled={index === 0}

                  onClick={() => void move(cat, -1)}

                  title="Выше"

                  aria-label="Выше"

                >

                  ▲

                </button>

                <button

                  type="button"

                  className="lg-btn lg-btn--icon"

                  disabled={index === list.length - 1}

                  onClick={() => void move(cat, 1)}

                  title="Ниже"

                  aria-label="Ниже"

                >

                  ▼

                </button>

                <button

                  type="button"

                  className="lg-btn lg-btn--icon lg-btn--danger"

                  onClick={() => void handleDelete(cat)}

                  title="Удалить"

                  aria-label="Удалить"

                >

                  <AppIcon name="trash" size="xs" />

                </button>

              </div>

            </li>

          ))}

        </ul>

      )}

    </Modal>

  );

};


