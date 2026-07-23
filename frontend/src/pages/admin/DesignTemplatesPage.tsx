import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { BynSymbol } from '../../components/ui/BynSymbol';
import { Alert, Modal } from '../../components/common';
import {
  getDesignTemplates,
  getDesignTemplateCategories,
  createDesignTemplateCategory,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  uploadDesignTemplatePreview,
  importDesignTemplateFile,
  getUsers,
  type DesignTemplate,
  type DesignTemplateCategory,
  type DesignTemplateInput,
} from '../../api';
import type { UserRef } from '../../types';
import { API_BASE_URL } from '../../config/constants';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { openSiteSandboxForDesignTemplate } from '../../features/designTemplates/openSiteSandboxForDesignTemplate';
import {
  familyCatalogStatus,
  formatAuthorRoyaltyLine,
  formatBynAmount,
  formatDesignCodeLabel,
  formatTemplateSize,
  getTemplateCatalogStatus,
  groupTemplatesIntoFamilies,
  parseDesignTemplateImportError,
  parseTemplateSpec,
  resolveDesignCode,
  resolveFamilyPreviewUrl,
  resolveTemplatePreviewUrl,
  type DesignTemplateFamily,
  type TemplateCatalogStatus,
} from './designTemplates/designTemplateCatalogUtils';
import {
  buildEmptyDesignState,
  syncDesignStateDimensions,
} from './designEditor/designEditorState';
import type { DesignState } from './designEditor/types';
import { DesignTemplateBindingsPanel } from './designTemplates/DesignTemplateBindingsPanel';
import { DesignTemplateCategoriesModal } from './designTemplates/DesignTemplateCategoriesModal';
import { DesignTemplateCategoryField } from './designTemplates/DesignTemplateCategoryField';
import { DesignTemplateProductBindField } from './designTemplates/DesignTemplateProductBindField';
import { DesignTemplateFamilyVariantRows } from './designTemplates/DesignTemplateFamilyVariantRows';
import { DesignTemplateReimportModal } from './designTemplates/DesignTemplateReimportModal';
import { DesignTemplateUsagePanel } from './designTemplates/DesignTemplateUsagePanel';
import { buildCategorySections, UNCATEGORIZED_KEY } from './designTemplates/designTemplateCategoryUtils';
import { useDesignTemplateBindingLabels } from './designTemplates/useDesignTemplateBindingLabels';
import '../../styles/admin-page-layout.css';
import '../../components/admin/ProductManagement.css';
import './DesignTemplatesPage.css';

const STATUS_LABELS: Record<TemplateCatalogStatus, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  draft: 'Draft',
};

type StatusFilter = 'all' | TemplateCatalogStatus;
type BindingFilter = 'all' | 'linked' | 'unlinked';
type SortKey = 'sort_order' | 'design_code' | 'updated';
type PageTab = 'catalog' | 'bindings' | 'analytics';

const DEFAULT_USAGE_FEE = 4;
const DEFAULT_AUTHOR_PERCENT = 10;
const CATEGORY_COLLAPSE_STORAGE_KEY = 'design-templates-category-collapsed';

function loadCollapsedSectionKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(CATEGORY_COLLAPSE_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveCollapsedSectionKeys(keys: Set<string>) {
  try {
    localStorage.setItem(CATEGORY_COLLAPSE_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

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

  const existingDesignState = base.designState as DesignState | undefined;
  if (existingDesignState && typeof existingDesignState === 'object') {
    base.designState = syncDesignStateDimensions(existingDesignState, {
      pageWidth: patch.width_mm,
      pageHeight: patch.height_mm,
      pageCount: patch.page_count,
    });
  } else if (
    patch.width_mm != null
    || patch.height_mm != null
    || patch.page_count != null
  ) {
    base.designState = buildEmptyDesignState({
      pageWidth: patch.width_mm,
      pageHeight: patch.height_mm,
      pageCount: patch.page_count,
    });
  }

  return base;
}

export const DesignTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useCurrentUser();
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const tabParam = searchParams.get('tab');
  const pageTab: PageTab =
    tabParam === 'bindings' ? 'bindings' : tabParam === 'analytics' ? 'analytics' : 'catalog';
  const bindingsProductId = searchParams.get('productId');
  const bindingsTypeId = searchParams.get('typeId');
  const highlightTemplateId = searchParams.get('templateId');
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [categoryRegistry, setCategoryRegistry] = useState<DesignTemplateCategory[]>([]);
  const [categoriesModalOpen, setCategoriesModalOpen] = useState(false);
  const [reimportTemplate, setReimportTemplate] = useState<DesignTemplate | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(loadCollapsedSectionKeys);
  const [helpOpen, setHelpOpen] = useState(false);
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
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('sort_order');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sitePreviewFileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const importSourceFileInputRef = useRef<HTMLInputElement>(null);
  const [existingSpec, setExistingSpec] = useState<Record<string, unknown> | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category_id: null as number | null,
    preview_url: '',
    site_preview_url: '',
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
    design_code: '',
    description: '',
    category_id: null as number | null,
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
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResultCode, setImportResultCode] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await getDesignTemplateCategories();
      setCategoryRegistry(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCategoryRegistry([]);
    }
  }, []);

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

  const reloadCatalog = useCallback(async () => {
    await Promise.all([loadTemplates(), loadCategories()]);
  }, [loadTemplates, loadCategories]);

  useEffect(() => {
    void reloadCatalog();
  }, [reloadCatalog]);

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
    if (tab === 'catalog') next.delete('tab');
    else next.set('tab', tab);
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

  const handleCreateCategoryInline = useCallback(async (name: string) => {
    try {
      const res = await createDesignTemplateCategory(name);
      await loadCategories();
      return res.data.id;
    } catch {
      return null;
    }
  }, [loadCategories]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = templates;
    if (categoryFilter === UNCATEGORIZED_KEY) {
      list = list.filter((t) => t.category_id == null && !t.category?.trim());
    } else if (categoryFilter) {
      const filterId = Number(categoryFilter);
      if (Number.isFinite(filterId) && filterId > 0) {
        list = list.filter((t) => t.category_id === filterId);
      } else {
        list = list.filter((t) => (t.category ?? '') === categoryFilter);
      }
    }
    if (statusFilter !== 'all') {
      list = list.filter((t) => getTemplateCatalogStatus(t) === statusFilter);
    }
    if (bindingFilter === 'linked') {
      list = list.filter((t) => (t.subtype_link_count ?? 0) > 0);
    } else if (bindingFilter === 'unlinked') {
      list = list.filter((t) => (t.subtype_link_count ?? 0) === 0);
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
          t.design_code ?? '',
          t.name,
          t.description ?? '',
          t.category ?? '',
          String(t.id),
          parsed.productId != null ? String(parsed.productId) : '',
          parsed.sizeId ?? '',
          parsed.width_mm != null && parsed.height_mm != null
            ? `${parsed.width_mm}x${parsed.height_mm}`
            : '',
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === 'design_code') {
        return (a.design_code ?? '').localeCompare(b.design_code ?? '', 'ru')
          || a.id - b.id;
      }
      if (sortKey === 'updated') {
        return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''));
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
        || (a.design_code ?? '').localeCompare(b.design_code ?? '', 'ru')
        || a.id - b.id;
    });
    return sorted;
  }, [templates, categoryFilter, statusFilter, bindingFilter, authorFilter, searchQuery, sortKey, currentUser?.id]);

  const categorySections = useMemo(() => {
    const sections = buildCategorySections(filtered, categoryRegistry);
    if (!categoryFilter) return sections;
    return sections.filter((s) => s.key === categoryFilter);
  }, [filtered, categoryRegistry, categoryFilter]);

  const familyCount = useMemo(
    () => groupTemplatesIntoFamilies(filtered).length,
    [filtered],
  );

  const toggleSectionCollapsed = useCallback((sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      saveCollapsedSectionKeys(next);
      return next;
    });
  }, []);

  const expandAllSections = useCallback(() => {
    setCollapsedSections(() => {
      saveCollapsedSectionKeys(new Set());
      return new Set();
    });
  }, []);

  const collapseAllSections = useCallback(() => {
    const keys = new Set(categorySections.map((s) => s.key));
    setCollapsedSections(keys);
    saveCollapsedSectionKeys(keys);
  }, [categorySections]);

  const filtersActive =
    Boolean(categoryFilter || searchQuery.trim() || statusFilter !== 'all' || bindingFilter !== 'all' || authorFilter !== 'all');

  const { formatBinding } = useDesignTemplateBindingLabels(templates);

  const counts = useMemo(() => {
    const c = { all: templates.length, active: 0, inactive: 0, draft: 0 };
    templates.forEach((t) => {
      c[getTemplateCatalogStatus(t)] += 1;
    });
    return c;
  }, [templates]);

  const bindingCounts = useMemo(() => {
    let linked = 0;
    let unlinked = 0;
    templates.forEach((t) => {
      if ((t.subtype_link_count ?? 0) > 0) linked += 1;
      else unlinked += 1;
    });
    return { linked, unlinked };
  }, [templates]);

  const defaultCategoryId = categoryRegistry[0]?.id ?? null;

  const openCreate = () => {
    setEditingId(null);
    setExistingSpec(null);
    setForm({
      name: '',
      description: '',
      category_id: defaultCategoryId,
      preview_url: '',
      site_preview_url: '',
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
    setImportErrors([]);
    setImportResultCode(null);
    setImportForm({
      name: '',
      design_code: '',
      description: '',
      category_id: null,
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

  const openImportIntoFamily = useCallback((family: DesignTemplateFamily) => {
    const code = family.design_code ?? resolveDesignCode(family.primary);
    setImportWarnings([]);
    setImportErrors([]);
    setImportResultCode(null);
    setImportForm({
      name: '',
      design_code: code ?? '',
      description: '',
      category_id: family.primary.category_id ?? defaultCategoryId,
      productId: '',
      typeId: '',
      sizeId: '',
      sortOrder: templates.length,
      author_user_id: family.primary.author_user_id != null
        ? String(family.primary.author_user_id)
        : (currentUser?.id != null ? String(currentUser.id) : ''),
      usage_fee: family.primary.usage_fee != null ? String(family.primary.usage_fee) : String(DEFAULT_USAGE_FEE),
      author_percent: family.primary.author_percent != null
        ? String(family.primary.author_percent)
        : String(DEFAULT_AUTHOR_PERCENT),
      sourceFile: null,
      file: null,
    });
    setImportModalOpen(true);
  }, [currentUser?.id, defaultCategoryId, templates.length]);

  const openEdit = (t: DesignTemplate) => {
    const parsed = parseTemplateSpec(t);
    let spec: Record<string, unknown> = {};
    try {
      if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
    } catch {
      spec = {};
    }
    const code = resolveDesignCode(t);
    const familySitePreview = code
      ? templates.find((v) => resolveDesignCode(v) === code && String(v.site_preview_url ?? '').trim())?.site_preview_url
      : null;
    setExistingSpec(spec);
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? '',
      category_id: t.category_id ?? null,
      preview_url: t.preview_url ?? '',
      site_preview_url: (t.site_preview_url || familySitePreview) ?? '',
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

  const handleSitePreviewUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadDesignTemplatePreview(file);
      const url = res.data?.url ?? `${API_BASE_URL}/uploads/${res.data?.filename}`;
      setForm((prev) => ({ ...prev, site_preview_url: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки превью для сайта');
    }
    e.target.value = '';
  }, []);

  const handleSave = useCallback(async () => {
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
      const trimmedName = form.name.trim();

      const payload: DesignTemplateInput = {
        description: form.description.trim() || undefined,
        category_id: form.category_id,
        preview_url: form.preview_url || null,
        site_preview_url: form.site_preview_url || null,
        spec: Object.keys(spec).length ? spec : undefined,
        is_active: form.is_active,
        sort_order: form.sort_order,
        author_user_id: Number.isFinite(authorUserId) ? authorUserId : null,
        usage_fee: Number.isFinite(usageFee) ? usageFee : 0,
        author_percent: Number.isFinite(authorPercent) ? authorPercent : 0,
      };
      if (trimmedName) payload.name = trimmedName;
      if (editingId) {
        await updateDesignTemplate(editingId, payload);
      } else {
        await createDesignTemplate(payload);
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
      // Без design_code — бэкенд выделит новый код семьи.
      const codeLabel = formatDesignCodeLabel(t);
      await createDesignTemplate({
        name: `${codeLabel} (копия)`,
        description: t.description ?? undefined,
        category_id: t.category_id ?? undefined,
        preview_url: t.preview_url ?? undefined,
        site_preview_url: t.site_preview_url ?? undefined,
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
    const designCode = importForm.design_code.trim();
    if (designCode && !/^\d{6}$/.test(designCode)) {
      setError('Код семьи должен быть 6-значным (например 000001)');
      return;
    }
    try {
      setImporting(true);
      setError(null);
      setImportWarnings([]);
      setImportErrors([]);
      setImportResultCode(null);
      const trimmedName = importForm.name.trim();
      const res = await importDesignTemplateFile({
        file: importForm.file,
        sourceFile: importForm.sourceFile,
        name: trimmedName || undefined,
        design_code: designCode || undefined,
        description: importForm.description.trim() || undefined,
        category_id: importForm.category_id,
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
      const resultCode = res.data.design_code
        ?? res.data.template?.design_code
        ?? null;
      setImportResultCode(resultCode);
      await loadTemplates();
    } catch (err: unknown) {
      const parsed = parseDesignTemplateImportError(err);
      setImportWarnings(parsed.warnings);
      setImportErrors(parsed.errors);
      setError(parsed.message);
    } finally {
      setImporting(false);
    }
  }, [importForm, loadTemplates, currentUser?.id]);

  const handleDelete = useCallback(async (id: number, label?: string) => {
    const title = label?.trim() ? ` «${label.trim()}»` : '';
    if (!confirm(`Удалить макет${title} (#${id})? Это действие необратимо.`)) return;
    try {
      await deleteDesignTemplate(id);
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }, [loadTemplates]);

  const handleDeleteFamily = useCallback(async (family: DesignTemplateFamily) => {
    const code = family.design_code ?? formatDesignCodeLabel(family.primary);
    const n = family.variants.length;
    if (!confirm(
      `Удалить всю семью «${code}» (${n} размер${n === 1 ? '' : n < 5 ? 'а' : 'ов'})? Это действие необратимо.`,
    )) return;
    try {
      for (const variant of family.variants) {
        await deleteDesignTemplate(variant.id);
      }
      await loadTemplates();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
      await loadTemplates();
    }
  }, [loadTemplates]);

  const infoParsed = infoTemplate ? parseTemplateSpec(infoTemplate) : null;

  const renderFamilyCard = useCallback((family: DesignTemplateFamily) => {
    const t = family.primary;
    const status = familyCatalogStatus(family);
    const codeLabel = family.design_code ?? formatDesignCodeLabel(t);
    const previewSrc = resolveTemplatePreviewUrl(resolveFamilyPreviewUrl(family), API_BASE_URL);
    const warningCount = family.variants.reduce(
      (n, v) => n + parseTemplateSpec(v).importWarnings.length,
      0,
    );
    const fontsIssue = family.variants.some((v) => {
      const p = parseTemplateSpec(v);
      return p.hasDesignState && !p.fontsResolved;
    });
    const unlinkedCount = family.variants.filter((v) => (v.subtype_link_count ?? 0) === 0).length;

    return (
      <div key={family.key} className={`design-template-card design-template-card--family design-template-card--${status}`}>
        <div className="design-template-family-top">
          <div className="design-template-preview">
            {previewSrc ? (
              <img src={previewSrc} alt={codeLabel} />
            ) : (
              <div className="design-template-placeholder">
                <span className="design-template-placeholder-mark" aria-hidden>×</span>
                <span className="design-template-placeholder-text">У этого дизайна ещё не загружено превью</span>
              </div>
            )}
            <span className={`design-template-status design-template-status--${status}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <div className="design-template-info">
            <h4 className="design-template-name">
              <span className="design-template-code">{codeLabel}</span>
              <span className="design-template-id">семья · {family.variants.length} размер{family.variants.length === 1 ? '' : family.variants.length < 5 ? 'а' : 'ов'}</span>
            </h4>
            <p className="design-template-family-hint">
              У каждого размера макета — своя привязка: продукт → подтип → размер в калькуляторе.
            </p>
            <div className="design-template-meta-row">
              {unlinkedCount > 0 && (
                <span className="design-template-meta design-template-binding-warn">
                  без привязки: {unlinkedCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="design-template-meta design-template-warnings-badge" title="Предупреждения импорта">
                  {warningCount} предупр.
                </span>
              )}
              {fontsIssue && (
                <span className="design-template-meta design-template-warnings-badge" title="Не все шрифты найдены в библиотеке CRM">
                  шрифты
                </span>
              )}
            </div>
            {(t.author_name || t.author_user_id) && (
              <span className="design-template-author">
                <AppIcon name="user" size="xs" />
                {t.author_name ?? `user #${t.author_user_id}`}
              </span>
            )}
            {formatAuthorRoyaltyLine(t) && (
              <span className="design-template-royalty" title="Плата и % — на всю семью (синхронизируются при сохранении)">
                <BynSymbol className="design-template-royalty__sign" />
                {formatAuthorRoyaltyLine(t)}
                <span className="design-template-royalty-hint"> · на семью</span>
              </span>
            )}
            <div className="design-template-actions design-template-actions--family-top">
              <div className="design-template-actions__primary">
                {family.design_code && (
                  <button
                    type="button"
                    className="lg-btn"
                    onClick={() => openImportIntoFamily(family)}
                    title="Импорт ещё одного размера в эту семью"
                  >
                    <AppIcon name="plus" size="xs" /> Добавить размер
                  </button>
                )}
                <button
                  type="button"
                  className="lg-btn lg-btn--icon"
                  onClick={() => openEdit(t)}
                  title="Карточка семьи (автор, плата Y, % Z)"
                  aria-label="Карточка"
                >
                  <AppIcon name="edit" size="xs" />
                </button>
                <button type="button" className="lg-btn lg-btn--icon" onClick={() => setInfoTemplate(t)} title="Импорт и метаданные" aria-label="Инфо">
                  <AppIcon name="info" size="xs" />
                </button>
                <button type="button" className="lg-btn lg-btn--icon" onClick={() => setReimportTemplate(t)} title="Обновить из SVG (первый вариант)" aria-label="Обновить SVG">
                  <AppIcon name="download" size="xs" />
                </button>
                <button type="button" className="lg-btn lg-btn--icon" onClick={() => void handleDuplicate(t)} title="Копия с новым кодом семьи" aria-label="Копия">
                  <AppIcon name="copy" size="xs" />
                </button>
                <button
                  type="button"
                  className="lg-btn lg-btn--icon lg-btn--danger"
                  onClick={() => void handleDeleteFamily(family)}
                  title="Удалить всю семью"
                  aria-label="Удалить семью"
                >
                  <AppIcon name="trash" size="xs" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <DesignTemplateFamilyVariantRows
          family={family}
          formatBinding={formatBinding}
          onBound={loadTemplates}
          onDelete={handleDelete}
        />
      </div>
    );
  }, [
    formatBinding,
    handleDelete,
    handleDeleteFamily,
    handleDuplicate,
    loadTemplates,
    openEdit,
    openImportIntoFamily,
  ]);

  return (
    <AdminPageLayout
      className="design-templates-layout"
      title="Каталог шаблонов дизайна"
      icon={<AppIcon name="layers" size="sm" />}
      onBack={() => navigate('/adminpanel')}
    >
      {error && <Alert type="error">{error}</Alert>}

      <div className="design-templates-page product-management">
        <div className="design-templates-tabs">
          <button
            type="button"
            className={`design-templates-tab${pageTab === 'catalog' ? ' design-templates-tab--active' : ''}`}
            onClick={() => setPageTab('catalog')}
          >
            <AppIcon name="layers" size="xs" /> Каталог
            <span className="design-templates-tab__count">{groupTemplatesIntoFamilies(templates).length}</span>
          </button>
          <button
            type="button"
            className={`design-templates-tab${pageTab === 'bindings' ? ' design-templates-tab--active' : ''}`}
            onClick={() => setPageTab('bindings')}
          >
            <AppIcon name="link" size="xs" /> Привязки
          </button>
          <button
            type="button"
            className={`design-templates-tab${pageTab === 'analytics' ? ' design-templates-tab--active' : ''}`}
            onClick={() => setPageTab('analytics')}
          >
            <AppIcon name="chart" size="xs" /> Аналитика
          </button>
        </div>

        {pageTab === 'bindings' ? (
          <DesignTemplateBindingsPanel
            initialProductId={bindingsProductId ? Number(bindingsProductId) : undefined}
            initialTypeId={bindingsTypeId ? Number(bindingsTypeId) : undefined}
            highlightTemplateId={highlightTemplateId ? Number(highlightTemplateId) : undefined}
          />
        ) : pageTab === 'analytics' ? (
          <DesignTemplateUsagePanel />
        ) : (
          <>
        <div className="design-templates-help">
          <button
            type="button"
            className="design-templates-help__toggle"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
          >
            <span className="design-templates-help__chevron" aria-hidden>{helpOpen ? '▾' : '▸'}</span>
            Справка по каталогу
          </button>
          {helpOpen && (
            <p className="design-templates-help__body">
              Master-шаблоны для сайта. Карточка = семья с кодом <code>000001</code>;
              размеры (мм) — варианты внутри. Основной вход — <strong>Импорт SVG</strong> (
              <code>docs/design-template-importer.md</code>). В ZIP папки вида <code>204x204/</code> создают
              варианты одной семьи. Клиентский редактор — на сайте (кнопка «На сайте»). Плата автора (Y) и % (Z) задаются один раз на семью.
            </p>
          )}
        </div>

        <div className="design-templates-toolbar-card">
        <div className="design-templates-toolbar">
          <button type="button" className="lg-btn lg-btn--primary" onClick={openImport}>
            <AppIcon name="download" size="xs" /> Импорт SVG
          </button>
          <button type="button" className="lg-btn" onClick={openCreate}>
            <AppIcon name="plus" size="xs" /> Вручную
          </button>
          <button type="button" className="lg-btn" onClick={() => setCategoriesModalOpen(true)}>
            <AppIcon name="folder" size="xs" /> Категории
          </button>
          <button type="button" className="lg-btn" onClick={() => navigate('/adminpanel/design-fonts')}>
            <AppIcon name="document" size="xs" /> Шрифты
          </button>
          <input
            type="search"
            className="design-templates-search"
            placeholder="Поиск по коду, ID, размеру…"
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
            <label>Привязка:</label>
            <select value={bindingFilter} onChange={(e) => setBindingFilter(e.target.value as BindingFilter)}>
              <option value="all">Все</option>
              <option value="linked">В матрице ({bindingCounts.linked})</option>
              <option value="unlinked">Без привязки ({bindingCounts.unlinked})</option>
            </select>
          </div>
          <div className="design-templates-filter">
            <label>Категория:</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Все</option>
              <option value={UNCATEGORIZED_KEY}>Без категории</option>
              {categoryRegistry.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
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
              <option value="design_code">Код семьи</option>
              <option value="updated">Обновление</option>
            </select>
          </div>
        </div>
        </div>

        {!loading && filtersActive && filtered.length > 0 && (
          <p className="design-templates-shown-count">
            Показано <strong>{familyCount}</strong> семей
            {' '}({filtered.length} из {templates.length} вариантов)
          </p>
        )}

        {!loading && categorySections.length > 1 && (
          <div className="design-templates-section-tools">
            <button type="button" className="lg-btn" onClick={expandAllSections}>
              Развернуть все
            </button>
            <button type="button" className="lg-btn" onClick={collapseAllSections}>
              Свернуть все
            </button>
          </div>
        )}

        {loading ? (
          <div className="design-templates-loading">Загрузка...</div>
        ) : (
          <div className="design-templates-catalog-sections">
            {categorySections.map((section) => {
              const collapsed = collapsedSections.has(section.key);
              return (
                <section
                  key={section.key}
                  className={`design-templates-category-card${collapsed ? ' design-templates-category-card--collapsed' : ''}`}
                >
                  <button
                    type="button"
                    className="design-templates-category-card__header"
                    onClick={() => toggleSectionCollapsed(section.key)}
                    aria-expanded={!collapsed}
                  >
                    <span className="design-templates-category-card__chevron" aria-hidden>
                      {collapsed ? '▸' : '▾'}
                    </span>
                    <h3 className="design-templates-category-card__title">{section.label}</h3>
                    <span className="design-templates-category-card__badge">
                      {groupTemplatesIntoFamilies(section.items).length}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="design-templates-category-card__body">
                      <div className="design-templates-grid">
                        {groupTemplatesIntoFamilies(section.items).map((family) => renderFamilyCard(family))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="design-templates-empty">
            {templates.length === 0
              ? 'Шаблонов пока нет. Начните с импорта SVG — код семьи назначится автоматически.'
              : 'Нет шаблонов по выбранным фильтрам.'}
          </div>
        )}
          </>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Карточка семьи дизайна' : 'Новый шаблон (вручную)'}
        className="product-management design-templates-modal"
        size="xl"
      >
        <div className="design-template-form">
          <div className="design-template-form-grid">
            <section className="design-template-form-section design-template-form-section--main">
              <header className="design-template-form-section__head">
                <span>Основное</span>
                <strong>Код семьи и категория</strong>
              </header>
              {editingId != null && (
                <div className="form-row">
                  <label>Код семьи</label>
                  <input
                    type="text"
                    value={templates.find((x) => x.id === editingId)?.design_code ?? '—'}
                    readOnly
                    disabled
                  />
                  <p className="form-hint">Внутренний id: #{editingId}. Код назначается при создании/импорте.</p>
                </div>
              )}
              <div className="form-row">
                <label>Служебное название</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Необязательно — по умолчанию код семьи"
                />
              </div>
              <div className="form-row">
                <label>Описание</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-row">
                <label>Категория</label>
                <DesignTemplateCategoryField
                  categories={categoryRegistry}
                  value={form.category_id}
                  onChange={(category_id) => setForm((p) => ({ ...p, category_id }))}
                  onCreateCategory={handleCreateCategoryInline}
                />
              </div>
            </section>

            <section className="design-template-form-section">
              <header className="design-template-form-section__head">
                <span>Публикация</span>
                <strong>Статус и порядок</strong>
              </header>
              <div className="design-template-compact-fields">
                <label className="checkbox-label">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
                  Активен
                </label>
                <label>
                  <span>Порядок</span>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value, 10) || 0 }))} />
                </label>
              </div>
            </section>

            <section className="design-template-form-section design-template-form-section--preview">
              <header className="design-template-form-section__head">
                <span>Превью</span>
                <strong>Картинки для редактора и сайта</strong>
              </header>
              <div className="design-template-preview-fields">
                <div className="form-row">
                  <label>Превью для сайта</label>
                  <div className="preview-upload">
                    {form.site_preview_url ? (
                      <div className="preview-preview">
                        <img src={resolveTemplatePreviewUrl(form.site_preview_url, API_BASE_URL) ?? ''} alt="" />
                        <button type="button" onClick={() => setForm((p) => ({ ...p, site_preview_url: '' }))}>×</button>
                      </div>
                    ) : null}
                    <input ref={sitePreviewFileInputRef} type="file" accept="image/*" onChange={handleSitePreviewUpload} className="visually-hidden-file-input" />
                    <button type="button" className="lg-btn" onClick={() => sitePreviewFileInputRef.current?.click()}>Загрузить превью сайта</button>
                    <p className="form-hint">Основная картинка на сайте. Если пусто — сайт возьмёт авто-превью импорта.</p>
                  </div>
                </div>
                <div className="form-row">
                  <label>Превью / фон в редакторе</label>
                  <div className="preview-upload">
                    {form.preview_url ? (
                      <div className="preview-preview">
                        <img src={resolveTemplatePreviewUrl(form.preview_url, API_BASE_URL) ?? ''} alt="" />
                        <button type="button" onClick={() => setForm((p) => ({ ...p, preview_url: '' }))}>×</button>
                      </div>
                    ) : null}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePreviewUpload} className="visually-hidden-file-input" />
                    <button type="button" className="lg-btn" onClick={() => fileInputRef.current?.click()}>Загрузить изображение</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="design-template-form-section design-template-form-section--binding">
              <header className="design-template-form-section__head">
                <span>Продукт</span>
                <strong>Привязка к каталогу</strong>
              </header>
              <div className="form-row">
                <DesignTemplateProductBindField
                  value={{ productId: form.productId, typeId: form.typeId, sizeId: form.sizeId }}
                  onChange={(bind) => setForm((p) => ({ ...p, ...bind }))}
                />
              </div>
            </section>

            <section className="design-template-form-section">
              <header className="design-template-form-section__head">
                <span>Автор</span>
                <strong>ЗП на всю семью (Y и Z)</strong>
              </header>
              <p className="form-hint design-template-family-royalty-hint">
                Автор, плата (Y) и % автору (Z) синхронизируются на все размеры с тем же кодом семьи.
              </p>
              <div className="design-template-compact-fields">
                <label className="design-template-field--wide">
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
                  <span>Плата Y, бел. руб./ед.</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.usage_fee}
                    onChange={(e) => setForm((p) => ({ ...p, usage_fee: e.target.value }))}
                  />
                </label>
                <label>
                  <span>% автору Z</span>
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
            </section>

            <section className="design-template-form-section">
              <header className="design-template-form-section__head">
                <span>Макет</span>
                <strong>Размер и страницы</strong>
              </header>
              <div className="design-template-compact-fields design-template-compact-fields--three">
                <label>
                  <span>Ширина, мм</span>
                  <input type="number" min="1" value={form.width_mm} onChange={(e) => setForm((p) => ({ ...p, width_mm: e.target.value }))} />
                </label>
                <label>
                  <span>Высота, мм</span>
                  <input type="number" min="1" value={form.height_mm} onChange={(e) => setForm((p) => ({ ...p, height_mm: e.target.value }))} />
                </label>
                <label>
                  <span>Страниц</span>
                  <input type="number" min="1" value={form.page_count} onChange={(e) => setForm((p) => ({ ...p, page_count: e.target.value }))} />
                </label>
              </div>
              <div className="design-template-manual-hint">
                Поля <code>photo_*</code> / <code>text_*</code> из SVG не создаются автоматически — для парсинга макета используйте <strong>Импорт SVG</strong>.
                Здесь можно задать размеры и фон-превью. Клиентский редактор — на сайте (кнопка «На сайте» у варианта).
              </div>
            </section>
          </div>
          <div className="form-actions">
            <button type="button" className="lg-btn" onClick={() => setModalOpen(false)}>Отмена</button>
            <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleSave()}>Сохранить</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Импорт шаблона (SVG)"
        className="product-management design-templates-modal"
      >
        <div className="design-template-form">
          <div className="design-template-import-intro">
            <strong>Основной способ:</strong>
            <span>
              SVG или ZIP со страницами. В ZIP папки размеров вида <code>204x204/</code> (ширина×высота в мм)
              создают варианты одной семьи. Исходник AI/CDR — опционально. Без SVG — draft.
            </span>
          </div>
          <div className="form-row">
            <label>Исходник для CRM</label>
            <div className="preview-upload">
              <input ref={importSourceFileInputRef} type="file" accept=".ai,.cdr,.indd,.indt,.pdf,.svg" onChange={(e) => setImportForm((p) => ({ ...p, sourceFile: e.target.files?.[0] ?? null }))} className="visually-hidden-file-input" />
              <button type="button" className="lg-btn" onClick={() => importSourceFileInputRef.current?.click()}>Выбрать исходник</button>
              <p className="form-hint">{importForm.sourceFile ? importForm.sourceFile.name : 'AI, CDR, PDF…'}</p>
            </div>
          </div>
          <div className="form-row">
            <label>SVG/ZIP для редактора *</label>
            <div className="preview-upload">
              <input ref={importFileInputRef} type="file" accept=".svg,.zip" onChange={(e) => setImportForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))} className="visually-hidden-file-input" />
              <button type="button" className="lg-btn" onClick={() => importFileInputRef.current?.click()}>Выбрать SVG/ZIP</button>
              <p className="form-hint">
                {importForm.file
                  ? importForm.file.name
                  : 'photo_*, text_*, trim/bleed/safe · ZIP: папки 204x204/, 150x150/…'}
              </p>
            </div>
          </div>
          <div className="form-row">
            <label>Код семьи</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Пусто — новый код; 000001 — добавить размер в семью"
              value={importForm.design_code}
              onChange={(e) => setImportForm((p) => ({
                ...p,
                design_code: e.target.value.replace(/\D/g, '').slice(0, 6),
              }))}
            />
            <p className="form-hint">
              Оставьте пустым — система назначит следующий код. Укажите существующий 6-значный код, чтобы добавить размер в эту семью.
            </p>
          </div>
          <div className="form-row">
            <label>Служебное название</label>
            <input
              type="text"
              value={importForm.name}
              onChange={(e) => setImportForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Необязательно — по умолчанию код семьи"
            />
          </div>
          <div className="form-row">
            <label>Описание</label>
            <textarea value={importForm.description} onChange={(e) => setImportForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="form-row">
            <label>Категория</label>
            <DesignTemplateCategoryField
              categories={categoryRegistry}
              value={importForm.category_id}
              onChange={(category_id) => setImportForm((p) => ({ ...p, category_id }))}
              onCreateCategory={handleCreateCategoryInline}
            />
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
              <span>Плата Y (бел. руб./ед.)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={importForm.usage_fee}
                onChange={(e) => setImportForm((p) => ({ ...p, usage_fee: e.target.value }))}
              />
            </label>
            <label>
              <span>% автору Z</span>
              <input
                type="number"
                min="0"
                max="100"
                value={importForm.author_percent}
                onChange={(e) => setImportForm((p) => ({ ...p, author_percent: e.target.value }))}
              />
            </label>
          </div>
          <div className="form-row">
            <label>Привязка к продукту</label>
            <DesignTemplateProductBindField
              value={{
                productId: importForm.productId,
                typeId: importForm.typeId,
                sizeId: importForm.sizeId,
              }}
              onChange={(bind) => setImportForm((p) => ({ ...p, ...bind }))}
              requiredSize
            />
          </div>
          {importResultCode && (
            <div className="design-template-import-success">
              <strong>Код семьи:</strong> {importResultCode}
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="design-template-import-errors">
              <strong>Ошибка импорта:</strong>
              <ul>{importErrors.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </div>
          )}
          {importWarnings.length > 0 && (
            <div className="design-template-import-warnings">
              <strong>Предупреждения:</strong>
              <ul>{importWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="lg-btn" onClick={() => setImportModalOpen(false)}>Закрыть</button>
            <button type="button" className="lg-btn lg-btn--primary" onClick={() => void handleImport()} disabled={importing}>
              {importing ? 'Импорт…' : 'Импортировать'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={infoTemplate !== null}
        onClose={() => setInfoTemplate(null)}
        title={infoTemplate ? `${formatDesignCodeLabel(infoTemplate)} · #${infoTemplate.id}` : ''}
        className="product-management design-templates-modal"
      >
        {infoTemplate && infoParsed && (
          <div className="design-template-info-panel">
            {infoTemplate.design_code && (
              <p><strong>Код семьи:</strong> {infoTemplate.design_code}</p>
            )}
            <p><strong>Внутр. id:</strong> #{infoTemplate.id}</p>
            <p><strong>Статус:</strong> {STATUS_LABELS[getTemplateCatalogStatus(infoTemplate)]}</p>
            <p><strong>designState:</strong> {infoParsed.hasDesignState ? 'есть' : 'нет'}</p>
            {infoParsed.importerVersion != null && <p><strong>Importer v:</strong> {infoParsed.importerVersion}</p>}
            {formatTemplateSize(infoParsed) && <p><strong>Размер:</strong> {formatTemplateSize(infoParsed)}</p>}
            {formatBinding(infoParsed) && <p><strong>Привязка:</strong> {formatBinding(infoParsed)}</p>}
            {infoTemplate.author_name && (
              <p><strong>Автор:</strong> {infoTemplate.author_name}</p>
            )}
            {formatAuthorRoyaltyLine(infoTemplate) && (
              <p><strong>ЗП автора (на семью):</strong> {formatAuthorRoyaltyLine(infoTemplate)}</p>
            )}
            {infoParsed.requiredFonts.length > 0 && (
              <div className="design-template-fonts-panel">
                <strong>Шрифты макета:</strong>
                <ul>
                  {infoParsed.requiredFonts.map((font) => (
                    <li key={font.family}>
                      {font.family}
                      {' — '}
                      {font.source === 'missing' ? 'не найден' : font.source === 'global' ? 'библиотека CRM' : 'в ZIP шаблона'}
                    </li>
                  ))}
                </ul>
                {!infoParsed.fontsResolved && (
                  <p className="design-template-fonts-panel__hint">
                    Загрузите недостающие шрифты в{' '}
                    <button type="button" className="design-template-link-btn" onClick={() => { setInfoTemplate(null); navigate('/adminpanel/design-fonts'); }}>
                      библиотеку шрифтов
                    </button>
                    {' '}или приложите папку fonts/ к ZIP при reimport.
                  </p>
                )}
              </div>
            )}
            {infoParsed.importWarnings.length > 0 && (
              <div className="design-template-import-warnings">
                <strong>Предупреждения импорта:</strong>
                <ul>{infoParsed.importWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="lg-btn" onClick={() => { setInfoTemplate(null); setReimportTemplate(infoTemplate); }}>
                Обновить из SVG
              </button>
              <button
                type="button"
                className="lg-btn lg-btn--primary"
                onClick={() => {
                  const id = infoTemplate.id;
                  setInfoTemplate(null);
                  navigate(`/adminpanel/design-editor/${id}`);
                }}
              >
                Редактировать макет
              </button>
              <button type="button" className="lg-btn" onClick={() => { setInfoTemplate(null); openEdit(infoTemplate); }}>Редактировать карточку</button>
              {(infoParsed.productId != null || infoParsed.typeId != null) && (
                <button type="button" className="lg-btn" onClick={() => { setInfoTemplate(null); openBindingsForTemplate(infoTemplate); }}>
                  Привязки к продукту
                </button>
              )}
              <button
                type="button"
                className="lg-btn"
                onClick={() => {
                  void openSiteSandboxForDesignTemplate(infoTemplate).catch((err) => {
                    window.alert(err instanceof Error ? err.message : 'Не удалось открыть редактор на сайте');
                  });
                }}
              >
                Открыть на сайте
              </button>
            </div>
          </div>
        )}
      </Modal>

      <DesignTemplateCategoriesModal
        isOpen={categoriesModalOpen}
        onClose={() => setCategoriesModalOpen(false)}
        onChanged={() => void reloadCatalog()}
      />

      <DesignTemplateReimportModal
        template={reimportTemplate}
        isOpen={reimportTemplate !== null}
        onClose={() => setReimportTemplate(null)}
        onDone={() => void reloadCatalog()}
      />
    </AdminPageLayout>
  );
};

export default DesignTemplatesPage;
