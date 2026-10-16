import { chooseClientPrintTechnologyNames } from '../modules/products/routes/clientPrintTechnologyLabel'

describe('chooseClientPrintTechnologyNames', () => {
  it('берёт технологию для помещения, отмеченную по умолчанию', () => {
    const names = chooseClientPrintTechnologyNames([
      {
        material_type_id: 12,
        technology_name: 'Широкоформатная печать',
        is_default: 1,
        priority: 1,
        supports_indoor: 0,
        supports_outdoor: 1,
      },
      {
        material_type_id: 12,
        technology_name: 'Лазерная профессиональная печать',
        is_default: 1,
        priority: 10,
        supports_indoor: 1,
        supports_outdoor: 0,
      },
      {
        material_type_id: 12,
        technology_name: 'Цифровая печать',
        is_default: 0,
        priority: 1,
        supports_indoor: 1,
        supports_outdoor: 0,
      },
    ])

    expect(names.get(12)).toBe('Лазерная профессиональная печать')
  })
})