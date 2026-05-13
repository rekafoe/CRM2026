import {
  getPhotoBatchSizeById,
  type PhotoBatchDraftItem,
  type PhotoBatchGroup,
  type PhotoBatchSavedItem,
  type PhotoBatchSizeOption,
} from '../publicEditor';
import { API_BASE_URL } from '../../config/constants';

export type PhotoBatchDraftPayload = {
  groups: PhotoBatchGroup[];
  totalFiles: number;
  totalQuantity: number;
};

export function createPhotoBatchDraftItem(file: File, defaultSizeId: string): PhotoBatchDraftItem {
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    originalName: file.name,
    sizeId: defaultSizeId,
    quantity: 1,
    fitMode: 'cover',
    rotation: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  };
}

export function getDraftFileContentUrl(token: string, fileId: number): string {
  return `${API_BASE_URL}/public-editor/drafts/${encodeURIComponent(token)}/files/${encodeURIComponent(String(fileId))}/content`;
}

export function restorePhotoBatchDraftItems(
  token: string,
  payload: unknown,
): { items: PhotoBatchDraftItem[]; fileIdByDraftId: Map<string, number> } {
  const root = payload && typeof payload === 'object' ? payload as { groups?: unknown } : {};
  const groups = Array.isArray(root.groups) ? root.groups : [];
  const fileIdByDraftId = new Map<string, number>();
  const items: PhotoBatchDraftItem[] = [];

  groups.forEach((group) => {
    if (!group || typeof group !== 'object') return;
    const rawGroup = group as {
      groupSizeId?: unknown;
      items?: unknown;
    };
    const sizeId = String(rawGroup.groupSizeId ?? '');
    if (!Array.isArray(rawGroup.items)) return;
    rawGroup.items.forEach((savedItem, itemIndex) => {
      if (!savedItem || typeof savedItem !== 'object') return;
      const item = savedItem as Partial<PhotoBatchSavedItem>;
      const fileId = Number(item.fileId);
      if (!Number.isFinite(fileId) || fileId <= 0) return;
      const id = `saved-${fileId}-${items.length}-${itemIndex}`;
      fileIdByDraftId.set(id, fileId);
      items.push({
        id,
        fileId,
        previewUrl: getDraftFileContentUrl(token, fileId),
        originalName: String(item.originalName ?? `Фото ${items.length + 1}`),
        sizeId,
        quantity: Math.max(1, Number(item.quantity) || 1),
        fitMode: item.fitMode === 'contain' ? 'contain' : 'cover',
        rotation: Number(item.rotation) || 0,
        crop: item.crop ?? { x: 0, y: 0, w: 1, h: 1 },
      });
    });
  });

  return { items, fileIdByDraftId };
}

export function buildPhotoBatchGroups(
  items: PhotoBatchDraftItem[],
  sizeOptions: PhotoBatchSizeOption[],
  fileIdByDraftId?: Map<string, number>,
): PhotoBatchGroup[] {
  const groups = new Map<string, PhotoBatchGroup>();

  for (const item of items) {
    const size = getPhotoBatchSizeById(sizeOptions, item.sizeId);
    const group = groups.get(size.id) ?? {
      groupSizeId: size.id,
      groupLabel: size.label,
      targetSizeMm: { width: size.widthMm, height: size.heightMm },
      quantity: 0,
      items: [],
    };

    group.quantity += item.quantity;
    group.items.push({
      fileId: fileIdByDraftId?.get(item.id) ?? item.fileId ?? 0,
      originalName: item.originalName,
      quantity: item.quantity,
      fitMode: item.fitMode,
      rotation: item.rotation,
      crop: item.crop,
    });
    groups.set(size.id, group);
  }

  return Array.from(groups.values());
}

export function buildPhotoBatchPayload(
  items: PhotoBatchDraftItem[],
  sizeOptions: PhotoBatchSizeOption[],
  fileIdByDraftId?: Map<string, number>,
): PhotoBatchDraftPayload {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    groups: buildPhotoBatchGroups(items, sizeOptions, fileIdByDraftId),
    totalFiles: items.length,
    totalQuantity,
  };
}
