import React, { useEffect, useState } from 'react'
import { Button } from '../../../components/common'
import { updateProduct } from '../../../services/products'

type Props = {
  productId: number
  routeKey: string | null | undefined
  onSaved?: () => void
}

/** Редактирование route_key на странице шаблона (без перехода в карточку продукта). */
export function TemplateProductRouteKey({ productId, routeKey, onSaved }: Props) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(routeKey != null && String(routeKey).trim() ? String(routeKey).trim() : '')
  }, [routeKey, productId])

  const save = async () => {
    const normalized = draft.trim().toLowerCase()
    try {
      setSaving(true)
      await updateProduct(productId, { route_key: normalized || null } as any)
      onSaved?.()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '')
          : ''
      console.error(e)
      alert(msg || 'Не удалось сохранить ключ. Проверьте уникальность и формат (латиница, цифры, дефис).')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="template-product-route-key simplified-card" style={{ marginBottom: 12, padding: 12 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Ключ URL продукта (route_key)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ flex: '1 1 200px', minWidth: 0 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="например: fotopechat"
          autoComplete="off"
        />
        <Button type="button" size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? '…' : 'Сохранить'}
        </Button>
      </div>
      <p className="text-muted text-sm" style={{ margin: '8px 0 0' }}>
        Сохраняется в продукт (не в JSON шаблона). Нужен для ЧПУ вместо числового id в ссылке на калькулятор.
      </p>
    </div>
  )
}
