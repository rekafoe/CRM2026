import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { BynSymbol } from '../../components/ui/BynSymbol';
import { Alert, Button, Modal } from '../../components/common';
import {
  getDesignTemplates,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  uploadDesignTemplatePreview,
  importDesignTemplateFile,
  getUsers,
  type DesignTemplate,
  type DesignTemplateInput,
} from '../../api';
import type { UserRef } from '../../types';
import { API_BASE_URL } from '../../config/constants';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import {
  formatAuthorRoyaltyLine,
  formatBynAmount,
  formatProductBinding,
  formatTemplateSize,
  getTemplateCatalogStatus,
  parseTemplateSpec,
  resolveTemplatePreviewUrl,
  type TemplateCatalogStatus,
} from './designTemplates/designTemplateCatalogUtils';
import { DesignTemplateBindingsPanel } from './designTemplates/DesignTemplateBindingsPanel';
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
type PageTab = 'catalog' | 'bindings';

const DEFAULT_USAGE_FEE = 3;
const DEFAULT_AUTHOR_PERCENT = 10;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useCurrentUser();
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const editorPathPrefix = '/adminpanel/design-editor';
  const pageTab: PageTab = searchParams.get('tab') === 'bindings' ? 'bindings' : 'catalog';
  const bindingsProductId = searchParams.get('productId');
  const bindingsTypeId = searchParams.get('typeId');
  const highlightTemplateId = searchParams.get('templateId');
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [infoTemplate, setInfoTemplate] = useState<DesignTemplate | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
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
    author_user_id: '',
    usage_fee: String(DEFAULT_USAGE_FEE),
    author_percent: String(DEFAULT_AUTHOR_PERCENT),
  });
  const [importForm, setImportForm] = useState({
    name: '',
    description: '',
    category: '',
    productId: '',
    typeId: '',
    sizeId: '',
    sortOrder: 0,
    author_user_id: '',
    usage_fee: String(DEFAULT_USAGE_FEE),
    author_percent: String(DEFAULT_AUTHOR_PERCENT),
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

  useEffect(() => {
    void initializeDirectory();
  }, [initializeDirectory]);

  useEffect(() => {
    getUsers()
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsers([]));
  }, []);

  const setPageTab = useCallback((tab: PageTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'bindings') next.set('tab', 'bindings');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openBindingsForTemplate = useCallback((t: DesignTemplate) => {
    const parsed = parseTemplateSpec(t);
    const next = new URLSearchParams();
    next.set('tab', 'bindings');
    if (parsed.productId != null) next.set('productId', String(parsed.productId));
    if (parsed.typeId != null) next.set('typeId', String(parsed.typeId));
    next.set('templateId', String(t.id));
    setSearchParams(next);
  }, [setSearchParams]);

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
    if (authorFilter === 'mine' && currentUser?.id) {
      list = list.filter((t) => t.author_user_id === currentUser.id);
    } else if (authorFilter !== 'all') {
      const aid = Number(authorFilter);
      if (Number.isFinite(aid)) {
        list = list.filter((t) => t.author_user_id === aid);
      }
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
  }, [templates, categoryFilter, statusFilter, authorFilter, searchQuery, sortKey, currentUser?.id]);

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
      author_user_id: currentUser?.id != null ? String(currentUser.id) : '',
      usage_fee: String(DEFAULT_USAGE_FEE),
      author_percent: String(DEFAULT_AUTHOR_PERCENT),
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
      author_user_id: currentUser?.id != null ? String(currentUser.id) : '',
      usage_fee: String(DEFAULT_USAGE_FEE),
      author_percent: String(DEFAULT_AUTHOR_PERCENT),
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
      author_user_id: t.author_user_id != null ? String(t.author_user_id) : '',
      usage_fee: t.usage_fee != null ? String(t.usage_fee) : '',
      author_percent: t.author_percent != null ? String(t.author_percent) : '',
    });
    setModalOpen(true);
  };

  const royaltyPreview = useMemo(() => {
    const fee = parseFloat(form.usage_fee);
    const pct = parseFloat(form.author_percent);
    if (!Number.isFinite(fee) || !Number.isFinite(pct) || fee <= 0 || pct <= 0) return null;
    const payout = Math.round((fee * pct / 100) * 100) / 100;
    return { fee, pct, payout };
  }, [form.usage_fee, form.author_percent]);

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

      const authorUserId = form.author_user_id.trim() ? parseInt(form.author_user_id, 10) : null;
      const usageFee = form.usage_fee.trim() ? parseFloat(form.usage_fee) : 0;
      const authorPercent = form.author_percent.trim() ? parseFloat(form.author_percent) : 0;

      const payload: DesignTemplateInput = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        preview_url: form.preview_url || undefined,
        spec: Object.keys(spec).length ? spec : undefined,
        is_active: form.is_active,
        sort_order: form.sort_order,
        author_user_id: Number.isFinite(authorUserId) ? authorUserId : null,
        usage_fee: Number.isFinite(usageFee) ? usageFee : 0,
        author_percent: Number.isFinite(authorPercent) ? authorPercent : 0,
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
        author_user_id: currentUser?.id ?? t.author_user_id ?? null,
        usage_fee: t.usage_fee ?? 0,
        author_percent: t.author_percent ?? 0,
      });
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось создать копию');
    }
  }, [loadTemplates, currentUser?.id]);

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
        author_user_id: importForm.author_user_id.trim()
          ? parseInt(importForm.author_user_id, 10)
          : currentUser?.id,
        usage_fee: importForm.usage_fee.trim() ? parseFloat(importForm.usage_fee) : undefined,
        author_percent: importForm.author_percent.trim() ? parseFloat(importForm.author_percent) : undefined,
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
        <div className="design-templates-tabs">
          <button
            type="button"
            className={`design-templates-tab${pageTab === 'catalog' ? ' design-templates-tab--active' : ''}`}
            onClick={() => setPageTab('catalog')}
          >
            <AppIcon name="layers" size="xs" /> Каталог
          </button>
          <button
            type="button"
            className={`design-templates-tab${pageTab === 'bindings' ? ' design-templates-tab--active' : ''}`}
            onClick={() => setPageTab('bindings')}
          >
            <AppIcon name="link" size="xs" /> Привязки к продуктам
          </button>
        </div>

        {pageTab === 'bindings' ? (
          <DesignTemplateBindingsPanel
            initialProductId={bindingsProductId ? Number(bindingsProductId) : undefined}
            initialTypeId={bindingsTypeId ? Number(bindingsTypeId) : undefined}
            highlightTemplateId={highlightTemplateId ? Number(highlightTemplateId) : undefined}
          />
        ) : (
          <>
        <p className="design-templates-lead">
          Master-шаблоны для сайта и редактора. Основной вход — <strong>Импорт SVG</strong> (конвенция слоёв в{' '}
          <code>docs/design-template-importer.md</code>). Справка: <code>docs/design-templates-catalog.md</code>.
          Внутренняя плата автора — в <strong>бел. руб.</strong>, не в цене клиента.
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
            <label>Автор:</label>
            <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
              <option value="all">Все</option>
              {currentUser?.id != null && (
                <option value="mine">Мои макеты</option>
              )}
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.name}</option>
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
                    {(t.author_name || t.author_user_id) && (
                      <span className="design-template-author">
                        <AppIcon name="user" size="xs" />
                        {t.author_name ?? `user #${t.author_user_id}`}
                      </span>
                    )}
                    {formatAuthorRoyaltyLine(t) && (
                      <span className="design-template-royalty" title="Внутренняя база для ЗП автора, не в цене клиента">
                        <BynSymbol className="design-template-royalty__sign" />
                        {formatAuthorRoyaltyLine(t)}
                        <span className="design-template-royalty-hint"> · не в цене клиента</span>
                      </span>
                    )}
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
                    {(parsed.productId != null || parsed.typeId != null) && (
                      <button type="button" onClick={() => openBindingsForTemplate(t)} className="btn-meta" title="Привязки к продукту">
                        <AppIcon name="link" size="xs" />
                      </button>
                    )}
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
          </>
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
          <div className="form-row form-row-inline">
            <label>
              <span><AppIcon name="user" size="xs" /> Автор</span>
              <select
                value={form.author_user_id}
                onChange={(e) => setForm((p) => ({ ...p, author_user_id: e.target.value }))}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Плата за макет (бел. руб./ед.)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.usage_fee}
                onChange={(e) => setForm((p) => ({ ...p, usage_fee: e.target.value }))}
              />
            </label>
            <label>
              <span>% автору</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.author_percent}
                onChange={(e) => setForm((p) => ({ ...p, author_percent: e.target.value }))}
              />
            </label>
          </div>
          {royaltyPreview && (
            <p className="royalty-preview">
              <BynSymbol />
              {formatBynAmount(royaltyPreview.fee)} × {royaltyPreview.pct}% → {formatBynAmount(royaltyPreview.payout)}/ед.
              <span className="design-template-royalty-hint"> (не в цене клиента)</span>
            </p>
          )}
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
          <div className="form-row form-row-inline">
            <label>
              <span>Автор</span>
              <select
                value={importForm.author_user_id}
                onChange={(e) => setImportForm((p) => ({ ...p, author_user_id: e.target.value }))}
              >
                <option value="">Текущий пользователь</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Плата (бел. руб./ед.)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={importForm.usage_fee}
                onChange={(e) => setImportForm((p) => ({ ...p, usage_fee: e.target.value }))}
              />
            </label>
            <label>
              <span>% автору</span>
              <input
                type="number"
                min="0"
                max="100"
                value={importForm.author_percent}
                onChange={(e) => setImportForm((p) => ({ ...p, author_percent: e.target.value }))}
              />
            </label>
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
            {infoTemplate.author_name && (
              <p><strong>Автор:</strong> {infoTemplate.author_name}</p>
            )}
            {formatAuthorRoyaltyLine(infoTemplate) && (
              <p><strong>ЗП автора:</strong> {formatAuthorRoyaltyLine(infoTemplate)} (внутр., не клиенту)</p>
            )}
            {infoParsed.importWarnings.length > 0 && (
              <div className="design-template-import-warnings">
                <strong>Предупреждения импорта:</strong>
                <ul>{infoParsed.importWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => { setInfoTemplate(null); openEdit(infoTemplate); }}>Редактировать карточку</Button>
              {(infoParsed.productId != null || infoParsed.typeId != null) && (
                <Button variant="secondary" onClick={() => { setInfoTemplate(null); openBindingsForTemplate(infoTemplate); }}>
                  Привязки к продукту
                </Button>
              )}
              <Button onClick={() => navigate(`${editorPathPrefix}/${infoTemplate.id}`)}>Открыть редактор</Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminPageLayout>
  );
};

export default DesignTemplatesPage;
