export type PostalCarrier = 'belpost' | 'europost'

export type PostalBlankData = {
  blankNumber: string
  carrier: PostalCarrier
  orderNumber: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  places: number
  weightKg: number | null
  notes: string
  trackingNumber: string
  senderName: string
  senderUnp: string
  senderAddress: string
  senderPhone: string
  senderBank: string
  itemLines: string[]
}

const CARRIER_TITLE: Record<PostalCarrier, string> = {
  belpost: 'Белпочта',
  europost: 'Европочта',
}

export function postalCarrierTitle(carrier: PostalCarrier): string {
  return CARRIER_TITLE[carrier]
}

export function escapePostalHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPostalBlankHtml(data: PostalBlankData): string {
  const carrier = postalCarrierTitle(data.carrier)
  const items = data.itemLines.length
    ? data.itemLines.map((line) => `<li>${escapePostalHtml(line)}</li>`).join('')
    : '<li>Состав заказа смотрите в CRM</li>'
  const weight = data.weightKg != null && Number.isFinite(data.weightKg)
    ? `${data.weightKg.toLocaleString('ru-RU')} кг`
    : '—'
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Бланк ${escapePostalHtml(carrier)} ${escapePostalHtml(data.blankNumber)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .muted { color: #555; margin: 0 0 16px; }
    .pay { border: 2px solid #111; padding: 10px 12px; margin: 0 0 16px; }
    .pay strong { display: block; margin-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    section { border: 1px solid #ccc; padding: 10px 12px; }
    h2 { font-size: 14px; margin: 0 0 8px; }
    p { margin: 0 0 4px; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    .sign { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; }
    .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; }
  </style>
</head>
<body>
  <h1>Бланк отправки · ${escapePostalHtml(carrier)}</h1>
  <p class="muted">№ ${escapePostalHtml(data.blankNumber)} · заказ ${escapePostalHtml(data.orderNumber)}</p>
  <div class="pay">
    <strong>Оплата доставки: отправитель, юридическое лицо</strong>
    Доставку оплачивает наша организация по договору с ${escapePostalHtml(carrier)}.
    Наложенный платёж с получателя не взимается.
  </div>
  <div class="grid">
    <section>
      <h2>Отправитель и плательщик</h2>
      <p>${escapePostalHtml(data.senderName)}</p>
      <p>УНП ${escapePostalHtml(data.senderUnp || '—')}</p>
      <p>${escapePostalHtml(data.senderAddress || '—')}</p>
      <p>${escapePostalHtml(data.senderPhone || '—')}</p>
      <p>${escapePostalHtml(data.senderBank || '')}</p>
    </section>
    <section>
      <h2>Получатель</h2>
      <p>${escapePostalHtml(data.recipientName)}</p>
      <p>${escapePostalHtml(data.recipientPhone || '—')}</p>
      <p>${escapePostalHtml(data.recipientAddress)}</p>
    </section>
  </div>
  <section style="margin-top: 12px;">
    <h2>Отправление</h2>
    <p>Мест: ${escapePostalHtml(data.places)} · Вес: ${escapePostalHtml(weight)}</p>
    <p>Трек: ${escapePostalHtml(data.trackingNumber || 'будет после приёма')}</p>
    ${data.notes ? `<p>Примечание: ${escapePostalHtml(data.notes)}</p>` : ''}
    <ul>${items}</ul>
  </section>
  <div class="sign">
    <div>Отправитель</div>
    <div>Принято ${escapePostalHtml(carrier)}</div>
  </div>
</body>
</html>`
}
