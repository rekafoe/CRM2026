import { compactSimplifiedForSite } from '../modules/products/routes/helpers'

describe('compact material-driven schema', () => {
  it('keeps client print modes but hides technology codes and prices', () => {
    const compact = compactSimplifiedForSite({
      material_driven_printing: true,
      types: [{ id: 10, name: 'Прямоугольные' }],
      typeConfigs: {
        '10': {
          initial: {
            material_id: 10,
            print_technology: 'laser_sheet',
            color_mode: 'color',
          },
          sizes: [],
        },
      },
      sizes: [
        {
          id: 1,
          label: '20×30 мм',
          width_mm: 20,
          height_mm: 30,
          allowed_material_ids: [10, 11],
          print_prices: [
            {
              technology_code: 'laser_sheet',
              color_mode: 'color',
              sides_mode: 'single',
              tiers: [{ min_qty: 1, unit_price: 1 }],
            },
            {
              technology_code: 'inkjet_solvent',
              color_mode: 'color',
              sides_mode: 'single',
              tiers: [{ min_qty: 1, unit_price: 2 }],
            },
          ],
        },
      ],
    })

    expect(compact.material_driven_printing).toBe(true)
    expect(compact.sizes[0].allowed_material_ids).toEqual([10, 11])
    expect(compact.sizes[0].print_prices).toBeUndefined()
    expect(compact.sizes[0].print_options).toEqual({
      color_modes: ['color'],
      sides_modes: ['single'],
    })
    expect(JSON.stringify(compact)).not.toContain('laser_sheet')
    expect(JSON.stringify(compact)).not.toContain('inkjet_solvent')
    expect(compact.typeConfigs['10'].initial).toEqual({
      material_id: 10,
      color_mode: 'color',
    })
  })

  it('preserves legacy compact print prices when the flag is off', () => {
    const compact = compactSimplifiedForSite({
      sizes: [
        {
          id: 1,
          label: 'A4',
          width_mm: 210,
          height_mm: 297,
          print_prices: [
            {
              technology_code: 'laser_sheet',
              color_mode: 'color',
              sides_mode: 'single',
              tiers: [{ min_qty: 1, unit_price: 1 }],
            },
          ],
        },
      ],
    })

    expect(compact.material_driven_printing).toBe(false)
    expect(compact.sizes[0].print_prices).toEqual([
      {
        technology_code: 'laser_sheet',
        color_mode: 'color',
        sides_mode: 'single',
      },
    ])
  })
})
