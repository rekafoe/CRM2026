import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/common'
import { AppIcon } from '../../../components/ui/AppIcon'
import {
  getSubtypeDesigns,
  addSubtypeDesign,
  removeSubtypeDesign,
  getDesignTemplates,
  type SubtypeDesignLink,
  type DesignTemplate,
} from '../../../api'
import type { SimplifiedPagesConfig, SimplifiedSizeConfig } from '../hooks/useProductTemplate'
import {
  pageCountAllowedForSubtype,
  parseDesignTemplateDimensions,
  sizeMatchesTrimFormat,
} from '../utils/designTemplateSpec'

interface SubtypeDesignsCardProps {
  productId: number
  typeId: number
  subtypeSizes: SimplifiedSizeConfig[]
  pagesConfig?: SimplifiedPagesConfig
}

const LEGACY_SIZE_KEY = ''

export const SubtypeDesignsCard: React.FC<SubtypeDesignsCardProps> = ({
  productId,
  typeId,
  subtypeSizes,
  pagesConfig,
}) => {
  const [links, setLinks] = useState<SubtypeDesignLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSizeId, setModalSizeId] = useState<string | null>(null)
  const [allTemplates, setAllTemplates] = useState<DesignTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!productId || !typeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await getSubtypeDesigns(productId, typeId)
      setLinks(res.data)
    } catch {
      setError('Не удалось загрузить дизайны')
    } finally {
      setLoading(false)
    }
  }, [productId, typeId])

  useEffect(() => {
    void load()
  }, [load])

  const linksBySize = useMemo(() => {
    const map = new Map<string, SubtypeDesignLink[]>()
    for (const link of links) {
      const key = link.size_id?.trim() || LEGACY_SIZE_KEY
      const list = map.get(key) ?? []
      list.push(link)
      map.set(key, list)
    }
    return map
  }, [links])

  const legacyLinks = linksBySize.get(LEGACY_SIZE_KEY) ?? []

  const sizesMissingDesigns = useMemo(() => {
    if (subtypeSizes.length === 0) return []
    return subtypeSizes.filter((size) => {
      const key = String(size.id)
      return !(linksBySize.get(key)?.length)
    })
  }, [subtypeSizes, linksBySize])

  const openModalForSize = useCallback(async (sizeId: string) => {
    setModalSizeId(sizeId)
    setModalOpen(true)
    if (allTemplates.length > 0) return
    setLoadingTemplates(true)
    try {
      const res = await getDesignTemplates()
      setAllTemplates(res.data.filter((t) => t.is_active === 1))
    } catch {
      // ignore
    } finally {
      setLoadingTemplates(false)
    }
  }, [allTemplates.length])

  const handleAdd = useCallback(
    async (templateId: number, sizeId: string) => {
      const size = subtypeSizes.find((s) => String(s.id) === sizeId)
      const t = allTemplates.find((x) => x.id === templateId)
      if (t && size) {
        const dim = parseDesignTemplateDimensions(t)
        if (dim && !sizeMatchesTrimFormat(dim.width_mm, dim.height_mm, [size])) {
          const ok = window.confirm(
            `Размер макета (${dim.width_mm}×${dim.height_mm} мм) не совпадает с форматом «${size.label}» (${size.width_mm}×${size.height_mm} мм). Прикрепить всё равно?`,
          )
          if (!ok) return
        }
        if (dim && pagesConfig?.options?.length && !pageCountAllowedForSubtype(dim.page_count, pagesConfig)) {
          const ok = window.confirm(
            `В шаблоне ${dim.page_count} стр., у подтипа допустимы: ${pagesConfig.options.join(', ')}. Прикрепить всё равно?`,
          )
          if (!ok) return
        }
      }
      setAdding(templateId)
      try {
        await addSubtypeDesign(productId, typeId, templateId, sizeId)
        await load()
        setModalOpen(false)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        alert(msg.includes('409') ? 'Этот дизайн уже привязан к этому размеру' : `Ошибка: ${msg}`)
      } finally {
        setAdding(null)
      }
    },
    [productId, typeId, load, allTemplates, subtypeSizes, pagesConfig],
  )

  const handleRemove = useCallback(
    async (linkId: number) => {
      if (!confirm('Убрать этот дизайн с размера?')) return
      try {
        await removeSubtypeDesign(productId, linkId)
        setLinks((prev) => prev.filter((l) => l.id !== linkId))
      } catch {
        alert('Ошибка при удалении')
      }
    },
    [productId],
  )

  const modalSize = modalSizeId
    ? subtypeSizes.find((s) => String(s.id) === modalSizeId)
    : null
  const modalLinks = modalSizeId ? linksBySize.get(modalSizeId) ?? [] : []
  const linkedIds = new Set(modalLinks.map((l) => l.design_template_id))

  if (subtypeSizes.length === 0) {
    return (
      <div className="subtype-designs-card">
        <p className="subtype-designs-card__hint subtype-designs-card__hint--warn">
          У подтипа нет размеров в конфиге. Сначала добавьте форматы (мм) на вкладке «Размеры», затем привязывайте дизайны к каждому размеру.
        </p>
        {legacyLinks.length > 0 && (
          <p className="subtype-designs-card__hint">
            Есть устаревшие привязки без размера ({legacyLinks.length}). Перепривяжите их к конкретным форматам после настройки размеров.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="subtype-designs-card">
      <div className="subtype-designs-card__header">
        <h4 className="subtype-designs-card__title">
          <AppIcon name="image" size="xs" /> Дизайны по размерам подтипа
        </h4>
        <Link
          className="subtype-designs-card__matrix-link"
          to={`/adminpanel/design-templates?tab=bindings&productId=${productId}&typeId=${typeId}`}
        >
          <AppIcon name="link" size="xs" /> Полная матрица в каталоге
        </Link>
      </div>
      <p className="subtype-designs-card__hint">
        Для каждого обрезного формата подтипа нужен хотя бы один активный шаблон. Сайт запрашивает каталог с{' '}
        <code>sizeId</code>, совпадающим с <code>sizes[].id</code> в продукте.
      </p>

      {sizesMissingDesigns.length > 0 && (
        <div className="subtype-designs-coverage-alert" role="alert">
          <strong>Нет дизайнов для размеров:</strong>{' '}
          {sizesMissingDesigns.map((s) => s.label || String(s.id)).join(', ')}
        </div>
      )}

      {error && <p className="subtype-designs-card__error">{error}</p>}
      {loading && <p className="subtype-designs-card__hint">Загрузка…</p>}

      <div className="subtype-designs-by-size">
        {subtypeSizes.map((size) => {
          const sizeKey = String(size.id)
          const sizeLinks = linksBySize.get(sizeKey) ?? []
          const missing = sizeLinks.length === 0
          return (
            <section
              key={sizeKey}
              className={`subtype-designs-size-block${missing ? ' subtype-designs-size-block--missing' : ''}`}
            >
              <div className="subtype-designs-size-block__header">
                <div>
                  <h5>{size.label || sizeKey}</h5>
                  <span className="subtype-designs-size-block__meta">
                    {size.width_mm}×{size.height_mm} мм · id: <code>{sizeKey}</code>
                  </span>
                </div>
                <Button variant="secondary" onClick={() => void openModalForSize(sizeKey)}>
                  <AppIcon name="plus" size="xs" /> Добавить
                </Button>
              </div>
              {missing ? (
                <p className="subtype-designs-card__hint">Нет привязанных шаблонов — клиент не увидит макеты для этого размера.</p>
              ) : (
                <div className="subtype-designs-grid">
                  {sizeLinks.map((link) => (
                    <div key={link.id} className="subtype-designs-item">
                      <div className="subtype-designs-item__preview">
                        {link.preview_url ? (
                          <img src={link.preview_url} alt={link.name} className="subtype-designs-item__img" />
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
                        title="Убрать с этого размера"
                      >
                        <AppIcon name="x" size="xs" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {legacyLinks.length > 0 && (
        <section className="subtype-designs-legacy">
          <h5>Устаревшие привязки (без размера)</h5>
          <p className="subtype-designs-card__hint">
            Перенесите шаблоны в блоки размеров выше и удалите старые связи.
          </p>
          <div className="subtype-designs-grid">
            {legacyLinks.map((link) => (
              <div key={link.id} className="subtype-designs-item">
                <div className="subtype-designs-item__name">{link.name}</div>
                <button type="button" className="subtype-designs-item__remove" onClick={() => void handleRemove(link.id)}>
                  <AppIcon name="x" size="xs" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {modalOpen && modalSizeId && (
        <div className="subtype-designs-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="subtype-designs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="subtype-designs-modal__header">
              <h3 className="subtype-designs-modal__title">
                Дизайн для «{modalSize?.label ?? modalSizeId}»
              </h3>
              <button type="button" className="subtype-designs-modal__close" onClick={() => setModalOpen(false)}>
                <AppIcon name="x" size="sm" />
              </button>
            </div>
            <p className="subtype-designs-modal__hint">
              sizeId для сайта: <code>{modalSizeId}</code>
              {modalSize ? ` · ${modalSize.width_mm}×${modalSize.height_mm} мм` : ''}
            </p>

            {loadingTemplates ? (
              <p className="subtype-designs-modal__hint">Загрузка каталога…</p>
            ) : allTemplates.length === 0 ? (
              <p className="subtype-designs-modal__hint">
                Нет шаблонов. Создайте в{' '}
                <a href="/adminpanel/design-templates" target="_blank" rel="noopener noreferrer">
                  каталоге шаблонов
                </a>
                .
              </p>
            ) : (
              <div className="subtype-designs-modal-grid">
                {allTemplates.map((t) => {
                  const alreadyLinked = linkedIds.has(t.id)
                  return (
                    <div key={t.id} className={`subtype-designs-modal-item${alreadyLinked ? ' is-linked' : ''}`}>
                      <div className="subtype-designs-modal-item__preview">
                        {t.preview_url ? (
                          <img src={t.preview_url} alt={t.name} className="subtype-designs-item__img" />
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
                        {alreadyLinked ? '✓ Привязан' : adding === t.id ? 'Добавление…' : 'Прикрепить'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
