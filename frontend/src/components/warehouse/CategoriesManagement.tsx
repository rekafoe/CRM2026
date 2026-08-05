import React from 'react';
import {
  getMaterialCategories,
  getMaterialCategoryStats,
  createMaterialCategory,
  updateMaterialCategory,
  deleteMaterialCategory,
} from '../../api';
import { useUIStore } from '../../stores/uiStore';
import { EmptyState, ConfirmDialog, LoadingState } from '../common';
import { AppIcon } from '../ui/AppIcon';
import { WarehouseButton } from './common/WarehouseButton';
import { WarehouseModal } from './common/WarehouseModal';
import { MaterialTypesPanel } from './MaterialTypesPanel';
import './CategoriesManagement.css';

interface CategoriesManagementProps {
  onRefresh?: () => void;
}

type CategoryRow = {
  id: number;
  name: string;
  color?: string;
  description?: string;
  created_at?: string;
};

export const CategoriesManagement: React.FC<CategoriesManagementProps> = ({ onRefresh }) => {
  const { showToast } = useUIStore();
  const [categories, setCategories] = React.useState<CategoryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);
  const [form, setForm] = React.useState<{ name: string; color?: string; description?: string }>({
    name: '',
    color: '',
    description: '',
  });
  const [materialsCount, setMaterialsCount] = React.useState<Record<number, number>>({});
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<number | null>(null);
  const [categoryToDelete, setCategoryToDelete] = React.useState<CategoryRow | null>(null);
  const [saving, setSaving] = React.useState(false);

  const palette = React.useMemo(() => [
    '#F1F5F9', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569',
    '#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#1E88E5',
    '#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#43A047',
    '#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726', '#FB8C00',
    '#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#E53935',
  ], []);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesRes, statsRes] = await Promise.all([
        getMaterialCategories(),
        getMaterialCategoryStats(),
      ]);
      const rows = (categoriesRes.data || []) as CategoryRow[];
      setCategories(rows);

      const countMap: Record<number, number> = {};
      if (statsRes.data) {
        statsRes.data.forEach((stat: any) => {
          countMap[stat.category_id] = stat.materials_count || 0;
        });
      }
      setMaterialsCount(countMap);

      setSelectedCategoryId((prev) => {
        if (prev && rows.some((c) => c.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch (error: any) {
      showToast(error?.message || 'Ошибка загрузки категорий', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const unique = (categories || []).reduce((acc, category) => {
      if (!acc.find((c) => c.id === category.id)) acc.push(category);
      return acc;
    }, [] as CategoryRow[]);
    return unique.filter(
      (c) => !q
        || (c.name || '').toLowerCase().includes(q)
        || (c.description || '').toLowerCase().includes(q),
    );
  }, [categories, search]);

  const selectedCategory = React.useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) || null,
    [categories, selectedCategoryId],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', color: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (c: CategoryRow) => {
    setEditing(c);
    setForm({ name: c.name || '', color: c.color || '', description: c.description || '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      showToast('Введите название категории', 'warning');
      return;
    }
    try {
      setSaving(true);
      if (editing?.id) {
        await updateMaterialCategory(editing.id, form);
        showToast('Категория обновлена', 'success');
      } else {
        await createMaterialCategory(form);
        showToast('Категория создана', 'success');
      }
      setShowModal(false);
      await load();
      onRefresh?.();
    } catch (error: any) {
      showToast(error?.message || 'Ошибка сохранения категории', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteMaterialCategory(categoryToDelete.id);
      showToast('Категория удалена', 'success');
      setCategoryToDelete(null);
      await load();
      onRefresh?.();
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Ошибка удаления';
      showToast(msg, 'error');
      setCategoryToDelete(null);
    }
  };

  return (
    <div className="categories-management">
      <div className="categories-management__header">
        <h2 className="categories-management__title">Категории и типы материалов</h2>
        <WarehouseButton
          variant="primary"
          size="sm"
          icon={<AppIcon name="plus" size="xs" />}
          onClick={openCreate}
        >
          Добавить категорию
        </WarehouseButton>
      </div>

      <div className="categories-management__toolbar">
        <input
          className="categories-management__search"
          placeholder="Поиск категории..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <WarehouseButton
          variant="secondary"
          size="sm"
          icon={<AppIcon name="refresh" size="xs" />}
          onClick={load}
        >
          Обновить
        </WarehouseButton>
      </div>

      <div className="categories-management__layout">
        <section className="categories-management__panel">
          <h3 className="categories-management__panel-title">Категории</h3>
          {loading ? (
            <LoadingState message="Загрузка категорий..." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Нет категорий"
              description="Создайте категорию, затем добавьте в неё типы материалов"
              action={{ label: 'Добавить категорию', onClick: openCreate }}
            />
          ) : (
            <div className="categories-management__table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Цвет</th>
                    <th>Материалы</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const count = materialsCount[c.id] || 0;
                    return (
                      <tr
                        key={c.id}
                        className={`categories-management__row ${selectedCategoryId === c.id ? 'is-selected' : ''}`}
                        onClick={() => setSelectedCategoryId(c.id)}
                      >
                        <td>
                          <div className="font-medium">{c.name}</div>
                          {c.description ? (
                            <div className="text-xs text-text-secondary">{c.description}</div>
                          ) : null}
                        </td>
                        <td>
                          {c.color ? (
                            <span
                              className="categories-management__color"
                              style={{ background: c.color }}
                              title={c.color}
                            />
                          ) : '—'}
                        </td>
                        <td>
                          <span className={`categories-management__count ${count > 0 ? 'categories-management__count--has' : 'categories-management__count--empty'}`}>
                            {count}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="inv-actions">
                            <WarehouseButton
                              variant="secondary"
                              size="sm"
                              icon={<AppIcon name="pencil" size="xs" />}
                              onClick={() => openEdit(c)}
                              className="icon-only"
                              title="Изменить"
                            />
                            <WarehouseButton
                              variant="danger"
                              size="sm"
                              icon={<AppIcon name="trash" size="xs" />}
                              onClick={() => setCategoryToDelete(c)}
                              className="icon-only"
                              title={count > 0 ? 'Нельзя удалить категорию с материалами' : 'Удалить'}
                              disabled={count > 0}
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
        </section>

        <section className="categories-management__panel">
          <MaterialTypesPanel
            categoryId={selectedCategoryId}
            categoryName={selectedCategory?.name}
          />
        </section>
      </div>

      <WarehouseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Редактировать категорию' : 'Новая категория'}
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
        <div className="categories-form">
          <div className="form-group">
            <label>Название *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Цвет</label>
            <div className="categories-management__color-inputs">
              <input
                type="color"
                value={form.color || '#FFFFFF'}
                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
              />
              <input
                type="text"
                value={form.color || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="#DDEEFF"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Палитра</label>
            <div className="categories-management__palette">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="categories-management__swatch"
                  onClick={() => setForm((prev) => ({ ...prev, color: c }))}
                  title={c}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Описание</label>
            <input
              value={form.description || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </div>
      </WarehouseModal>

      <ConfirmDialog
        isOpen={Boolean(categoryToDelete)}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={confirmDelete}
        title="Удаление категории"
        message={categoryToDelete ? `Удалить категорию «${categoryToDelete.name}»?` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />
    </div>
  );
};
