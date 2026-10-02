import { buildPostalBlankHtml, type PostalBlankData } from '../services/postalShipmentBlank'

const base: PostalBlankData = {
  blankNumber: 'BP-4',
  carrier: 'belpost',
  orderNumber: 'ORD-1',
  recipientName: 'Иванов',
  recipientPhone: '+375291112233',
  recipientAddress: 'Минск, ул. Ленина, 1',
  places: 1,
  weightKg: 0.4,
  codAmount: null,
  declaredValue: null,
  notes: '',
  trackingNumber: '',
  senderName: 'ООО Принт',
  senderUnp: '193679900',
  senderAddress: 'Минск, юр. адрес',
  senderPhone: '+375333365678',
  senderBank: 'BY00TEST',
  itemLines: ['Визитки × 100'],
}

describe('buildPostalBlankHtml', () => {
  it('для Белпочты печатает сопроводительный адрес ф. 116 с оплатой нашим юрлицом', () => {
    const html = buildPostalBlankHtml(base)

    expect(html).toContain('БЕЛПОЧТА')
    expect(html).toContain('Сопроводительный адрес к посылке')
    expect(html).toContain('ф. 116')
    expect(html).toContain('Куда')
    expect(html).toContain('Кому')
    expect(html).toContain('Откуда')
    expect(html).toContain('От кого')
    expect(html).toContain('ООО Принт')
    expect(html).toContain('193679900')
    expect(html).toContain('Оплата доставки: отправитель, юридическое лицо')
    expect(html).toContain('Наложенный платёж с получателя не взимается')
    expect(html).not.toContain('Накладная на отправление')
    expect(html).not.toContain('наложенным платежом')
  })

  it('на ф. 116 пишет сумму наложенного платежа, почтовый сбор оставляет на отправителе', () => {
    const html = buildPostalBlankHtml({
      ...base,
      codAmount: 85.5,
      declaredValue: 90,
    })

    expect(html).toContain('85,50 BYN')
    expect(html).toContain('90,00 BYN')
    expect(html).toContain('Сумму принимает Белпочта у получателя и перечисляет отправителю')
    expect(html).toContain('Оплата доставки: отправитель, юридическое лицо')
    expect(html).not.toContain('Наложенный платёж с получателя не взимается')
  })

  it('для Европочты печатает отдельную накладную, а не ф. 116', () => {
    const html = buildPostalBlankHtml({
      ...base,
      blankNumber: 'EP-2',
      carrier: 'europost',
      orderNumber: 'ORD-2',
      recipientName: 'Петров',
      recipientPhone: '+375291000000',
      recipientAddress: 'Пункт выдачи 42',
      places: 2,
      weightKg: null,
      codAmount: 85.5,
      declaredValue: 90,
      senderUnp: '',
    })

    expect(html).not.toContain('85,50 BYN')

    expect(html).toContain('ЕВРОПОЧТА')
    expect(html).toContain('Накладная на отправление')
    expect(html).toContain('EP-2')
    expect(html).toContain('Плательщик услуг')
    expect(html).toContain('Пункт выдачи или адрес')
    expect(html).toContain('Телефон получателя')
    expect(html).toContain('0,00 BYN')
    expect(html).toContain('Оплата доставки: отправитель, юридическое лицо')
    expect(html).toContain('Наложенный платёж с получателя не взимается')
    expect(html).not.toContain('Сопроводительный адрес к посылке')
    expect(html).not.toContain('ф. 116')
  })
})
