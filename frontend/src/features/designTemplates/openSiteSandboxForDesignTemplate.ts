import { getDesignTemplate, type DesignTemplate } from '../../api';
import { getProductDetails, getProductTemplateConfig } from '../../services/products';
import { parseTemplateSpec } from '../../pages/admin/designTemplates/designTemplateCatalogUtils';
import { openSiteClientEditor } from '../../utils/siteClientEditorUrl';

function resolveTypeIdParam(
  typeId: number | undefined,
  configData: Record<string, unknown> | null | undefined,
): string {
  if (typeId == null || !Number.isFinite(typeId)) return '0';
  const simplified = (configData as { simplified?: { types?: Array<{ id?: unknown; key?: unknown }> } } | undefined)
    ?.simplified;
  const types = simplified?.types;
  if (Array.isArray(types)) {
    const match = types.find((t) => Number(t.id) === Number(typeId));
    const key = typeof match?.key === 'string' ? match.key.trim() : '';
    if (key) return key;
  }
  return String(typeId);
}

/**
 * Открыть актуальный клиентский редактор на сайте по design_template.
 * Нужна привязка шаблона к продукту (spec.productId) и route_key продукта.
 */
export async function openSiteSandboxForDesignTemplate(
  templateOrId: DesignTemplate | number,
): Promise<void> {
  const template = typeof templateOrId === 'number'
    ? (await getDesignTemplate(templateOrId)).data
    : templateOrId;

  const parsed = parseTemplateSpec(template);
  const templateId = Number(template.id);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    throw new Error('Некорректный ID шаблона');
  }

  const productId = parsed.productId;
  if (productId == null || !Number.isFinite(productId) || productId <= 0) {
    throw new Error(
      'Шаблон не привязан к продукту. Укажите привязку к калькулятору (product / тип / размер), затем снова откройте sandbox.',
    );
  }

  const details = await getProductDetails(productId);
  if (!details) {
    throw new Error(`Продукт #${productId} не найден`);
  }

  const routeKey = String((details as { route_key?: string | null }).route_key ?? '').trim();
  const productSlug = routeKey || String(productId);

  let configData: Record<string, unknown> | null = null;
  try {
    const cfg = await getProductTemplateConfig(productId);
    configData = (cfg?.config_data as Record<string, unknown>) ?? null;
  } catch {
    configData = null;
  }

  const typeIdParam = resolveTypeIdParam(parsed.typeId, configData);
  const mode = parsed.editorKind === 'souvenir_3d' ? 'souvenir_3d' : 'single';

  openSiteClientEditor({
    productSlug,
    typeIdParam,
    templateId,
    mode,
  });
}
