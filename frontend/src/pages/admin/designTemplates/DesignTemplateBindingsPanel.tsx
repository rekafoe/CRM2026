import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const products = useProductDirectoryStore((s) => s.products);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);

  const [productId, setProductId] = useState<number | ''>(initialProductId ?? '');
  const [typeId, setTypeId] = useState<number | ''>(initialTypeId ?? '');
  const [simplified, setSimplified] = useState<SimplifiedConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [links, setLinks] = useState<SubtypeDesignLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSizeId, setModalSizeId] = useState<string | null>(null);
  const [allTemplates, setAllTemplates] = useState<DesignTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

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
        setConfigError('У продукта нет simplified-шаблона в config.');
      } else {
        setSimplified(parsed);
      }
    } catch {
      setConfigError('Не удалось загрузить конфиг продукта');
      setSimplified(null);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof productId !== 'number' || !Number.isFinite(productId)) {
      setSimplified(null);
      return;
    }
    void loadConfig(productId);
  }, [productId, loadConfig]);

  const types: ProductTypeVariant[] = useMemo(() => {
    if (!simplified?.types?.length) return [];
    return simplified.types;
  }, [simplified]);

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

  const subtypeSizes: SimplifiedSizeConfig[] = useMemo(
    () => effectiveConfig?.sizes ?? [],
    [effectiveConfig],
  );

  const pagesConfig = effectiveConfig?.pages;

  const loadLinks = useCallback(async () => {
    if (typeof productId !== 'number' || typeId === '') return;
    setLinksLoading(true);
    setLinksError(null);
    try {
      const res = await getSubtypeDesigns(productId, Number(typeId));
      setLinks(res.data);
    } catch {
      setLinksError('Не удалось загрузить привязки');
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

  const sizesMissingDesigns = useMemo(() => {
    if (subtypeSizes.length === 0) return [];
    return subtypeSizes.filter((size) => !(linksBySize.get(String(size.id))?.length));
  }, [subtypeSizes, linksBySize]);

  const openModalForSize = useCallback(async (sizeId: string) => {
    setModalSizeId(sizeId);
    setModalOpen(true);
    if (allTemplates.length > 0) return;
    setLoadingTemplates(true);
    try {
      const res = await getDesignTemplates();
      setAllTemplates(res.data.filter((t) => t.is_active === 1));
    } catch {
      // ignore
    } finally {
      setLoadingTemplates(false);
    }
  }, [allTemplates.length]);

  const handleAdd = useCallback(
    async (templateId: number, sizeId: string) => {
      if (typeof productId !== 'number' || typeId === '') return;
      const size = subtypeSizes.find((s) => String(s.id) === sizeId);
      const t = allTemplates.find((x) => x.id === templateId);
      if (t && size) {
        const dim = parseDesignTemplateDimensions(t);
        if (dim && !sizeMatchesTrimFormat(dim.width_mm, dim.height_mm, [size])) {
          const ok = window.confirm(
            `Размер макета (${dim.width_mm}×${dim.height_mm} мм) не совпадает с форматом «${size.label}». Прикрепить всё равно?`,
          );
          if (!ok) return;
        }
        if (dim && pagesConfig?.options?.length && !pageCountAllowedForSubtype(dim.page_count, pagesConfig)) {
          const ok = window.confirm(
            `В шаблоне ${dim.page_count} стр., у подтипа допустимы: ${pagesConfig.options.join(', ')}. Прикрепить всё равно?`,
          );
          if (!ok) return;
        }
      }
      setAdding(templateId);
      try {
        await addSubtypeDesign(productId, Number(typeId), templateId, sizeId);
        await loadLinks();
        setModalOpen(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(msg.includes('409') ? 'Этот дизайн уже привязан к этому размеру' : `Ошибка: ${msg}`);
      } finally {
        setAdding(null);
      }
    },
    [productId, typeId, loadLinks, allTemplates, subtypeSizes, pagesConfig],
  );

  const handleRemove = useCallback(
    async (linkId: number) => {
      if (typeof productId !== 'number') return;
      if (!confirm('Убрать этот дизайн с размера?')) return;
      try {
        await removeSubtypeDesign(productId, linkId);
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      } catch {
        alert('Ошибка при удалении');
      }
    },
    [productId],
  );

  const modalSize = modalSizeId
    ? subtypeSizes.find((s) => String(s.id) === modalSizeId)
    : null;
  const modalLinks = modalSizeId ? linksBySize.get(modalSizeId) ?? [] : [];
  const linkedIds = new Set(modalLinks.map((l) => l.design_template_id));

  const selectedProduct = typeof productId === 'number'
    ? products.find((p) => p.id === productId)
    : undefined;

  return (
    <div className="design-template-bindings">
      <p className="design-templates-lead">
        Матрица привязок master-шаблонов к размерам подтипа. Источник правды для{' '}
        <code>GET /api/design-templates/public</code> — таблица <code>product_subtype_designs</code>.
      </p>

      <div className="design-template-bindings__filters">
        <label>
          Продукт
          <select
            value={productId === '' ? '' : String(productId)}
            onChange={(e) => {
              const v = e.target.value;
              setProductId(v ? Number(v) : '');
              setTypeId('');
            }}
          >
            <option value="">— выберите —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
            ))}
          </select>
        </label>
        {types.length > 0 && (
          <label>
            Подтип
            <select
              value={typeId === '' ? '' : String(typeId)}
              onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : '')}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name} (type {t.id})</option>
              ))}
            </select>
          </label>
        )}
        {selectedProduct && (
          <Button
            variant="secondary"
            onClick={() => navigate(`/adminpanel/products/${selectedProduct.id}`)}
          >
            <AppIcon name="edit" size="xs" /> Карточка продукта
          </Button>
        )}
      </div>

      {configLoading && <p className="design-templates-loading">Загрузка конфига…</p>}
      {configError && <p className="design-template-bindings__error">{configError}</p>}
      {linksError && <p className="design-template-bindings__error">{linksError}</p>}

      {typeof productId === 'number' && !configLoading && !configError && subtypeSizes.length === 0 && (
        <p className="design-templates-empty">
          У выбранного подтипа нет размеров. Добавьте форматы в карточке продукта.
        </p>
      )}

      {sizesMissingDesigns.length > 0 && (
        <div className="design-template-bindings__alert" role="alert">
          <AppIcon name="warning" size="xs" />
          <span>
            <strong>Нет дизайнов для размеров:</strong>{' '}
            {sizesMissingDesigns.map((s) => s.label || String(s.id)).join(', ')}
          </span>
        </div>
      )}

      {linksLoading && <p className="design-templates-loading">Загрузка привязок…</p>}

      {subtypeSizes.length > 0 && (
        <div className="design-template-bindings__matrix">
          {subtypeSizes.map((size) => {
            const sizeKey = String(size.id);
            const sizeLinks = linksBySize.get(sizeKey) ?? [];
            const missing = sizeLinks.length === 0;
            return (
              <section
                key={sizeKey}
                className={`design-template-bindings__size${missing ? ' design-template-bindings__size--missing' : ''}`}
              >
                <div className="design-template-bindings__size-header">
                  <div>
                    <h4>{size.label || sizeKey}</h4>
                    <span className="design-template-bindings__size-meta">
                      {size.width_mm}×{size.height_mm} мм · id: <code>{sizeKey}</code>
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => void openModalForSize(sizeKey)}>
                    <AppIcon name="plus" size="xs" /> Добавить
                  </Button>
                </div>
                {missing ? (
                  <p className="form-hint">Нет привязанных шаблонов.</p>
                ) : (
                  <div className="design-template-bindings__links">
                    {sizeLinks.map((link) => (
                      <div
                        key={link.id}
                        className={`design-template-bindings__link${
                          highlightTemplateId === link.design_template_id
                            ? ' design-template-bindings__link--highlight'
                            : ''
                        }`}
                      >
                        <div className="design-template-bindings__link-preview">
                          {link.preview_url ? (
                            <img
                              src={resolveTemplatePreviewUrl(link.preview_url, API_BASE_URL) ?? ''}
                              alt={link.name}
                            />
                          ) : (
                            <AppIcon name="image" size="sm" />
                          )}
                        </div>
                        <div className="design-template-bindings__link-info">
                          <span className="design-template-bindings__link-name">{link.name}</span>
                          <span className="design-template-bindings__link-id">#{link.design_template_id}</span>
                        </div>
                        <button
                          type="button"
                          className="design-template-bindings__unlink"
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
                Привязать макет — «{modalSize?.label ?? modalSizeId}»
              </h3>
              <button type="button" className="subtype-designs-modal__close" onClick={() => setModalOpen(false)}>
                <AppIcon name="x" size="sm" />
              </button>
            </div>
            {loadingTemplates ? (
              <p className="subtype-designs-modal__hint">Загрузка каталога…</p>
            ) : (
              <div className="subtype-designs-modal-grid">
                {allTemplates.map((t) => {
                  const alreadyLinked = linkedIds.has(t.id);
                  return (
                    <div key={t.id} className={`subtype-designs-modal-item${alreadyLinked ? ' is-linked' : ''}`}>
                      <div className="subtype-designs-modal-item__preview">
                        {t.preview_url ? (
                          <img
                            src={resolveTemplatePreviewUrl(t.preview_url, API_BASE_URL) ?? ''}
                            alt={t.name}
                          />
                        ) : (
                          <div className="subtype-designs-item__no-preview">
                            <AppIcon name="image" size="sm" />
                          </div>
                        )}
                      </div>
                      <div className="subtype-designs-modal-item__name">#{t.id} {t.name}</div>
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
