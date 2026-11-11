import fs from 'fs'
import path from 'path'
import {
  extractPostprintServiceIds,
  groupPostprintServices,
  pickRecentServices,
  postprintGroupStartsCollapsed,
  postprintNameMatches,
  rankRecentPostprintServiceIds,
  selectPostprintService,
  clearPostprintServiceSelection,
  isPostprintServiceSelected,
} from '../modules/pricing/services/postprintPickerModel'

describe('postprint picker', () => {
  it('frontend и backend держат одну логику', () => {
    const backend = fs.readFileSync(
      path.join(__dirname, '../modules/pricing/services/postprintPickerModel.ts'),
      'utf8',
    )
    const frontend = fs.readFileSync(
      path.join(__dirname, '../../../frontend/src/components/calculator/components/postprintPicker.ts'),
      'utf8',
    )
    expect(backend).toBe(frontend)
  })

  it('фильтрует по названию с первой буквы, без учёта регистра и ё', () => {
    expect(postprintNameMatches('Ламинация матовая', 'л')).toBe(true)
    expect(postprintNameMatches('Резка', 'л')).toBe(false)
    expect(postprintNameMatches('Берёзка', 'берез')).toBe(true)
    expect(postprintNameMatches('Скругление', '   ')).toBe(true)
  })

  it('кладёт услуги в существующую категорию, а без неё — в ламинацию, резку или скругление', () => {
    const groups = groupPostprintServices(
      [
        { name: 'Своя', categoryName: 'Без категории' },
        { name: 'КБС', categoryName: 'Переплёты' },
        { name: 'Резка визиток', categoryName: null },
        { name: 'Ламинация глянцевая', categoryName: '' },
        { name: 'Плёнка в категории', categoryName: 'ШФП послепечатка' },
        { name: 'Скругление углов', categoryName: 'Без категории' },
      ],
      '',
    )
    expect(groups.map((group) => group.categoryName)).toEqual([
      'Ламинация',
      'Резка',
      'Скругление',
      'Переплёты',
      'ШФП послепечатка',
      'Без категории',
    ])
    expect(groups.find((group) => group.categoryName === 'ШФП послепечатка')?.services.map((service) => service.name)).toEqual([
      'Плёнка в категории',
    ])
  })

  it('с первой буквы оставляет только совпадения и прячет пустые группы', () => {
    const groups = groupPostprintServices(
      [
        { name: 'Ламинация матовая', categoryName: 'Ламинация' },
        { name: 'Ламинация глянцевая', categoryName: 'Ламинация' },
        { name: 'Резка', categoryName: 'Резка' },
      ],
      'глян',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].services.map((service) => service.name)).toEqual(['Ламинация глянцевая'])
    expect(groups[0].totalInGroup).toBe(2)
  })

  it('группа больше пяти позиций считается свёрнутой по умолчанию', () => {
    expect(postprintGroupStartsCollapsed(5)).toBe(false)
    expect(postprintGroupStartsCollapsed(6)).toBe(true)
  })

  it('сначала услуги этого заказа, потом менеджера, без печати и дублей', () => {
    const ids = rankRecentPostprintServiceIds(
      [
        {
          itemId: 2,
          orderId: 10,
          params: {
            postprintOperations: [{ serviceId: 9 }, { serviceId: 4 }],
          },
        },
        {
          itemId: 1,
          orderId: 10,
          params: JSON.stringify({
            selectedOperations: [{ operationId: 7 }],
            services: [{ operationId: 3, operationType: 'print' }],
          }),
        },
      ],
      [
        {
          itemId: 100,
          orderId: 11,
          params: {
            services: [
              { operationId: 9, operationType: 'laminate' },
              { operationId: 8, operationType: 'cut' },
            ],
          },
        },
        {
          itemId: 50,
          orderId: 12,
          params: '{not json',
        },
      ],
      5,
    )
    expect(ids).toEqual([9, 4, 7, 8])
  })

  it('услуги без типа операции не вытесняют явные послепечатные', () => {
    const ids = rankRecentPostprintServiceIds(
      [],
      [
        {
          itemId: 3,
          orderId: 1,
          params: { services: [{ operationId: 11, operationType: 'cut' }] },
        },
        {
          itemId: 4,
          orderId: 1,
          params: { services: [{ operationId: 12 }] },
        },
      ],
      5,
    )
    expect(ids).toEqual([11, 12])
    expect(extractPostprintServiceIds({ services: [{ operationId: 1, operationType: 'print' }] })).toEqual({
      strong: [],
      weak: [],
    })
  })

  it('недавние идут по свежести и не длиннее полки', () => {
    const services = [
      { serviceId: 4, name: 'Резка' },
      { serviceId: 9, name: 'Ламинация' },
      { serviceId: 8, name: 'Скругление' },
      { serviceId: 3, name: 'Люверсы' },
    ]
    expect(pickRecentServices(services, [9, 100, 4, 8, 3], '', 2).map((service) => service.serviceId)).toEqual([9, 4])
    expect(pickRecentServices(services, [9, 100, 4, 8, 3], 'л', 5).map((service) => service.serviceId)).toEqual([9, 8, 3])
  })

  it('выбор и снятие услуги чистят ключи вариантов', () => {
    const service = {
      serviceId: 5,
      name: 'Ламинация',
      minQuantity: 2,
      parentVariants: [{ id: 10 }],
      variants: [
        { key: '5:20', parentVariantId: 10 },
        { key: '5:21', parentVariantId: 11 },
      ],
    }
    const selected = selectPostprintService({ '5:21': 3, '9': 1 }, service)
    expect(selected).toEqual({ '9': 1, '5:20': 2 })
    expect(isPostprintServiceSelected(5, selected)).toBe(true)
    expect(clearPostprintServiceSelection(selected, 5)).toEqual({ '9': 1 })
  })
})
