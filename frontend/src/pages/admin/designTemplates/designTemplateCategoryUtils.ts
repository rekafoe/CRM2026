import type { DesignTemplate } from '../../../api';
import type { DesignTemplateCategory } from '../../../api';

export const UNCATEGORIZED_KEY = '__uncategorized__';

export type DesignTemplateCategorySection = {
  key: string;
  label: string;
  items: DesignTemplate[];
  categoryId?: number;
};

export function buildCategorySections(
  templates: DesignTemplate[],
  registry: DesignTemplateCategory[],
  options?: { showEmptyCategories?: boolean },
): DesignTemplateCategorySection[] {
  const showEmpty = options?.showEmptyCategories ?? false;
  const buckets = new Map<string, DesignTemplate[]>();

  const put = (key: string, template: DesignTemplate) => {
    const list = buckets.get(key) ?? [];
    list.push(template);
    buckets.set(key, list);
  };

  for (const t of templates) {
    const name = t.category?.trim() ?? '';
    put(name || UNCATEGORIZED_KEY, t);
  }

  const sections: DesignTemplateCategorySection[] = [];

  for (const cat of registry) {
    const items = buckets.get(cat.name) ?? [];
    buckets.delete(cat.name);
    if (items.length > 0 || showEmpty) {
      sections.push({
        key: cat.name,
        label: cat.name,
        items,
        categoryId: cat.id,
      });
    }
  }

  const uncategorized = buckets.get(UNCATEGORIZED_KEY) ?? [];
  buckets.delete(UNCATEGORIZED_KEY);

  for (const [name, items] of buckets) {
    if (items.length > 0) {
      sections.push({ key: name, label: name, items });
    }
  }

  if (uncategorized.length > 0 || (showEmpty && !sections.some((s) => s.key === UNCATEGORIZED_KEY))) {
    sections.push({
      key: UNCATEGORIZED_KEY,
      label: 'Без категории',
      items: uncategorized,
    });
  }

  return sections;
}
