import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/common';
import { AppIcon } from '../../../components/ui/AppIcon';
import {
  addSubtypeDesign,
  getDesignTemplates,
  getSubtypeDesigns,
  removeSubtypeDesign,
  type DesignTemplate,
  type SubtypeDesignLink,
} from '../../../api';
import { getProductTemplateConfig } from '../../../services/products';
import { useProductDirectoryStore } from '../../../stores/productDirectoryStore';
import {
  getEffectiveConfig,
  type ProductTypeVariant,
  type SimplifiedConfig,
  type SimplifiedSizeConfig,
} from '../../../features/productTemplate/hooks/useProductTemplate';
import {
  pageCountAllowedForSubtype,
  parseDesignTemplateDimensions,
  sizeMatchesTrimFormat,
} from '../../../features/productTemplate/utils/designTemplateSpec';
import { resolveTemplatePreviewUrl } from './designTemplateCatalogUtils';
import { API_BASE_URL } from '../../../config/constants';
import '../../../features/productTemplate/components/SimplifiedTemplateSection.css';
import './DesignTemplateBindingsPanel.css';

type BindingsPanelProps = {
  initialProductId?: number;
  initialTypeId?: number;
  highlightTemplateId?: number;
};

const LEGACY_SIZE_KEY = '';

function parseSimplifiedFromConfig(configData: Record<string, unknown> | undefined): SimplifiedConfig | null {
  if (!configData?.simplified || typeof configData.simplified !== 'object') return null;
  return configData.simplified as SimplifiedConfig;
}

