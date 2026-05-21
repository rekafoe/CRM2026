import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button, Modal } from '../../components/common';
import {
  getDesignTemplates,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  uploadDesignTemplatePreview,
  importDesignTemplateFile,
  type DesignTemplate,
  type DesignTemplateInput,
} from '../../api';
import { API_BASE_URL } from '../../config/constants';
import {
  formatProductBinding,
  formatTemplateSize,
  getTemplateCatalogStatus,
  parseTemplateSpec,
  resolveTemplatePreviewUrl,
  type TemplateCatalogStatus,
} from './designTemplates/designTemplateCatalogUtils';
import '../../styles/admin-page-layout.css';
import './DesignTemplatesPage.css';

const DEFAULT_CATEGORIES = ['Свадьба', 'Дети', 'Love story', 'Выпускной', 'Семья', 'Праздники', 'Разное'];

const STATUS_LABELS: Record<TemplateCatalogStatus, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  draft: 'Draft',
};

type StatusFilter = 'all' | TemplateCatalogStatus;
type SortKey = 'sort_order' | 'name' | 'updated';

function mergeSpecOnSave(
  existingSpec: Record<string, unknown> | null,
  patch: { width_mm?: number; height_mm?: number; page_count?: number; productId?: number; typeId?: number; sizeId?: string },
): Record<string, unknown> {
  const base = existingSpec ? { ...existingSpec } : {};
  if (patch.width_mm != null) base.width_mm = patch.width_mm;
  if (patch.height_mm != null) base.height_mm = patch.height_mm;
  if (patch.page_count != null) base.page_count = patch.page_count;
  if (patch.productId != null) base.productId = patch.productId;
  else delete base.productId;
  if (patch.typeId != null) base.typeId = patch.typeId;
  else delete base.typeId;
  if (patch.sizeId) base.sizeId = patch.sizeId;
  else delete base.sizeId;
  return base;
}

