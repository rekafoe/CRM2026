import { buildPostalBlankHtml } from '../services/postalShipmentBlank'

describe('buildPostalBlankHtml', () => {
  it('пишет оплату нашим юрлицом и не берёт наложенный платёж', () => {
    const html = buildPostalBlankHtml({
      blankNumber: 'BP-4',
      carrier: 'belpost',
      orderNumber: 'ORD-1',
      recipientName: 'Иванов',
      recipientPhone: '+375291112233',
      recipientAddress: 'Минск, ул. Ленина, 1',
      places: 1,
      weightKg: 0.4,
      notes: '',
      trackingNumber: '',
      senderName: 'ООО Принт',
      senderUnp: '193679900',
      senderAddress: 'Минск, юр. адрес',
      senderPhone: '+375333365678',
      senderBank: 'BY00TEST',
      itemLines: ['Визитки × 100'],
    })

    expect(html).toContain('Белпочта')
    expect(html).toContain('ООО Принт')
    expect(html).toContain('193679900')
    expect(html).toContain('Оплата доставки: отправитель, юридическое лицо')
    expect(html).toContain('Наложенный платёж с получателя не взимается')
    expect(html).not.toContain('наложенным платежом')
  })

  it('для Европочты подставляет название перевозчика', () => {
    const html = buildPostalBlankHtml({
      blankNumber: 'EP-2',
      carrier: 'europost',
      orderNumber: 'ORD-2',
      recipientName: 'Петров',
      recipientPhone: '',
      recipientAddress: 'Пункт выдачи',
      places: 2,
      weightKg: null,
      notes: '',
      trackingNumber: '',
      senderName: 'ООО Принт',
      senderUnp: '',
      senderAddress: '',
      senderPhone: '',
      senderBank: '',
      itemLines: [],
    })
    expect(html).toContain('Европочта')
    expect(html).toContain('EP-2')
  })
})
