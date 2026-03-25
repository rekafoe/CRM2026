import React, { useState, useEffect, useCallback } from 'react'
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
  /** Обрезные форматы выбранного подтипа — для предупреждения, если мм шаблона не совпадают */
  subtypeSizes?: SimplifiedSizeConfig[]
  /** Опции числа страниц подтипа (если заданы) */
  pagesConfig?: SimplifiedPagesConfig
}

export const SubtypeDesignsCard: React.FC<SubtypeDesignsCardProps> = ({
  productId,
  typeId,
  subtypeSizes,
  pagesConfig,
}) => {
  const [links, setLinks] = useState<SubtypeDesignLink[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Состояние модалки выбора
  const [modalOpen, setModalOpen] = useState(false)
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

  const openModal = useCallback(async () => {
    setModalOpen(true)
    if (allTemplates.length > 0) return
    setLoadingTemplates(true)
    try {
      const res = await getDesignTemplates()
      setAllTemplates(res.data.filter((t) => t.is_active))
    } catch {
      // ignore
    } finally {
      setLoadingTemplates(false)
    }
  }, [allTemplates.length])

  const handleAdd = useCallback(
    async (templateId: number) => {
      const t = allTemplates.find((x) => x.id === templateId)
      if (t) {
        const dim = parseDesignTemplateDimensions(t)
        if (dim) {
          if (subtypeSizes && subtypeSizes.length > 0 && !sizeMatchesTrimFormat(dim.width_mm, dim.height_mm, subtypeSizes)) {
            const ok = window.confirm(
              `Размер макета шаблона (${dim.width_mm}×${dim.height_mm} мм) не совпадает ни с одним обрезным форматом этого подтипа. Прикрепить всё равно?`,
            )
            if (!ok) return
          }
          if (pagesConfig?.options?.length && !pageCountAllowedForSubtype(dim.page_count, pagesConfig)) {
            const opts = pagesConfig.options.join(', ')
            const ok = window.confirm(
              `В шаблоне ${dim.page_count} стр., у подтипа допустимы страницы: ${opts}. Прикрепить всё равно?`,
            )
            if (!ok) return
          }
        }
      }
      setAdding(templateId)
      try {
        await addSubtypeDesign(productId, typeId, templateId)
        await load()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('409')) alert('Ошибка: ' + msg)
      } finally {
        setAdding(null)
      }
    },
    [productId, typeId, load, allTemplates, subtypeSizes, pagesConfig],
  )

  const handleRemove = useCallback(
    async (linkId: number) => {
      if (!confirm('Убрать этот дизайн из подтипа?')) return
      try {
        await removeSubtypeDesign(productId, linkId)
        setLinks((prev) => prev.filter((l) => l.id !== linkId))
      } catch {
        alert('Ошибка при удалении')
      }
    },
    [productId],
  )

  const linkedIds = new Set(links.map((l) => l.design_template_id))

  return (
    <div className="subtype-designs-card">
      <div className="subtype-designs-card__header">
        <h4 className="subtype-designs-card__title">
          <AppIcon name="image" size="xs" /> Готовые дизайны подтипа
        </h4>
        <Button variant="secondary" onClick={openModal}>
          <AppIcon name="plus" size="xs" /> Добавить дизайн
        </Button>
      </div>

      {error && <p className="subtype-designs-card__error">{error}</p>}

      {loading ? (
        <p className="subtype-designs-card__hint">Загрузка…</p>
      ) : links.length === 0 ? (
        <p className="subtype-designs-card__hint">
          Дизайны не привязаны. Нажмите «Добавить дизайн», чтобы выбрать шаблон из каталога — он будет
          предлагаться для этого подтипа. Размер макета в шаблоне желательно совпадать с обрезными
          форматами подтипа (иначе будет предупреждение).
        </p>
      ) : (
        <div className="subtype-designs-grid">
          {links.map((link) => (
            <div key={link.id} className="subtype-designs-item">
              <div className="subtype-designs-item__preview">
                {link.preview_url ? (
                  <img
                    src={link.preview_url}
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
                title="Убрать из подтипа"
              >
                <AppIcon name="x" size="xs" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Модалка выбора дизайна ── */}
      {modalOpen && (
        <div className="subtype-designs-modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="subtype-designs-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="subtype-designs-modal__header">
              <h3 className="subtype-designs-modal__title">Выбрать дизайн из каталога</h3>
              <button
                type="button"
                className="subtype-designs-modal__close"
                onClick={() => setModalOpen(false)}
              >
                <AppIcon name="x" size="sm" />
              </button>
            </div>

            {loadingTemplates ? (
              <p className="subtype-designs-modal__hint">Загрузка каталога…</p>
            ) : allTemplates.length === 0 ? (
              <p className="subtype-designs-modal__hint">
                Нет доступных дизайн-шаблонов. Создайте их в разделе{' '}
                <a href="/adminpanel/design-templates" target="_blank" rel="noopener noreferrer">
                  Дизайн-шаблоны
                </a>
                .
              </p>
            ) : (
              <div className="subtype-designs-modal-grid">
                {allTemplates.map((t) => {
                  const alreadyLinked = linkedIds.has(t.id)
                  return (
                    <div
                      key={t.id}
                      className={`subtype-designs-modal-item${alreadyLinked ? ' is-linked' : ''}`}
                    >
                      <div className="subtype-designs-modal-item__preview">
                        {t.preview_url ? (
                          <img
                            src={t.preview_url}
                            alt={t.name}
                            className="subtype-designs-item__img"
                          />
                        ) : (
                          <div className="subtype-designs-item__no-preview">
                            <AppIcon name="image" size="sm" />
                          </div>
                        )}
                      </div>
                      <div className="subtype-designs-modal-item__name">{t.name}</div>
                      {t.category && (
                        <div className="subtype-designs-modal-item__cat">{t.category}</div>
                      )}
                      <Button
                        variant={alreadyLinked ? 'secondary' : 'primary'}
                        onClick={() => !alreadyLinked && void handleAdd(t.id)}
                        disabled={alreadyLinked || adding === t.id}
                      >
                        {alreadyLinked
                          ? '✓ Привязан'
                          : adding === t.id
                            ? 'Добавление…'
                            : 'Прикрепить'}
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
