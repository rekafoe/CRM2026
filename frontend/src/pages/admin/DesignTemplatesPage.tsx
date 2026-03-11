import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button, Modal } from '../../components/common';
import {
  getDesignTemplates,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  uploadDesignTemplatePreview,
  type DesignTemplate,
  type DesignTemplateInput,
} from '../../api';
import { API_BASE_URL } from '../../config/constants';
import '../../styles/admin-page-layout.css';
import './DesignTemplatesPage.css';

const DEFAULT_CATEGORIES = ['Свадьба', 'Дети', 'Love story', 'Выпускной', 'Семья', 'Праздники', 'Разное'];

export const DesignTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const orderItemId = searchParams.get('orderItemId') ?? '';
  const orderQuery = [orderId, orderItemId].filter(Boolean).length
    ? `?orderId=${orderId}&orderItemId=${orderItemId}`
    : '';
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    preview_url: '',
    width_mm: '',
    height_mm: '',
    page_count: '',
    is_active: true,
    sort_order: 0,
  });

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDesignTemplates();
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить шаблоны');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      description: '',
      category: '',
      preview_url: '',
      width_mm: '',
      height_mm: '',
      page_count: '',
      is_active: true,
      sort_order: templates.length,
    });
    setModalOpen(true);
  };

  const openEdit = (t: DesignTemplate) => {
    setEditingId(t.id);
    let spec: { width_mm?: number; height_mm?: number; page_count?: number } = {};
    try {
      if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
    } catch {}
    setForm({
      name: t.name,
      description: t.description ?? '',
      category: t.category ?? '',
      preview_url: t.preview_url ?? '',
      width_mm: spec.width_mm != null ? String(spec.width_mm) : '',
      height_mm: spec.height_mm != null ? String(spec.height_mm) : '',
      page_count: spec.page_count != null ? String(spec.page_count) : '',
      is_active: t.is_active === 1,
      sort_order: t.sort_order ?? 0,
    });
    setModalOpen(true);
  };

  const handlePreviewUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadDesignTemplatePreview(file);
      const url = res.data?.url ?? `${API_BASE_URL}/uploads/${res.data?.filename}`;
      setForm((prev) => ({ ...prev, preview_url: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки превью');
    }
    e.target.value = '';
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      setError('Укажите название');
      return;
    }
    const spec: Record<string, unknown> = {};
    if (form.width_mm) spec.width_mm = parseFloat(form.width_mm);
    if (form.height_mm) spec.height_mm = parseFloat(form.height_mm);
    if (form.page_count) spec.page_count = parseInt(form.page_count, 10);

    try {
      setError(null);
      const payload: DesignTemplateInput = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        preview_url: form.preview_url || undefined,
        spec: Object.keys(spec).length ? spec : undefined,
        is_active: form.is_active,
        sort_order: form.sort_order,
      };
      if (editingId) {
        await updateDesignTemplate(editingId, payload);
      } else {
        await createDesignTemplate(payload as DesignTemplateInput & { name: string });
      }
      await loadTemplates();
      setModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  }, [form, editingId, loadTemplates]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Удалить шаблон?')) return;
    try {
      await deleteDesignTemplate(id);
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }, [loadTemplates]);

  const filtered = categoryFilter
    ? templates.filter((t) => (t.category ?? '') === categoryFilter)
    : templates;

  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...templates.map((t) => t.category).filter(Boolean) as string[]]));

  return (
    <AdminPageLayout
      title="Каталог шаблонов дизайна"
      icon={<AppIcon name="layers" size="sm" />}
      onBack={() => navigate('/adminpanel')}
    >
      {error && <Alert type="error">{error}</Alert>}

      <div className="design-templates-page">
        <div className="design-templates-toolbar">
          <Button onClick={openCreate}>
            <AppIcon name="plus" size="xs" /> Добавить шаблон
          </Button>
          <div className="design-templates-filter">
            <label>Категория:</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Все</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="design-templates-loading">Загрузка...</div>
        ) : (
          <div className="design-templates-grid">
            {filtered.map((t) => {
              const spec = t.spec ? (typeof t.spec === 'string' ? JSON.parse(t.spec) : t.spec) : {};
              const sizeStr = spec.width_mm && spec.height_mm ? `${spec.width_mm}×${spec.height_mm} мм` : null;
              return (
                <div key={t.id} className="design-template-card">
                  <div className="design-template-preview">
                    {t.preview_url ? (
                      <img src={t.preview_url.startsWith('http') ? t.preview_url : `${API_BASE_URL.replace(/\/api\/?$/, '')}${t.preview_url.startsWith('/') ? '' : '/'}${t.preview_url}`} alt={t.name} />
                    ) : (
                      <div className="design-template-placeholder">
                        <AppIcon name="image" size="lg" />
                      </div>
                    )}
                  </div>
                  <div className="design-template-info">
                    <h4>{t.name}</h4>
                    {t.category && <span className="design-template-category">{t.category}</span>}
                    {sizeStr && <span className="design-template-size">{sizeStr}</span>}
                  </div>
                  <div className="design-template-actions">
                    <button type="button" onClick={() => navigate(`/adminpanel/design-editor/${t.id}${orderQuery}`)} className="btn-open" title="Открыть в редакторе">
                      <AppIcon name="edit" size="xs" /> Редактор
                    </button>
                    <button type="button" onClick={() => openEdit(t)} className="btn-edit" title="Редактировать">
                      <AppIcon name="edit" size="xs" />
                    </button>
                    <button type="button" onClick={() => handleDelete(t.id)} className="btn-delete" title="Удалить">
                      <AppIcon name="trash" size="xs" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="design-templates-empty">
            Шаблонов пока нет. Добавьте первый шаблон для редактора макетов.
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Редактировать шаблон' : 'Новый шаблон'}>
        <div className="design-template-form">
          <div className="form-row">
            <label>Название *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Например: Фотокнига Свадьба"
            />
          </div>
          <div className="form-row">
            <label>Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Краткое описание шаблона"
              rows={2}
            />
          </div>
          <div className="form-row">
            <label>Категория</label>
            <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
              <option value="">—</option>
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Превью</label>
            <div className="preview-upload">
              {form.preview_url ? (
                <div className="preview-preview">
                  <img src={form.preview_url.startsWith('http') ? form.preview_url : `${API_BASE_URL.replace(/\/api\/?$/, '')}${form.preview_url.startsWith('/') ? '' : '/'}${form.preview_url}`} alt="" />
                  <button type="button" onClick={() => setForm((p) => ({ ...p, preview_url: '' }))}>×</button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePreviewUpload}
                style={{ display: 'none' }}
              />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Загрузить изображение
              </Button>
            </div>
          </div>
          <div className="form-row form-row-inline">
            <label>
              <span>Ширина (мм)</span>
              <input
                type="number"
                min="1"
                value={form.width_mm}
                onChange={(e) => setForm((p) => ({ ...p, width_mm: e.target.value }))}
                placeholder="210"
              />
            </label>
            <label>
              <span>Высота (мм)</span>
              <input
                type="number"
                min="1"
                value={form.height_mm}
                onChange={(e) => setForm((p) => ({ ...p, height_mm: e.target.value }))}
                placeholder="297"
              />
            </label>
            <label>
              <span>Страниц</span>
              <input
                type="number"
                min="1"
                value={form.page_count}
                onChange={(e) => setForm((p) => ({ ...p, page_count: e.target.value }))}
                placeholder="1"
              />
            </label>
          </div>
          <div className="form-row form-row-inline">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Активен
            </label>
            <label>
              <span>Порядок</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </AdminPageLayout>
  );
};

export default DesignTemplatesPage;
