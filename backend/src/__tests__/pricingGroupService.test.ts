import {
  buildGroupKey,
  buildPricingGroups,
  configurationFromItemParams,
} from '../modules/pricing/services/pricingGroupService';

describe('pricingGroupService', () => {
  describe('buildGroupKey', () => {
    it('строит ключ по материалу и печати без priceType', () => {
      const key = buildGroupKey({
        material_id: 12,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
        priceType: 'online',
      });
      expect(key).toBe('12|laser_prof|color|single');
    });

    it('возвращает null без material_id', () => {
      expect(
        buildGroupKey({
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        })
      ).toBeNull();
    });

    it('нормализует sides 2 в duplex', () => {
      const key = buildGroupKey({
        material_id: 5,
        print_technology: 'laser_prof',
        print_color_mode: 'bw',
        sides: 2,
      });
      expect(key).toBe('5|laser_prof|bw|duplex');
    });
  });

  describe('buildPricingGroups', () => {
    it('суммирует листы в группе', () => {
      const config = {
        material_id: 1,
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      };
      const groups = buildPricingGroups([
        {
          lineId: 'a',
          productId: 10,
          quantity: 100,
          configuration: config,
          sheetsNeeded: 10,
        },
        {
          lineId: 'b',
          productId: 11,
          quantity: 200,
          configuration: config,
          sheetsNeeded: 20,
        },
      ]);
      expect(groups.size).toBe(1);
      const g = groups.get('1|laser_prof|color|single');
      expect(g?.totalSheets).toBe(30);
      expect(g?.lineIds).toEqual(['a', 'b']);
    });

    it('разделяет разный material_id', () => {
      const base = {
        print_technology: 'laser_prof',
        print_color_mode: 'color',
        print_sides_mode: 'single',
      };
      const groups = buildPricingGroups([
        {
          lineId: 1,
          productId: 10,
          quantity: 50,
          configuration: { ...base, material_id: 1 },
          sheetsNeeded: 5,
        },
        {
          lineId: 2,
          productId: 10,
          quantity: 50,
          configuration: { ...base, material_id: 2 },
          sheetsNeeded: 5,
        },
      ]);
      expect(groups.size).toBe(2);
    });
  });

  describe('configurationFromItemParams', () => {
    it('извлекает productId и sheetsNeeded из params', () => {
      const { productId, configuration, sheetsNeeded } = configurationFromItemParams({
        productId: 58,
        sheetsNeeded: 25,
        specifications: {
          size_id: '90x50',
          material_id: 12,
          print_technology: 'laser_prof',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        },
        priceType: 'online',
      });
      expect(productId).toBe(58);
      expect(sheetsNeeded).toBe(25);
      expect(configuration.material_id).toBe(12);
      expect(configuration.priceType).toBe('online');
    });
  });
});
