import React, { useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common';
import {
  ProductCategory,
  createProductCategory,
  updateProductCategory,
  uploadCategoryImage,
} from '../../services/products';
import './CategoryManagementModal.css';

interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onCategoriesChanged: () => void;
}

interface CategoryFormData {
  name: string;
  icon: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

const emptyForm: CategoryFormData = {
  name: '',
  icon: '',
  description: '',
  image_url: '',
  sort_order: 0,
  is_active: true,
};

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCategoriesChanged,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CategoryFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCreating(true);
    setError(null);
  };

  const startEdit = (cat: ProductCategory) => {
    setCreating(false);
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      icon: cat.icon || '',
      description: cat.description || '',
      image_url: cat.image_url || '',
      sort_order: cat.sort_order,
      is_active: cat.is_active,
    });
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Название обязательно');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (creating) {
        await createProductCategory({
          name: form.name.trim(),
          icon: form.icon.trim() || undefined,
          description: form.description.trim() || undefined,
          image_url: form.image_url.trim() || undefined,
          sort_order: form.sort_order,
        });
      } else if (editingId != null) {
        await updateProductCategory(editingId, {
          name: form.name.trim(),
          icon: form.icon.trim() || undefined,
          description: form.description.trim() || undefined,
          image_url: form.image_url.trim() || undefined,
          sort_order: form.sort_order,
          is_active: form.is_active,
        });
      }
      cancel();
      onCategoriesChanged();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadCategoryImage(file);
      setForm((prev) => ({ ...prev, image_url: result.image_url }));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Ошибка загрузки изображения');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image_url: '' }));
  };

  const isEditing = creating || editingId != null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Управление категориями" size="lg">
      <div className="cat-mgmt">
        {!isEditing && (
          <>
            <div className="cat-mgmt__toolbar">
              <span className="cat-mgmt__count">{categories.length} категорий</span>
              <Button variant="primary" size="sm" onClick={startCreate}>
                + Новая категория
              </Button>
            </div>

            <div className="cat-mgmt__list">
              {sortedCategories.length === 0 ? (
                <div className="cat-mgmt__empty">Категорий пока нет. Создайте первую!</div>
              ) : (
                sortedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`cat-mgmt__item ${!cat.is_active ? 'cat-mgmt__item--inactive' : ''}`}
                  >
                    {cat.image_url ? (
                      <img src={cat.image_url} alt="" className="cat-mgmt__item-thumb" />
                    ) : (
                      <div className="cat-mgmt__item-icon">{cat.icon || '📁'}</div>
                    )}
                    <div className="cat-mgmt__item-body">
                      <div className="cat-mgmt__item-name">
                        {cat.name}
                        {!cat.is_active && <span className="cat-mgmt__badge cat-mgmt__badge--inactive">Скрыта</span>}
                      </div>
                      {cat.description && (
                        <div className="cat-mgmt__item-desc">{cat.description}</div>
                      )}
                    </div>
                    <div className="cat-mgmt__item-meta">
                      <span className="cat-mgmt__item-order" title="Порядок сортировки">#{cat.sort_order}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => startEdit(cat)}>
                      Изменить
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {isEditing && (
          <div className="cat-mgmt__form">
            <h4 className="cat-mgmt__form-title">
              {creating ? 'Новая категория' : 'Редактирование категории'}
            </h4>

            {error && <div className="cat-mgmt__error">{error}</div>}

            <div className="cat-mgmt__form-grid">
              <div className="cat-mgmt__field">
                <label className="cat-mgmt__label">Название *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Например: Визитки"
                  autoFocus
                />
              </div>

              <div className="cat-mgmt__field">
                <label className="cat-mgmt__label">Иконка (эмодзи)</label>
                <input
                  className="form-input"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="📇"
                  style={{ maxWidth: 100 }}
                />
              </div>

              <div className="cat-mgmt__field cat-mgmt__field--full">
                <label className="cat-mgmt__label">Описание</label>
                <textarea
                  className="form-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Краткое описание категории"
                  rows={2}
                />
              </div>

              <div className="cat-mgmt__field cat-mgmt__field--full">
                <label className="cat-mgmt__label">Изображение</label>
                <div className="cat-mgmt__image-upload">
                  {form.image_url ? (
                    <div className="cat-mgmt__image-preview">
                      <img src={form.image_url} alt="Превью" className="cat-mgmt__image-thumb" />
                      <div className="cat-mgmt__image-actions">
                        <span className="cat-mgmt__image-name" title={form.image_url}>
                          {form.image_url.split('/').pop()}
                        </span>
                        <button type="button" className="cat-mgmt__image-remove" onClick={handleRemoveImage} title="Удалить">
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className={`cat-mgmt__image-dropzone ${uploading ? 'cat-mgmt__image-dropzone--loading' : ''}`}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        style={{ display: 'none' }}
                      />
                      {uploading ? (
                        <span className="cat-mgmt__image-loading">Загрузка...</span>
                      ) : (
                        <>
                          <span className="cat-mgmt__image-icon">📷</span>
                          <span>Нажмите для загрузки</span>
                          <span className="cat-mgmt__image-hint">JPEG, PNG, WebP, GIF, SVG — до 5 МБ</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>

              <div className="cat-mgmt__field">
                <label className="cat-mgmt__label">Порядок сортировки</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                  style={{ maxWidth: 100 }}
                />
              </div>

              {!creating && (
                <div className="cat-mgmt__field">
                  <label className="cat-mgmt__label">Статус</label>
                  <label className="cat-mgmt__checkbox">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Активна (видна на сайте)
                  </label>
                </div>
              )}
            </div>

            <div className="cat-mgmt__form-actions">
              <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>
                Отмена
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
                {creating ? 'Создать' : 'Сохранить'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