export const DesignTemplateBindingsPanel: React.FC<BindingsPanelProps> = ({
  initialProductId,
  initialTypeId,
  highlightTemplateId,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const products = useProductDirectoryStore((s) => s.products);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);

  const [productId, setProductId] = useState<number | ''>(initialProductId ?? '');
  const [typeId, setTypeId] = useState<number | ''>(initialTypeId ?? '');
  const [simplified, setSimplified] = useState<SimplifiedConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [links, setLinks] = useState<SubtypeDesignLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSizeId, setModalSizeId] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<DesignTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [modalSearch, setModalSearch] = useState('');

  const syncUrl = useCallback((pid: number | '', tid: number | '') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'bindings');
    if (pid !== '') next.set('productId', String(pid));
    else next.delete('productId');
    if (tid !== '') next.set('typeId', String(tid));
    else next.delete('typeId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void initializeDirectory();
  }, [initializeDirectory]);

  useEffect(() => {
    if (initialProductId != null) setProductId(initialProductId);
  }, [initialProductId]);

  useEffect(() => {
    if (initialTypeId != null) setTypeId(initialTypeId);
  }, [initialTypeId]);

  const loadConfig = useCallback(async (pid: number) => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const cfg = await getProductTemplateConfig(pid);
      const parsed = parseSimplifiedFromConfig(cfg?.config_data as Record<string, unknown> | undefined);
      if (!parsed) {
        setSimplified(null);
        setConfigError('У продукта нет настроенных размеров (simplified). Откройте карточку продукта.');
      } else {
        setSimplified(parsed);
      }
    } catch {
      setConfigError('Не удалось загрузить продукт.');
      setSimplified(null);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof productId !== 'number') {
      setSimplified(null);
      return;
    }
    void loadConfig(productId);
  }, [productId, loadConfig]);

  const types: ProductTypeVariant[] = useMemo(
    () => simplified?.types ?? [],
    [simplified],
  );

  useEffect(() => {
    if (types.length === 0) return;
    if (typeId === '' || !types.some((t) => Number(t.id) === Number(typeId))) {
      const def = types.find((t) => t.default) ?? types[0];
      setTypeId(def.id);
    }
  }, [types, typeId]);

  const effectiveConfig = useMemo(() => {
    if (!simplified) return null;
    const tid = typeId === '' ? null : Number(typeId);
    return getEffectiveConfig(simplified, simplified.types?.length ? tid : null);
  }, [simplified, typeId]);

  const subtypeSizes = effectiveConfig?.sizes ?? [];
  const pagesConfig = effectiveConfig?.pages;

  const loadLinks = useCallback(async () => {
    if (typeof productId !== 'number' || typeId === '') return;
    setLinksLoading(true);
    try {
      const res = await getSubtypeDesigns(productId, Number(typeId));
      setLinks(res.data);
    } catch {
      setLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }, [productId, typeId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const linksBySize = useMemo(() => {
    const map = new Map<string, SubtypeDesignLink[]>();
    for (const link of links) {
      const key = link.size_id?.trim() || LEGACY_SIZE_KEY;
      const list = map.get(key) ?? [];
      list.push(link);
      map.set(key, list);
    }
    return map;
  }, [links]);

  const sizesMissingDesigns = useMemo(
    () => subtypeSizes.filter((size) => !(linksBySize.get(String(size.id))?.length)),
    [subtypeSizes, linksBySize],
  );

  const setProduct = (value: string) => {
    const pid = value ? Number(value) : '';
    setProductId(pid);
    setTypeId('');
    syncUrl(pid, '');
  };

  const setType = (value: string) => {
    const tid = value ? Number(value) : '';
    setTypeId(tid);
    if (typeof productId === 'number') syncUrl(productId, tid);
  };

  const openModalForSize = useCallback(async (sizeId: string) => {
    setModalSizeId(sizeId);
    setModalSearch('');
    setModalOpen(true);
    setLoadingTemplates(true);
    try {
      const res = await getDesignTemplates();
      setAllTemplates(res.data.filter((t) => t.is_active === 1));
    } catch {
      setAllTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const handleAdd = useCallback(
    async (templateId: number, sizeId: string) => {
      if (typeof productId !== 'number' || typeId === '') return;
      const size = subtypeSizes.find((s) => String(s.id) === sizeId);
      const t = allTemplates.find((x) => x.id === templateId);
      if (t && size) {
        const dim = parseDesignTemplateDimensions(t);
        if (dim && !sizeMatchesTrimFormat(dim.width_mm, dim.height_mm, [size])) {
          if (!window.confirm(`Размер макета не совпадает с форматом. Прикрепить всё равно?`)) return;
        }
        if (dim && pagesConfig?.options?.length && !pageCountAllowedForSubtype(dim.page_count, pagesConfig)) {
          if (!window.confirm(`Число страниц в шаблоне не совпадает с подтипом. Прикрепить всё равно?`)) return;
        }
      }
      setAdding(templateId);
      try {
        await addSubtypeDesign(productId, Number(typeId), templateId, sizeId);
        await loadLinks();
        setModalOpen(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg.includes('409') ? 'Уже привязан' : msg);
      } finally {
        setAdding(null);
      }
    },
    [productId, typeId, loadLinks, allTemplates, subtypeSizes, pagesConfig],
  );

  const handleRemove = useCallback(
    async (linkId: number) => {
      if (typeof productId !== 'number') return;
      if (!confirm('Убрать макет с этого размера?')) return;
      try {
        await removeSubtypeDesign(productId, linkId);
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      } catch {
        alert('Ошибка');
      }
    },
    [productId],
  );

  const modalSize = modalSizeId ? subtypeSizes.find((s) => String(s.id) === modalSizeId) : null;
  const modalLinks = modalSizeId ? linksBySize.get(modalSizeId) ?? [] : [];
  const linkedIds = new Set(modalLinks.map((l) => l.design_template_id));

  const modalTemplates = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    if (!q) return allTemplates;
    return allTemplates.filter((t) => `${t.id} ${t.name}`.toLowerCase().includes(q));
  }, [allTemplates, modalSearch]);

  const ready = typeof productId === 'number' && !configLoading && !configError && subtypeSizes.length > 0;

  return (
    <div className="subtype-designs-card">
      <p className="design-bindings-hint">
        К каждому размеру подтипа — хотя бы один активный шаблон. То же самое, что вкладка «Дизайн» в карточке продукта.
      </p>

      <div className="design-bindings-filters">
        <label>
          Продукт
          <select value={productId === '' ? '' : String(productId)} onChange={(e) => setProduct(e.target.value)}>
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        {types.length > 0 && productId !== '' && (
          <label>
            Подтип
            <select value={typeId === '' ? '' : String(typeId)} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {productId !== '' && (
          <Button variant="secondary" onClick={() => navigate(`/adminpanel/products/${productId}`)}>
            Карточка продукта
          </Button>
        )}
      </div>

      {configLoading && <p className="subtype-designs-card__hint">Загрузка…</p>}
      {configError && <p className="design-bindings-error">{configError}</p>}

      {productId === '' && !configLoading && (
        <p className="design-bindings-empty">Выберите продукт.</p>
      )}

      {typeof productId === 'number' && !configLoading && !configError && subtypeSizes.length === 0 && (
        <p className="design-bindings-empty">
          Нет размеров — добавьте в{' '}
          <button type="button" className="subtype-designs-card__matrix-link" onClick={() => navigate(`/adminpanel/products/${productId}`)}>
            карточке продукта
          </button>
          .
        </p>
      )}

      {ready && (
        <p className="design-bindings-status">
          Размеров: <strong>{subtypeSizes.length}</strong>
          {sizesMissingDesigns.length > 0 && (
            <> · без макета: <strong>{sizesMissingDesigns.length}</strong></>
          )}
        </p>
      )}

      {sizesMissingDesigns.length > 0 && ready && (
        <div className="subtype-designs-coverage-alert" role="alert">
          <strong>Нет дизайнов:</strong>{' '}
          {sizesMissingDesigns.map((s) => s.label || String(s.id)).join(', ')}
        </div>
      )}

      {linksLoading && ready && <p className="subtype-designs-card__hint">Загрузка привязок…</p>}

      {ready && !linksLoading && (
        <div className="subtype-designs-by-size">
          {subtypeSizes.map((size) => {
            const sizeKey = String(size.id);
            const sizeLinks = linksBySize.get(sizeKey) ?? [];
            const missing = sizeLinks.length === 0;
            return (
              <section
                key={sizeKey}
                className={`subtype-designs-size-block${missing ? ' subtype-designs-size-block--missing' : ''}`}
              >
                <div className="subtype-designs-size-block__header">
                  <div>
                    <h5>{size.label || sizeKey}</h5>
                    <span className="subtype-designs-size-block__meta">
                      {size.width_mm}×{size.height_mm} мм · <code>{sizeKey}</code>
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => void openModalForSize(sizeKey)}>
                    <AppIcon name="plus" size="xs" /> Добавить
                  </Button>
                </div>
                {missing ? (
                  <p className="subtype-designs-card__hint">Нет макетов для этого размера.</p>
                ) : (
                  <div className="subtype-designs-grid">
                    {sizeLinks.map((link) => (
                      <div
                        key={link.id}
                        className={`subtype-designs-item${
                          highlightTemplateId === link.design_template_id ? ' subtype-designs-item--highlight' : ''
                        }`}
                      >
                        <div className="subtype-designs-item__preview">
                          {link.preview_url ? (
                            <img
                              src={resolveTemplatePreviewUrl(link.preview_url, API_BASE_URL) ?? ''}
                              alt={link.name}
                              className="subtype-designs-item__img"
                            />
                          ) : (
                            <div className="subtype-designs-item__no-preview">
                              <AppIcon name="image" size="sm" />
                            </div>
                          )}
                        </div>
                        <div className="subtype-designs-item__name">{link.name}</div>
                        <button
                          type="button"
                          className="subtype-designs-item__remove"
                          onClick={() => void handleRemove(link.id)}
                          title="Отвязать"
                        >
                          <AppIcon name="x" size="xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {modalOpen && modalSizeId && (
        <div className="subtype-designs-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="subtype-designs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="subtype-designs-modal__header">
              <h3 className="subtype-designs-modal__title">
                {modalSize?.label ?? modalSizeId}
              </h3>
              <button type="button" className="subtype-designs-modal__close" onClick={() => setModalOpen(false)}>
                <AppIcon name="x" size="sm" />
              </button>
            </div>
            <input
              type="search"
              className="design-bindings-modal-search"
              placeholder="Поиск шаблона…"
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
            />
            {loadingTemplates ? (
              <p className="subtype-designs-modal__hint">Загрузка…</p>
            ) : modalTemplates.length === 0 ? (
              <p className="subtype-designs-modal__hint">Нет шаблонов.</p>
            ) : (
              <div className="subtype-designs-modal-grid">
                {modalTemplates.map((t) => {
                  const alreadyLinked = linkedIds.has(t.id);
                  return (
                    <div key={t.id} className={`subtype-designs-modal-item${alreadyLinked ? ' is-linked' : ''}`}>
                      <div className="subtype-designs-modal-item__preview">
                        {t.preview_url ? (
                          <img src={resolveTemplatePreviewUrl(t.preview_url, API_BASE_URL) ?? ''} alt={t.name} className="subtype-designs-item__img" />
                        ) : (
                          <div className="subtype-designs-item__no-preview">
                            <AppIcon name="image" size="sm" />
                          </div>
                        )}
                      </div>
                      <div className="subtype-designs-modal-item__name">{t.name}</div>
                      <Button
                        variant={alreadyLinked ? 'secondary' : 'primary'}
                        onClick={() => !alreadyLinked && void handleAdd(t.id, modalSizeId)}
                        disabled={alreadyLinked || adding === t.id}
                      >
                        {alreadyLinked ? 'Привязан' : adding === t.id ? '…' : 'Прикрепить'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
