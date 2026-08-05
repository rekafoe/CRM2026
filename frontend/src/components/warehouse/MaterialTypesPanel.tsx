import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMaterialType,
  deleteMaterialType,
  getMaterialTypes,
  updateMaterialType,
  MaterialTypeDto,
} from '../../api';
import { useUIStore } from '../../stores/uiStore';
import { EmptyState, ConfirmDialog } from '../common';
import { AppIcon } from '../ui/AppIcon';
import { WarehouseButton } from './common/WarehouseButton';
import { WarehouseModal } from './common/WarehouseModal';
import './MaterialTypesPanel.css';

interface MaterialTypesPanelProps {
  categoryId: number | null;
  categoryName?: string;
}

type TypeForm = {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
};

const EMPTY_FORM: TypeForm = {
  name: '',
  code: '',
  description: '',
  is_active: true,
};

export const MaterialTypesPanel: React.FC<MaterialTypesPanelProps> = ({
  categoryId,
  categoryName,
}) => {
  const { showToast } = useUIStore();
  const [types, setTypes] = useState<MaterialTypeDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MaterialTypeDto | null>(null);
  const [form, setForm] = useState<TypeForm>(EMPTY_FORM);
  const [typeToDelete, setTypeToDelete] = useState<MaterialTypeDto | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!categoryId) {
      setTypes([]);
      return;
    }
    try {
      setLoading(true);
      const res = await getMaterialTypes({ category_id: categoryId });
      setTypes(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Не удалось загрузить типы', 'error');
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) =>
      (t.name || '').toLowerCase().includes(q)
      || (t.code || '').toLowerCase().includes(q)
      || (t.description || '').toLowerCase().includes(q),
    );
  }, [types, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (row: MaterialTypeDto) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      code: row.code || '',
      description: row.description || '',
      is_active: Number(row.is_active ?? 1) !== 0,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!categoryId) return;
    if (!form.name.trim()) {
      showToast('Введите название типа', 'warning');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        category_id: categoryId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await updateMaterialType(editing.id, payload);
        showToast('Тип обновлён', 'success');
      } else {
        await createMaterialType(payload);
        showToast('Тип создан', 'success');
      }
      setShowModal(false);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.error || error?.message || 'Ошибка сохранения типа', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!typeToDelete) return;
    try {
      await deleteMaterialType(typeToDelete.id);
      showToast('Тип удалён', 'success');
      setTypeToDelete(null);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.error || error?.message || 'Ошибка удаления типа', 'error');
      setTypeToDelete(null);
    }
  };

  if (!categoryId) {
    return (
      <div className="material-types-panel">
        <EmptyState
          title="Выберите категорию"
          description="Типы материалов создаются внутри категории. Выберите категорию слева."
        />
      </div>
    );
  }

  return (
    <div className="material-types-panel">
      <div className="material-types-panel__header">
        <div>
          <h3 className="material-types-panel__title">
            Типы: {categoryName || `категория #${categoryId}`}
          </h3>
          <p className="material-types-panel__hint">
            Здесь создаются типы, которые потом выбираются в карточке материала.
          </p>
        </div>
        <div className="flex gap-2">
          <WarehouseButton
            variant="secondary"
            size="sm"
            icon={<AppIcon name="refresh" size="xs" />}
            onClick={load}
            title="Обновить"
          >
            Обновить
          </WarehouseButton>
          <WarehouseButton
            variant="primary"
            size="sm"
            icon={<AppIcon name="plus" size="xs" />}
            onClick={openCreate}
          >
            Добавить тип
          </WarehouseButton>
        </div>
      </div>

      <input
        className="form-input"
        placeholder="Поиск типа..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="material-types-panel__hint">Загрузка типов...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нет типов в этой категории"
          description="Создайте тип, например «Плёнка глянец» или «Бумага мелованная»"
          action={{ label: 'Добавить тип', onClick: openCreate }}
        />
      ) : (
        <div className="material-types-panel__table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Код</th>
                <th>Описание</th>
                <th>Статус</th>
                <th>Материалы</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const active = Number(row.is_active ?? 1) !== 0;
                return (
                  <tr key={row.id} className={active ? undefined : 'material-types-panel__inactive'}>
                    <td>{row.name}</td>
                    <td>{row.code || '—'}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      <span className={`material-types-panel__badge ${active ? 'material-types-panel__badge--active' : ''}`}>
                        {active ? 'Активен' : 'Выключен'}
                      </span>
                    </td>
                    <td>{row.materials_count ?? 0}</td>
                    <td>
                      <div className="inv-actions">
                        <WarehouseButton
                          variant="secondary"
                          size="sm"
                          icon={<AppIcon name="pencil" size="xs" />}
                          onClick={() => openEdit(row)}
                          title="Изменить"
                          className="icon-only"
                        />
                        <WarehouseButton
                          variant="danger"
                          size="sm"
                          icon={<AppIcon name="trash" size="xs" />}
                          onClick={() => setTypeToDelete(row)}
                          title="Удалить"
                          className="icon-only"
                          disabled={(row.materials_count ?? 0) > 0}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WarehouseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Редактировать тип' : 'Новый тип материала'}
        footer={(
          <>
            <WarehouseButton variant="secondary" onClick={() => setShowModal(false)}>
              Отмена
            </WarehouseButton>
            <WarehouseButton variant="primary" onClick={save} loading={saving}>
              Сохранить
            </WarehouseButton>
          </>
        )}
      >
        <div className="material-types-form">
          <div className="form-row">
            <div className="form-group form-group--full">
              <label>Название *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Например, Плёнка глянец"
              />
            </div>
            <div className="form-group">
              <label>Код</label>
              <input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Необязательно"
              />
            </div>
            <div className="form-group">
              <label className="material-types-form__checkbox">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Активен
              </label>
            </div>
            <div className="form-group form-group--full">
              <label>Описание</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </WarehouseModal>

      <ConfirmDialog
        isOpen={Boolean(typeToDelete)}
        onClose={() => setTypeToDelete(null)}
        onConfirm={confirmDelete}
        title="Удаление типа"
        message={typeToDelete ? `Удалить тип «${typeToDelete.name}»?` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />
    </div>
  );
};
