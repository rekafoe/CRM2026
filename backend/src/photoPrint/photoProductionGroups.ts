import type {
  CartOrderItem,
  SavedOrder,
} from './photoPrintTypes';
import {
  canonicalPhysicalSizeKey,
  physicalSizeFilenamePart,
  resolvePhotoTrimMode,
  resolvePrintFormatMm,
  type PhotoTrimMode,
  type PrintFormatMm,
} from './photoFormatDimensions';

export type PhotoProductionBorderClass = 'standard' | 'artistic';

export type PhotoProductionGroup = {
  key: string;
  filename: string;
  size: PrintFormatMm;
  sizeKey: string;
  paperKey: string;
  productKey: string;
  borderClass: PhotoProductionBorderClass;
  orders: SavedOrder[];
};

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function safePhotoProductionToken(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (/глян/.test(raw)) return 'glossy';
  if (/мат/.test(raw)) return 'matte';
  if (/шелк|silk/.test(raw)) return 'silk';
  if (/сатин|satin/.test(raw)) return 'satin';

  const ascii = raw
    .replace(/[×х]/g, 'x')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return ascii || `${fallback}_${shortHash(raw)}`;
}

function resolvePaperKey(item: CartOrderItem): string {
  return safePhotoProductionToken(item.paperKey || item.paperType, 'paper');
}

function resolveProductKey(order: SavedOrder): string {
  const type = safePhotoProductionToken(order.photoType, 'photo');
  if (order.crmProductId != null && Number.isFinite(Number(order.crmProductId))) {
    return `${type}_p${Math.floor(Number(order.crmProductId))}`;
  }
  return type;
}

function borderClassForMode(mode: PhotoTrimMode): PhotoProductionBorderClass {
  return mode === 'artistic' ? 'artistic' : 'standard';
}

function buildDescriptor(order: SavedOrder, item: CartOrderItem) {
  const parsed = resolvePrintFormatMm(item);
  if (!parsed) {
    throw new Error(`Не удалось определить физический размер фото «${item.printSize || 'без размера'}»`);
  }
  const size: PrintFormatMm = {
    widthMm: Math.min(parsed.widthMm, parsed.heightMm),
    heightMm: Math.max(parsed.widthMm, parsed.heightMm),
  };
  const sizeKey = canonicalPhysicalSizeKey(size);
  const paperKey = resolvePaperKey(item);
  const productKey = resolveProductKey(order);
  const trimMode = resolvePhotoTrimMode(item);
  const borderClass = borderClassForMode(trimMode);
  const key = [sizeKey, paperKey, productKey, borderClass].join('|');
  const filename = [
    'fotopechat',
    physicalSizeFilenamePart(size),
    paperKey,
    productKey,
    ...(borderClass === 'artistic' ? ['artistic'] : []),
    'sra3.pdf',
  ].join('_');
  return { key, filename, size, sizeKey, paperKey, productKey, borderClass };
}

/**
 * Группирует только по производственно совместимым признакам.
 * crop и fit одного формата можно печатать вместе; artistic идёт отдельно.
 */
export function groupPhotoOrdersByProduction(
  orders: SavedOrder[]
): PhotoProductionGroup[] {
  const groups = new Map<
    string,
    PhotoProductionGroup & { orderIndexes: Map<string, number> }
  >();

  for (const order of orders) {
    if (order.orderType !== 'photo') continue;
    for (const rawItem of order.items) {
      if (!rawItem.mockupId) continue;
      const descriptor = buildDescriptor(order, rawItem);
      let group = groups.get(descriptor.key);
      if (!group) {
        group = {
          ...descriptor,
          orders: [],
          orderIndexes: new Map<string, number>(),
        };
        groups.set(descriptor.key, group);
      }

      let orderIndex = group.orderIndexes.get(order.orderId);
      if (orderIndex == null) {
        orderIndex = group.orders.length;
        group.orderIndexes.set(order.orderId, orderIndex);
        group.orders.push({ ...order, items: [] });
      }
      const trimMode = resolvePhotoTrimMode(rawItem);
      group.orders[orderIndex].items.push({
        ...rawItem,
        trimWidthMm: descriptor.size.widthMm,
        trimHeightMm: descriptor.size.heightMm,
        trimMode,
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => {
      const areaA = a.size.widthMm * a.size.heightMm;
      const areaB = b.size.widthMm * b.size.heightMm;
      if (Math.abs(areaA - areaB) > 1e-6) return areaA - areaB;
      return a.key.localeCompare(b.key);
    })
    .map(({ orderIndexes: _orderIndexes, ...group }) => group);
}