export const DesignTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const editorPathPrefix = '/adminpanel/design-editor';
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [infoTemplate, setInfoTemplate] = useState<DesignTemplate | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('sort_order');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const importSourceFileInputRef = useRef<HTMLInputElement>(null);
  const [existingSpec, setExistingSpec] = useState<Record<string, unknown> | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    preview_url: '',
    width_mm: '',
    height_mm: '',
    page_count: '',
    productId: '',
    typeId: '',
    sizeId: '',
    is_active: true,
    sort_order: 0,
  });
  const [importForm, setImportForm] = useState({
    name: '',
    description: '',
    category: '',
    productId: '',
    typeId: '',
    sizeId: '',
    sortOrder: 0,
    sourceFile: null as File | null,
    file: null as File | null,
  });
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

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

  const categories = useMemo(
    () => Array.from(new Set([...DEFAULT_CATEGORIES, ...templates.map((t) => t.category).filter(Boolean) as string[]])),
    [templates],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = templates;
    if (categoryFilter) {
      list = list.filter((t) => (t.category ?? '') === categoryFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((t) => getTemplateCatalogStatus(t) === statusFilter);
    }
    if (q) {
      list = list.filter((t) => {
        const parsed = parseTemplateSpec(t);
        const haystack = [
          t.name,
          t.description ?? '',
          t.category ?? '',
          String(t.id),
          parsed.productId != null ? String(parsed.productId) : '',
          parsed.sizeId ?? '',
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru');
      if (sortKey === 'updated') {
        return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''));
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ru');
    });
    return sorted;
  }, [templates, categoryFilter, statusFilter, searchQuery, sortKey]);

  const counts = useMemo(() => {
    const c = { all: templates.length, active: 0, inactive: 0, draft: 0 };
    templates.forEach((t) => {
      c[getTemplateCatalogStatus(t)] += 1;
    });
    return c;
  }, [templates]);

  const openCreate = () => {
    setEditingId(null);
    setExistingSpec(null);
    setForm({
      name: '',
      description: '',
      category: '',
      preview_url: '',
      width_mm: '',
      height_mm: '',
      page_count: '',
      productId: '',
      typeId: '',
      sizeId: '',
      is_active: true,
      sort_order: templates.length,
    });
    setModalOpen(true);
  };

  const openImport = () => {
    setImportWarnings([]);
    setImportForm({
      name: '',
      description: '',
      category: '',
      productId: '',
      typeId: '',
      sizeId: '',
      sortOrder: templates.length,
      sourceFile: null,
      file: null,
    });
    setImportModalOpen(true);
  };

  const openEdit = (t: DesignTemplate) => {
    const parsed = parseTemplateSpec(t);
    let spec: Record<string, unknown> = {};
    try {
      if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
    } catch {
      spec = {};
    }
    setExistingSpec(spec);
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? '',
      category: t.category ?? '',
      preview_url: t.preview_url ?? '',
      width_mm: parsed.width_mm != null ? String(parsed.width_mm) : '',
      height_mm: parsed.height_mm != null ? String(parsed.height_mm) : '',
      page_count: parsed.page_count != null ? String(parsed.page_count) : '',
      productId: parsed.productId != null ? String(parsed.productId) : '',
      typeId: parsed.typeId != null ? String(parsed.typeId) : '',
      sizeId: parsed.sizeId ?? '',
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
    const width_mm = form.width_mm ? parseFloat(form.width_mm) : undefined;
    const height_mm = form.height_mm ? parseFloat(form.height_mm) : undefined;
    const page_count = form.page_count ? parseInt(form.page_count, 10) : undefined;
    const productId = form.productId.trim() ? parseInt(form.productId, 10) : undefined;
    const typeId = form.typeId.trim() ? parseInt(form.typeId, 10) : undefined;
    const sizeId = form.sizeId.trim() || undefined;

    try {
      setError(null);
      const spec = mergeSpecOnSave(existingSpec, {
        width_mm: Number.isFinite(width_mm) ? width_mm : undefined,
        height_mm: Number.isFinite(height_mm) ? height_mm : undefined,
        page_count: Number.isFinite(page_count) ? page_count : undefined,
        productId: Number.isFinite(productId) ? productId : undefined,
        typeId: Number.isFinite(typeId) ? typeId : undefined,
        sizeId,
      });

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
  }, [form, editingId, existingSpec, loadTemplates]);

  const handleToggleActive = useCallback(async (t: DesignTemplate) => {
    try {
      setError(null);
      await updateDesignTemplate(t.id, { is_active: t.is_active !== 1 });
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус');
    }
  }, [loadTemplates]);

  const handleDuplicate = useCallback(async (t: DesignTemplate) => {
    let spec: Record<string, unknown> = {};
    try {
      if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : { ...(t.spec as object) };
    } catch {
      return;
    }
    const designState = spec.designState as Record<string, unknown> | undefined;
    if (designState && typeof designState === 'object') {
      spec.designState = { ...designState, templateId: null };
    }
    try {
      setError(null);
      await createDesignTemplate({
        name: `${t.name} (копия)`,
        description: t.description ?? undefined,
        category: t.category ?? undefined,
        preview_url: t.preview_url ?? undefined,
        spec,
        is_active: false,
        sort_order: (t.sort_order ?? 0) + 1,
      });
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось создать копию');
    }
  }, [loadTemplates]);

  const handleImport = useCallback(async () => {
    if (!importForm.file && !importForm.sourceFile) {
      setError('Выберите исходник или SVG-файл для импорта');
      return;
    }
    if (!importForm.name.trim()) {
      setError('Укажите название импортируемого шаблона');
      return;
    }
    try {
      setImporting(true);
      setError(null);
      setImportWarnings([]);
      const res = await importDesignTemplateFile({
        file: importForm.file,
        sourceFile: importForm.sourceFile,
        name: importForm.name.trim(),
        description: importForm.description.trim() || undefined,
        category: importForm.category.trim() || undefined,
        productId: importForm.productId.trim() || undefined,
        typeId: importForm.typeId.trim() || undefined,
        sizeId: importForm.sizeId.trim() || undefined,
        sortOrder: importForm.sortOrder,
      });
      setImportWarnings(res.data.warnings ?? []);
      await loadTemplates();
      if ((res.data.warnings ?? []).length === 0) setImportModalOpen(false);
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string; warnings?: string[] } } }).response;
      setImportWarnings(response?.data?.warnings ?? []);
      setError(response?.data?.message ?? (err instanceof Error ? err.message : 'Ошибка импорта шаблона'));
    } finally {
      setImporting(false);
    }
  }, [importForm, loadTemplates]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Удалить шаблон?')) return;
    try {
      await deleteDesignTemplate(id);
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }, [loadTemplates]);

  const infoParsed = infoTemplate ? parseTemplateSpec(infoTemplate) : null;

  return (
    <AdminPageLayout
      title="Каталог шаблонов дизайна"
      icon={<AppIcon name="layers" size="sm" />}
      onBack={() => navigate('/adminpanel')}
    >
      {error && <Alert type="error">{error}</Alert>}

      <div className="design-templates-page">
        <p className="design-templates-lead">
          Master-шаблоны для сайта и редактора. Основной вход — <strong>Импорт SVG</strong> (конвенция слоёв в{' '}
          <code>docs/design-template-importer.md</code>). Справка по каталогу: <code>docs/design-templates-catalog.md</code>.
        </p>

        <div className="design-templates-toolbar">
          <Button onClick={openImport}>
            <AppIcon name="download" size="xs" /> Импорт SVG
          </Button>
          <Button variant="secondary" onClick={openCreate}>
            <AppIcon name="plus" size="xs" /> Вручную
          </Button>
          <input
            type="search"
            className="design-templates-search"
            placeholder="Поиск по названию, ID, продукту…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="design-templates-filter">
            <label>Статус:</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">Все ({counts.all})</option>
              <option value="active">Активные ({counts.active})</option>
              <option value="inactive">Неактивные ({counts.inactive})</option>
              <option value="draft">Draft ({counts.draft})</option>
            </select>
          </div>
          <div className="design-templates-filter">
            <label>Категория:</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Все</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="design-templates-filter">
            <label>Сортировка:</label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="sort_order">Порядок</option>
              <option value="name">Название</option>
              <option value="updated">Обновление</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="design-templates-loading">Загрузка...</div>
        ) : (
          <div className="design-templates-grid">
            {filtered.map((t) => {
              const parsed = parseTemplateSpec(t);
              const status = getTemplateCatalogStatus(t);
              const sizeStr = formatTemplateSize(parsed);
              const binding = formatProductBinding(parsed);
              const previewSrc = resolveTemplatePreviewUrl(t.preview_url, API_BASE_URL);
              return (
                <div key={t.id} className={`design-template-card design-template-card--${status}`}>
                  <div className="design-template-preview">
                    {previewSrc ? (
                      <img src={previewSrc} alt={t.name} />
                    ) : (
                      <div className="design-template-placeholder">
                        <AppIcon name="image" size="lg" />
                      </div>
                    )}
                    <span className={`design-template-status design-template-status--${status}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  <div className="design-template-info">
                    <h4>
                      <span className="design-template-id">#{t.id}</span> {t.name}
                    </h4>
                    {t.category && <span className="design-template-category">{t.category}</span>}
                    {sizeStr && <span className="design-template-size">{sizeStr}</span>}
                    {binding && <span className="design-template-binding">{binding}</span>}
                    {parsed.importWarnings.length > 0 && (
                      <span className="design-template-warnings-badge" title={parsed.importWarnings.join('\n')}>
                        {parsed.importWarnings.length} предупр.
                      </span>
                    )}
                  </div>
                  <div className="design-template-actions">
                    <button type="button" onClick={() => navigate(`${editorPathPrefix}/${t.id}`)} className="btn-open" title="Master-редактор">
                      <AppIcon name="edit" size="xs" /> Шаблон
                    </button>
                    <button type="button" onClick={() => navigate(`/adminpanel/public-design-editor-preview/${t.id}`)} className="btn-open" title="Клиентский sandbox">
                      <AppIcon name="image" size="xs" /> Клиент
                    </button>
                    <button type="button" onClick={() => setInfoTemplate(t)} className="btn-meta" title="Импорт и метаданные">
                      <AppIcon name="info" size="xs" />
                    </button>
                    <button type="button" onClick={() => openEdit(t)} className="btn-edit" title="Карточка">
                      <AppIcon name="edit" size="xs" />
                    </button>
                    <button type="button" onClick={() => void handleDuplicate(t)} className="btn-meta" title="Копия">
                      <AppIcon name="copy" size="xs" />
                    </button>
                    <label className="design-template-active-toggle" title="Активен на сайте">
                      <input
                        type="checkbox"
                        checked={t.is_active === 1}
                        disabled={!parsed.hasDesignState}
                        onChange={() => void handleToggleActive(t)}
                      />
                    </label>
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
            {templates.length === 0
              ? 'Шаблонов пока нет. Начните с импорта SVG.'
              : 'Нет шаблонов по выбранным фильтрам.'}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Карточка шаблона' : 'Новый шаблон (вручную)'}>
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
          <div className="form-row form-row-inline design-template-product-bind">
            <label>
              <span>Product ID</span>
              <input value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} placeholder="22" />
            </label>
            <label>
              <span>Type ID</span>
              <input value={form.typeId} onChange={(e) => setForm((p) => ({ ...p, typeId: e.target.value }))} placeholder="1" />
            </label>
            <label>
              <span>Size ID</span>
              <input value={form.sizeId} onChange={(e) => setForm((p) => ({ ...p, sizeId: e.target.value }))} placeholder="10x15" />
            </label>
          </div>
          <p className="form-hint">
            Для public API. Основная привязка — в карточке продукта по каждому размеру подтипа; sizeId должен совпадать с <code>sizes[].id</code>.
          </p>
          <div className="form-row">
            <label>Превью (фон в редакторе)</label>
            <div className="preview-upload">
              {form.preview_url ? (
                <div className="preview-preview">
                  <img src={resolveTemplatePreviewUrl(form.preview_url, API_BASE_URL) ?? ''} alt="" />
                  <button type="button" onClick={() => setForm((p) => ({ ...p, preview_url: '' }))}>×</button>
                </div>
              ) : null}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePreviewUpload} className="visually-hidden-file-input" />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Загрузить изображение</Button>
            </div>
          </div>
          <div className="form-row form-row-inline">
            <label>
              <span>Ширина (мм)</span>
              <input type="number" min="1" value={form.width_mm} onChange={(e) => setForm((p) => ({ ...p, width_mm: e.target.value }))} />
            </label>
            <label>
              <span>Высота (мм)</span>
              <input type="number" min="1" value={form.height_mm} onChange={(e) => setForm((p) => ({ ...p, height_mm: e.target.value }))} />
            </label>
            <label>
              <span>Страниц</span>
              <input type="number" min="1" value={form.page_count} onChange={(e) => setForm((p) => ({ ...p, page_count: e.target.value }))} />
            </label>
          </div>
          <div className="form-row form-row-inline">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
              Активен
            </label>
            <label>
              <span>Порядок</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))} />
            </label>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} title="Импорт шаблона (SVG)">
        <div className="design-template-form">
          <div className="design-template-import-intro">
            <strong>Основной способ:</strong>
            <span>SVG или ZIP со страницами. Исходник AI/CDR — опционально. Без SVG шаблон сохранится как draft (неактивен).</span>
          </div>
          <div className="form-row">
            <label>Исходник для CRM</label>
            <div className="preview-upload">
              <input ref={importSourceFileInputRef} type="file" accept=".ai,.cdr,.indd,.indt,.pdf,.svg" onChange={(e) => setImportForm((p) => ({ ...p, sourceFile: e.target.files?.[0] ?? null }))} className="visually-hidden-file-input" />
              <Button variant="secondary" onClick={() => importSourceFileInputRef.current?.click()}>Выбрать исходник</Button>
              <p className="form-hint">{importForm.sourceFile ? importForm.sourceFile.name : 'AI, CDR, PDF…'}</p>
            </div>
          </div>
          <div className="form-row">
            <label>SVG/ZIP для редактора *</label>
            <div className="preview-upload">
              <input ref={importFileInputRef} type="file" accept=".svg,.zip" onChange={(e) => setImportForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))} className="visually-hidden-file-input" />
              <Button variant="secondary" onClick={() => importFileInputRef.current?.click()}>Выбрать SVG/ZIP</Button>
              <p className="form-hint">{importForm.file ? importForm.file.name : 'photo_*, text_*, trim/bleed/safe'}</p>
            </div>
          </div>
          <div className="form-row">
            <label>Название *</label>
            <input type="text" value={importForm.name} onChange={(e) => setImportForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="form-row">
            <label>Описание</label>
            <textarea value={importForm.description} onChange={(e) => setImportForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="form-row">
            <label>Категория</label>
            <select value={importForm.category} onChange={(e) => setImportForm((p) => ({ ...p, category: e.target.value }))}>
              <option value="">—</option>
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-inline design-template-product-bind">
            <label><span>Product ID</span><input value={importForm.productId} onChange={(e) => setImportForm((p) => ({ ...p, productId: e.target.value }))} /></label>
            <label><span>Type ID</span><input value={importForm.typeId} onChange={(e) => setImportForm((p) => ({ ...p, typeId: e.target.value }))} /></label>
            <label>
              <span>Size ID *</span>
              <input value={importForm.sizeId} onChange={(e) => setImportForm((p) => ({ ...p, sizeId: e.target.value }))} placeholder="id размера в продукте" />
            </label>
          </div>
          <p className="form-hint">При product + type без sizeId шаблон не попадёт в привязку размера (только каталог).</p>
          {importWarnings.length > 0 && (
            <div className="design-template-import-warnings">
              <strong>Предупреждения:</strong>
              <ul>{importWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setImportModalOpen(false)}>Закрыть</Button>
            <Button onClick={handleImport} disabled={importing}>{importing ? 'Импорт…' : 'Импортировать'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={infoTemplate !== null} onClose={() => setInfoTemplate(null)} title={infoTemplate ? `Шаблон #${infoTemplate.id}` : ''}>
        {infoTemplate && infoParsed && (
          <div className="design-template-info-panel">
            <p><strong>Статус:</strong> {STATUS_LABELS[getTemplateCatalogStatus(infoTemplate)]}</p>
            <p><strong>designState:</strong> {infoParsed.hasDesignState ? 'есть' : 'нет'}</p>
            {infoParsed.importerVersion != null && <p><strong>Importer v:</strong> {infoParsed.importerVersion}</p>}
            {formatTemplateSize(infoParsed) && <p><strong>Размер:</strong> {formatTemplateSize(infoParsed)}</p>}
            {formatProductBinding(infoParsed) && <p><strong>Привязка:</strong> {formatProductBinding(infoParsed)}</p>}
            {infoParsed.importWarnings.length > 0 && (
              <div className="design-template-import-warnings">
                <strong>Предупреждения импорта:</strong>
                <ul>{infoParsed.importWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => { setInfoTemplate(null); openEdit(infoTemplate); }}>Редактировать карточку</Button>
              <Button onClick={() => navigate(`${editorPathPrefix}/${infoTemplate.id}`)}>Открыть редактор</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminPageLayout>
  );
};

export default DesignTemplatesPage;
