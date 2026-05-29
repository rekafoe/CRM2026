import type { DesignTemplate } from '../../../api';
import type { DesignTemplateCategory } from '../../../api';

export const UNCATEGORIZED_KEY = '__uncategorized__';

export type DesignTemplateCategorySection = {
  key: string;
  label: string;
  items: DesignTemplate[];
  categoryId?: number;
};

export function categorySectionKeyForTemplate(t: DesignTemplate): string {
  if (t.category_id != null) return String(t.category_id);
  const name = t.category?.trim() ?? '';
  return name || UNCATEGORIZED_KEY;
}

export function categorySectionKeyForRegistry(cat: DesignTemplateCategory): string {
  return String(cat.id);
}

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
    put(categorySectionKeyForTemplate(t), t);
  }

  const sections: DesignTemplateCategorySection[] = [];

  for (const cat of registry) {
    const key = categorySectionKeyForRegistry(cat);
    const byId = buckets.get(key) ?? [];
    const byName = buckets.get(cat.name) ?? [];
    const seen = new Set(byId.map((t) => t.id));
    const items = [
      ...byId,
      ...byName.filter((t) => !seen.has(t.id)),
    ];
    buckets.delete(key);
    buckets.delete(cat.name);
    if (items.length > 0 || showEmpty) {
      sections.push({
        key,
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
