import { PricingService } from '../../../../types/pricing';

interface FilterOptions {
  search?: string;
  typeFilter?: string;
  sortBy?: 'name' | 'price' | 'type';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Фильтрует и сортирует услуги
 */
export function filterAndSortServices(
  services: PricingService[],
  options: FilterOptions
): PricingService[] {
  const {
    search = '',
    typeFilter = 'all',
    sortBy = 'name',
    sortOrder = 'asc',
  } = options;

  const filtered = services.filter((s) => {
    const matchesSearch = search
      ? `${s.name} ${s.type}`.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'price':
        comparison = a.rate - b.rate;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return sorted;
}
