import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '../../components/common';
import { filterLikelyImageFiles } from '../../utils/imageFile';
import {
  DEFAULT_PHOTO_BATCH_SIZES,
  PhotoBatchEditorCore,
  type PhotoBatchDraftItem,
  type PhotoBatchSizeOption,
} from '../publicEditor';
import {
  crmPreviewPublicDesignEditorAdapter,
  type PublicDesignEditorAdapter,
} from '../publicDesignEditor/publicDesignEditorAdapter';
import {
  buildPhotoBatchGroups,
  buildPhotoBatchPayload,
  createPhotoBatchDraftItem,
  restorePhotoBatchDraftItems,
} from './photoBatchDraftUtils';
import '../../pages/admin/PhotoBatchEditorPage.css';

export interface ClientPhotoBatchEditorProps {
  adapter?: PublicDesignEditorAdapter;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  productId?: number;
  typeId?: number | string;
  sizeId?: string;
  sizeOptions?: PhotoBatchSizeOption[];
}

export const ClientPhotoBatchEditor: React.FC<ClientPhotoBatchEditorProps> = ({
  adapter = crmPreviewPublicDesignEditorAdapter,
  initialDraftToken,
  onDraftTokenChange,
  productId,
  typeId,
  sizeId,
  sizeOptions: providedSizeOptions,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftToken, setDraftToken] = useState<string | null>(initialDraftToken ?? null);
  const sizeOptions = providedSizeOptions?.length ? providedSizeOptions : DEFAULT_PHOTO_BATCH_SIZES;
  const [defaultSizeId, setDefaultSizeId] = useState(
    sizeId && sizeOptions.some((size) => size.id === sizeId) ? sizeId : sizeOptions[0].id,
  );
  const [items, setItems] = useState<PhotoBatchDraftItem[]>([]);
  const [fileIdByDraftId, setFileIdByDraftId] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(initialDraftToken));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialDraftToken) {
      setLoadingDraft(false);
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    adapter.getDraft(initialDraftToken)
      .then((draft) => {
        if (cancelled) return;
        const restored = restorePhotoBatchDraftItems(initialDraftToken, draft.payloadParsed?.photoBatch);
        setItems(restored.items);
        setFileIdByDraftId(restored.fileIdByDraftId);
        if (restored.items.length > 0) {
          setDefaultSizeId((current) => (
            restored.items.some((item) => item.sizeId === current)
              ? current
              : restored.items[0].sizeId
          ));
          setStatus('Открыт сохранённый draft пачки фото.');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось восстановить draft');
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, initialDraftToken]);

  const groups = useMemo(
    () => buildPhotoBatchGroups(items, sizeOptions, fileIdByDraftId),
    [fileIdByDraftId, items, sizeOptions],
  );
  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const ensureDraft = async () => {
    if (draftToken) return draftToken;
    const draft = await adapter.createDraft({
      productId,
      typeId,
      sizeId,
      mode: 'photo_batch',
      payload: {},
    });
    setDraftToken(draft.token);
    onDraftTokenChange?.(draft.token);
    return draft.token;
  };

  const addFiles = (files: FileList | File[]) => {
    const images = filterLikelyImageFiles(Array.from(files));
    if (images.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file) => createPhotoBatchDraftItem(file, defaultSizeId)),
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
    setFileIdByDraftId((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const saveBatch = async () => {
    if (items.length === 0) {
      setError('Добавьте хотя бы одно фото.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setStatus(null);
      const token = await ensureDraft();
      const nextFileIds = new Map(fileIdByDraftId);
      for (const item of items) {
        if (nextFileIds.has(item.id)) continue;
        if (!item.file) throw new Error(`Файл ${item.originalName} нужно загрузить заново`);
        const uploaded = await adapter.uploadDraftFile(token, item.file);
        if (!uploaded.id) throw new Error('Draft file id не вернулся из API');
        nextFileIds.set(item.id, uploaded.id);
      }
      const photoBatch = buildPhotoBatchPayload(items, sizeOptions, nextFileIds);
      await adapter.updateDraft(token, { photoBatch });
      setFileIdByDraftId(nextFileIds);
      setStatus('Пачка фото сохранена в draft.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пачку фото');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="photo-batch">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {status && <Alert type="success" onClose={() => setStatus(null)}>{status}</Alert>}
      {loadingDraft && <Alert type="info">Восстанавливаем сохранённый draft...</Alert>}
      <PhotoBatchEditorCore
        items={items}
        groups={groups}
        sizeOptions={sizeOptions}
        defaultSizeId={defaultSizeId}
        totalQuantity={totalQuantity}
        saving={saving || loadingDraft}
        footerText="Сохранение загрузит файлы в draft и запишет payload.photoBatch."
        saveLabel="Сохранить draft"
        onDefaultSizeChange={setDefaultSizeId}
        onApplySizeToAll={() => setItems((prev) => prev.map((item) => ({ ...item, sizeId: defaultSizeId })))}
        onAddPhotoClick={() => inputRef.current?.click()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
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
  );
};

export default ClientPhotoBatchEditor;
