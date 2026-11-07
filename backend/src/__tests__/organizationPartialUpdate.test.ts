/**
 * Логика частичного PUT organizations: поля без ключа в body сохраняются.
 * Регрессия: логотип из ReceiptTemplateEditor слал только { logo_url } и затирал name/UNP/VAT.
 */
function mergeOrganizationPut(
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const pick = <T,>(key: string, fallback: T): T =>
    Object.prototype.hasOwnProperty.call(body, key) ? (body[key] as T) : fallback

  const name = pick<string | null>('name', existing.name as string | null) ?? ''
  const unp = pick<string | null>('unp', (existing.unp as string | null) ?? null)
  const logo_url = pick<string | null>('logo_url', (existing.logo_url as string | null) ?? null)
  const is_default = Object.prototype.hasOwnProperty.call(body, 'is_default')
    ? Boolean(body.is_default)
    : Boolean(existing.is_default)
  const sort_order = Object.prototype.hasOwnProperty.call(body, 'sort_order')
    ? (body.sort_order != null ? Number(body.sort_order) : 0)
    : Number(existing.sort_order ?? 0)

  let vat_rate = existing.vat_rate
  if (Object.prototype.hasOwnProperty.call(body, 'vat_rate')) {
    const rawVat = body.vat_rate
    const parsed = rawVat == null || rawVat === '' ? null : Number(rawVat)
    vat_rate = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return { name, unp, logo_url, is_default: is_default ? 1 : 0, sort_order, vat_rate }
}

describe('organization partial PUT merge', () => {
  const existing = {
    name: 'ООО Печать',
    unp: '100000000',
    logo_url: 'old.png',
    is_default: 1,
    sort_order: 3,
    vat_rate: 20,
  }

  it('logo-only body keeps name, unp, default flag, sort and vat_rate', () => {
    expect(mergeOrganizationPut(existing, { logo_url: 'data:image/png;base64,abc' })).toEqual({
      name: 'ООО Печать',
      unp: '100000000',
      logo_url: 'data:image/png;base64,abc',
      is_default: 1,
      sort_order: 3,
      vat_rate: 20,
    })
  })

  it('explicit vat_rate null clears VAT; omitted leaves it', () => {
    expect(mergeOrganizationPut(existing, { vat_rate: null }).vat_rate).toBeNull()
    expect(mergeOrganizationPut(existing, { name: 'Новое' }).vat_rate).toBe(20)
  })
})
