import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import { getProductSchemaById, updateOrderItem, uploadOrderFile } from '../../api';
import { filterLikelyImageFiles } from '../../utils/imageFile';
import { PhotoBatchEditorCore } from '../../features/publicEditor/PhotoBatchEditorCore';
import {
  DEFAULT_PHOTO_BATCH_SIZES,
  extractPhotoBatchSizesFromSchema,
  getPhotoBatchSizeById,
} from '../../features/publicEditor/photoBatchDefaults';
import type { PhotoBatchDraftItem, PhotoBatchGroup } from '../../features/publicEditor/photoBatchTypes';
import '../../styles/admin-page-layout.css';
import './PhotoBatchEditorPage.css';

type PhotoBatchOrderItemParams = NonNullable<Parameters<typeof updateOrderItem>[2]['params']> & {
  photoBatch: {
    groups: PhotoBatchGroup[];
    totalFiles: number;
    totalQuantity: number;
  };
};

function createDraftItem(file: File, defaultSizeId: string): PhotoBatchDraftItem {
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

function buildGroups(items: PhotoBatchDraftItem[], sizeOptions: typeof DEFAULT_PHOTO_BATCH_SIZES): PhotoBatchGroup[] {
  const groups = new Map<string, PhotoBatchGroup>();

  items.forEach((item) => {
    const size = getPhotoBatchSizeById(sizeOptions, item.sizeId);
    const existing = groups.get(size.id);
    const group = existing ?? {
      groupSizeId: size.id,
      groupLabel: size.label,
      targetSizeMm: { width: size.widthMm, height: size.heightMm },
      quantity: 0,
      items: [],
    };

    group.quantity += item.quantity;
    group.items.push({
      fileId: 0,
      originalName: item.originalName,
      quantity: item.quantity,
      fitMode: item.fitMode,
      rotation: item.rotation,
      crop: item.crop,
    });
    groups.set(size.id, group);
  });

  return Array.from(groups.values());
}

function buildSavedGroups(
  items: PhotoBatchDraftItem[],
  fileIdByDraftId: Map<string, number>,
  sizeOptions: typeof DEFAULT_PHOTO_BATCH_SIZES,
): PhotoBatchGroup[] {
  const groups = new Map<string, PhotoBatchGroup>();

  items.forEach((item) => {
    const size = getPhotoBatchSizeById(sizeOptions, item.sizeId);
    const existing = groups.get(size.id);
    const group = existing ?? {
      groupSizeId: size.id,
      groupLabel: size.label,
      targetSizeMm: { width: size.widthMm, height: size.heightMm },
      quantity: 0,
      items: [],
    };

    group.quantity += item.quantity;
    group.items.push({
      fileId: fileIdByDraftId.get(item.id) ?? 0,
      originalName: item.originalName,
      quantity: item.quantity,
      fitMode: item.fitMode,
      rotation: item.rotation,
      crop: item.crop,
    });
    groups.set(size.id, group);
  });

  return Array.from(groups.values());
}

export const PhotoBatchEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = Number(searchParams.get('orderId') ?? 0);
  const orderItemId = Number(searchParams.get('orderItemId') ?? 0);
  const productId = Number(searchParams.get('productId') ?? 0);
  const selectedTypeId = searchParams.get('typeId');
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PhotoBatchDraftItem[]>([]);
  const [sizeOptions, setSizeOptions] = useState(DEFAULT_PHOTO_BATCH_SIZES);
  const [defaultSizeId, setDefaultSizeId] = useState(DEFAULT_PHOTO_BATCH_SIZES[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    getProductSchemaById(productId)
      .then((res) => {
        if (cancelled) return;
        const nextSizes = extractPhotoBatchSizesFromSchema(res.data, selectedTypeId);
        if (nextSizes.length === 0) return;
        setSizeOptions(nextSizes);
        setDefaultSizeId((current) => nextSizes.some((size) => size.id === current) ? current : nextSizes[0].id);
      })
      .catch(() => {
        if (!cancelled) setSizeOptions(DEFAULT_PHOTO_BATCH_SIZES);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, selectedTypeId]);

  useEffect(() => {
    setItems((prev) => prev.map((item) => (
      sizeOptions.some((size) => size.id === item.sizeId)
        ? item
        : { ...item, sizeId: sizeOptions[0].id }
    )));
  }, [sizeOptions]);

  const groups = useMemo(() => buildGroups(items, sizeOptions), [items, sizeOptions]);
  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const addFiles = (files: FileList | File[]) => {
    const images = filterLikelyImageFiles(Array.from(files));
    if (images.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file) => createDraftItem(file, defaultSizeId)),
    ]);
  };

  const updateItem = (id: string, patch: Partial<PhotoBatchDraftItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const applySizeToAll = () => {
    setItems((prev) => prev.map((item) => ({ ...item, sizeId: defaultSizeId })));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const saveBatch = async () => {
    if (orderId <= 0 || orderItemId <= 0) {
      setError('Для сохранения нужен orderId и orderItemId в URL.');
      return;
    }
    if (items.length === 0) {
      setError('Добавьте хотя бы одно фото.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const uploaded = await Promise.all(
        items.map(async (item) => {
          if (!item.file) throw new Error(`Файл ${item.originalName} нужно загрузить заново`);
          const { data } = await uploadOrderFile(orderId, item.file, orderItemId);
          return { draftId: item.id, fileId: data.id };
        }),
      );
      const fileIdByDraftId = new Map(uploaded.map((row) => [row.draftId, row.fileId]));
      const savedGroups = buildSavedGroups(items, fileIdByDraftId, sizeOptions);

      const params: PhotoBatchOrderItemParams = {
        photoBatch: {
          groups: savedGroups,
          totalFiles: items.length,
          totalQuantity,
        },
      };

      await updateOrderItem(orderId, orderItemId, {
        params,
      });
      setSuccess('Пачка фото сохранена в позицию заказа.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пачку фото');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageLayout
      title="Пакетная фотопечать"
      icon={<AppIcon name="image" size="sm" />}
      onBack={() => navigate(-1)}
    >
      <div className="photo-batch">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert type="success" onClose={() => setSuccess(null)}>{success}</Alert>}

        <PhotoBatchEditorCore
          items={items}
          groups={groups}
          sizeOptions={sizeOptions}
          defaultSizeId={defaultSizeId}
          totalQuantity={totalQuantity}
          saving={saving}
          footerText="Сохранение загрузит файлы и запишет params.photoBatch в позицию заказа."
          onDefaultSizeChange={setDefaultSizeId}
          onApplySizeToAll={applySizeToAll}
          onAddPhotoClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onSave={() => void saveBatch()}
        />
        <input
          ref={inputRef}
          className="photo-batch__file-input"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </AdminPageLayout>
  );
};

export default PhotoBatchEditorPage;
