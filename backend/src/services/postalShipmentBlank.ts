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

function weightLabel(weightKg: number | null): string {
  return weightKg != null && Number.isFinite(weightKg)
    ? `${weightKg.toLocaleString('ru-RU')} кг`
    : '—'
}

function itemList(lines: string[]): string {
  const items = lines.length
    ? lines.map((line) => `<li>${escapePostalHtml(line)}</li>`).join('')
    : '<li>Состав заказа смотрите в CRM</li>'
  return `<ul>${items}</ul>`
}

function page(title: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapePostalHtml(title)}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; color: #111; margin: 18px; font-size: 13px; }
    h1 { font-size: 18px; margin: 0; letter-spacing: 0.04em; }
    .sub { margin: 2px 0 0; font-size: 14px; }
    .num { text-align: right; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #111; padding: 6px 8px; vertical-align: top; text-align: left; }
    .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #333; }
    .big { min-height: 72px; font-size: 15px; }
    ul { margin: 4px 0 0; padding-left: 18px; }
    .sign { margin-top: 18px; display: flex; gap: 24px; }
    .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 12px; }
    .foot { margin-top: 10px; font-size: 11px; color: #444; }
    ${css}
  </style>
</head>
<body>
${body}
</body>
</html>`
}

/** Сопроводительный адрес к посылке, поля ф. 116. Почтовый сбор — на отправителе-юрлице. */
function buildBelpostBlank(data: PostalBlankData): string {
  const weight = weightLabel(data.weightKg)
  const tracking = data.trackingNumber || 'присваивает Белпочта при приёме'
  return page(
    `Белпочта ф. 116 ${data.blankNumber}`,
    `.bp-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; }
     .formno { font-size: 20px; font-weight: 700; }`,
    `<header class="bp-head">
      <div>
        <h1>БЕЛПОЧТА</h1>
        <p class="sub">Сопроводительный адрес к посылке</p>
      </div>
      <div class="formno">ф. 116</div>
      <div class="num">
        <div>№ ${escapePostalHtml(data.blankNumber)}</div>
        <div>заказ ${escapePostalHtml(data.orderNumber)}</div>
      </div>
    </header>
    <table>
      <tr>
        <td class="big">
          <div class="k">Куда</div>
          <div>${escapePostalHtml(data.recipientAddress)}</div>
          <div class="k" style="margin-top:8px;">Кому</div>
          <div>${escapePostalHtml(data.recipientName)}</div>
          <div>${escapePostalHtml(data.recipientPhone || '—')}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="k">Откуда</div>
          <div>${escapePostalHtml(data.senderAddress || '—')}</div>
          <div class="k" style="margin-top:8px;">От кого</div>
          <div>${escapePostalHtml(data.senderName)}</div>
          <div>УНП ${escapePostalHtml(data.senderUnp || '—')}</div>
          <div>${escapePostalHtml(data.senderPhone || '—')}</div>
          ${data.senderBank ? `<div>${escapePostalHtml(data.senderBank)}</div>` : ''}
        </td>
      </tr>
    </table>
    <table style="margin-top:8px;">
      <tr><th>Вид отправления</th><td>Посылка</td><th>Мест</th><td>${escapePostalHtml(data.places)}</td></tr>
      <tr><th>Вес</th><td>${escapePostalHtml(weight)}</td><th>ШПИ</th><td>${escapePostalHtml(tracking)}</td></tr>
      <tr><th>Объявленная ценность</th><td colspan="3">____________________ BYN</td></tr>
      <tr>
        <th>Наложенный платёж</th>
        <td colspan="3"><strong>Наложенный платёж с получателя не взимается.</strong></td>
      </tr>
      <tr>
        <th>Почтовый сбор</th>
        <td colspan="3">Оплата доставки: отправитель, юридическое лицо. Сбор оплачивает ${escapePostalHtml(data.senderName)} по договору с Белпочтой.</td>
      </tr>
    </table>
    <table style="margin-top:8px;">
      <tr>
        <td>
          <div class="k">Вложение</div>
          ${itemList(data.itemLines)}
          ${data.notes ? `<div>Примечание: ${escapePostalHtml(data.notes)}</div>` : ''}
        </td>
      </tr>
    </table>
    <div class="sign">
      <div>Сдал отправитель</div>
      <div>Календарный штемпель Белпочты</div>
    </div>
    <p class="foot">Печатная форма CRM по полям сопроводительного адреса ф. 116. Номер ШПИ ставит отделение при приёме.</p>`,
  )
}

/** Накладная Европочты: плательщик услуг — отправитель, наложенный платёж нулевой. */
function buildEuropostBlank(data: PostalBlankData): string {
  const weight = weightLabel(data.weightKg)
  const tracking = data.trackingNumber || 'присваивает Европочта при приёме'
  return page(
    `Европочта накладная ${data.blankNumber}`,
    `.ep-head { display: flex; justify-content: space-between; align-items: center; background: #111; color: #fff; padding: 10px 12px; margin-bottom: 8px; }
     .ep-head h1, .ep-head p { color: #fff; }
     .payer { font-size: 15px; font-weight: 700; }`,
    `<header class="ep-head">
      <div>
        <h1>ЕВРОПОЧТА</h1>
        <p class="sub">Накладная на отправление</p>
      </div>
      <div class="num">
        <div>№ ${escapePostalHtml(data.blankNumber)}</div>
        <div>заказ ${escapePostalHtml(data.orderNumber)}</div>
      </div>
    </header>
    <table>
      <tr>
        <th style="width:28%;">Отправитель</th>
        <td>
          <div>${escapePostalHtml(data.senderName)}</div>
          <div>УНП ${escapePostalHtml(data.senderUnp || '—')}</div>
          <div>${escapePostalHtml(data.senderAddress || '—')}</div>
          <div>${escapePostalHtml(data.senderPhone || '—')}</div>
          ${data.senderBank ? `<div>${escapePostalHtml(data.senderBank)}</div>` : ''}
        </td>
      </tr>
      <tr>
        <th>Плательщик услуг</th>
        <td class="payer">Отправитель, юридическое лицо. Оплата доставки: отправитель, юридическое лицо.</td>
      </tr>
      <tr>
        <th>Получатель</th>
        <td>${escapePostalHtml(data.recipientName)}</td>
      </tr>
      <tr>
        <th>Телефон получателя</th>
        <td style="font-size:16px;">${escapePostalHtml(data.recipientPhone || '—')}</td>
      </tr>
      <tr>
        <th>Пункт выдачи или адрес</th>
        <td class="big">${escapePostalHtml(data.recipientAddress)}</td>
      </tr>
      <tr>
        <th>Мест / вес</th>
        <td>${escapePostalHtml(data.places)} мест · ${escapePostalHtml(weight)}</td>
      </tr>
      <tr>
        <th>Номер отправления</th>
        <td>${escapePostalHtml(tracking)}</td>
      </tr>
      <tr>
        <th>Наложенный платёж</th>
        <td><strong>0,00 BYN. Наложенный платёж с получателя не взимается.</strong></td>
      </tr>
      <tr>
        <td colspan="2">
          <div class="k">Опись вложения</div>
          ${itemList(data.itemLines)}
          ${data.notes ? `<div>Примечание: ${escapePostalHtml(data.notes)}</div>` : ''}
        </td>
      </tr>
    </table>
    <div class="sign">
      <div>Сдал отправитель</div>
      <div>Принял сотрудник Европочты</div>
    </div>
    <p class="foot">Печатная форма CRM, накладная Европочты. Номер отправления ставит пункт при приёме.</p>`,
  )
}

export function buildPostalBlankHtml(data: PostalBlankData): string {
  return data.carrier === 'europost' ? buildEuropostBlank(data) : buildBelpostBlank(data)
}
