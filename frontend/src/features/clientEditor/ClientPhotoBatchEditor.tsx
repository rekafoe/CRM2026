import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '../../components/common';
import type { PublicEditorDraftFile } from '../../api';
import { filterLikelyImageFiles } from '../../utils/imageFile';
import {
  DEFAULT_PHOTO_BATCH_SIZES,
  PhotoBatchEditorCore,
  useDraftAssetUploadQueue,
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
  restorePhotoBatchDraftItems,
} from './photoBatchDraftUtils';
import '../../pages/admin/PhotoBatchEditorPage.css';

type BatchSettings = Pick<PhotoBatchDraftItem, 'sizeId' | 'quantity' | 'fitMode' | 'rotation' | 'crop'>;

export interface ClientPhotoBatchEditorProps {
  adapter?: PublicDesignEditorAdapter;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  productId?: number;
  typeId?: number | string;
  sizeId?: string;
  sizeOptions?: PhotoBatchSizeOption[];
}

function defaultBatchSettings(sizeId: string): BatchSettings {
  return { sizeId, quantity: 1, fitMode: 'cover', rotation: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
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
  const draftVersionRef = useRef<number | null>(null);
  const lastSavedBatchKeyRef = useRef<string>('');
  const [draftToken, setDraftToken] = useState<string | null>(initialDraftToken ?? null);
  const sizeOptions = providedSizeOptions?.length ? providedSizeOptions : DEFAULT_PHOTO_BATCH_SIZES;
  const [defaultSizeId, setDefaultSizeId] = useState(
    sizeId && sizeOptions.some((size) => size.id === sizeId) ? sizeId : sizeOptions[0].id,
  );
  const [initialAssets, setInitialAssets] = useState<PublicEditorDraftFile[]>([]);
  const [settingsById, setSettingsById] = useState<Record<string, BatchSettings>>({});
  const [saving, setSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(initialDraftToken));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureDraft = useCallback(async () => {
    if (draftToken) return draftToken;
    const draft = await adapter.createDraft({ productId, typeId, sizeId, mode: 'photo_batch', payload: {} });
    draftVersionRef.current = typeof draft.version === 'number' ? draft.version : null;
    setDraftToken(draft.token);
    onDraftTokenChange?.(draft.token);
    return draft.token;
  }, [adapter, draftToken, onDraftTokenChange, productId, sizeId, typeId]);

  const uploadQueue = useDraftAssetUploadQueue({
    initialAssets,
    uploadFile: async (file, onProgress) => {
      const token = await ensureDraft();
      return adapter.uploadDraftFile(token, file, onProgress);
    },
  });

  useEffect(() => {
    if (!initialDraftToken) {
      setLoadingDraft(false);
      return;
    }
    let cancelled = false;
    setLoadingDraft(true);
    adapter.getDraft(initialDraftToken)
      .then(async (draft) => {
        if (cancelled) return;
        draftVersionRef.current = typeof draft.version === 'number' ? draft.version : null;
        const restored = restorePhotoBatchDraftItems(initialDraftToken, draft.payloadParsed?.photoBatch);
        const assets = adapter.listDraftFiles ? await adapter.listDraftFiles(initialDraftToken) : [];
        if (cancelled) return;
        setInitialAssets(assets);
        setSettingsById(() => {
          const next: Record<string, BatchSettings> = {};
          restored.items.forEach((item) => {
            if (item.fileId) next[`asset-${item.fileId}`] = {
              sizeId: item.sizeId,
              quantity: item.quantity,
              fitMode: item.fitMode,
              rotation: item.rotation,
              crop: item.crop,
            };
          });
          return next;
        });
        if (restored.items.length > 0) {
          lastSavedBatchKeyRef.current = JSON.stringify(draft.payloadParsed?.photoBatch ?? null);
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

  useEffect(() => {
    setSettingsById((current) => {
      let changed = false;
      const next = { ...current };
      uploadQueue.items.forEach((item) => {
        if (next[item.id]) return;
        next[item.id] = defaultBatchSettings(defaultSizeId);
        changed = true;
      });
      return changed ? next : current;
    });
  }, [defaultSizeId, uploadQueue.items]);

  const items = useMemo<PhotoBatchDraftItem[]>(() => uploadQueue.items.map((asset) => ({
    id: asset.id,
    file: asset.file,
    fileId: asset.fileId,
    previewUrl: asset.previewUrl,
    fallbackPreviewUrl: asset.fallbackPreviewUrl,
    url: asset.url,
    thumbUrl: asset.thumbUrl,
    originalName: asset.originalName,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    uploadStatus: asset.status,
    uploadProgress: asset.progress,
    uploadError: asset.error,
    ...(settingsById[asset.id] ?? defaultBatchSettings(defaultSizeId)),
  })), [defaultSizeId, settingsById, uploadQueue.items]);

  const groups = useMemo(() => buildPhotoBatchGroups(items, sizeOptions), [items, sizeOptions]);
  const totalQuantity = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const addFiles = (files: FileList | File[]) => {
    const images = filterLikelyImageFiles(Array.from(files));
    if (images.length > 0) uploadQueue.addFiles(images);
  };

  const updateItem = (id: string, patch: Partial<PhotoBatchDraftItem>) => {
    setSettingsById((current) => ({ ...current, [id]: { ...(current[id] ?? defaultBatchSettings(defaultSizeId)), ...patch } }));
  };

  const removeItem = (id: string) => {
    uploadQueue.removeItem(id);
    setSettingsById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const saveBatch = useCallback(async (silent = false) => {
    if (items.length === 0) {
      if (!silent) setError('Добавьте хотя бы одно фото.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (!silent) setStatus(null);
      const token = await ensureDraft();
      if (items.some((item) => item.uploadStatus === 'error')) throw new Error('Некоторые фото не загрузились.');
      if (items.some((item) => item.uploadStatus !== 'ready' || !item.fileId)) {
        throw new Error('Дождитесь завершения загрузки всех фото.');
      }
      const photoBatch = buildPhotoBatchPayload(items, sizeOptions);
      const savedDraft = await adapter.updateDraft(token, {
        photoBatch,
        ...(draftVersionRef.current ? { expectedVersion: draftVersionRef.current } : {}),
      });
      if (savedDraft && typeof savedDraft.version === 'number') draftVersionRef.current = savedDraft.version;
      lastSavedBatchKeyRef.current = JSON.stringify(photoBatch);
      if (!silent) setStatus('Пачка фото сохранена в draft.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пачку фото');
    } finally {
      setSaving(false);
    }
  }, [adapter, ensureDraft, items, sizeOptions]);

  const currentBatchKey = useMemo(
    () => (items.length > 0 ? JSON.stringify(buildPhotoBatchPayload(items, sizeOptions)) : ''),
    [items, sizeOptions],
  );
  const hasUnsavedBatch = currentBatchKey !== '' && currentBatchKey !== lastSavedBatchKeyRef.current;
  const canAutosave = hasUnsavedBatch && items.every((item) => item.uploadStatus === 'ready' && item.fileId);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedBatch && !saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedBatch, saving]);

  useEffect(() => {
    if (!canAutosave || saving || loadingDraft) return;
    const timer = window.setTimeout(() => {
      void saveBatch(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [canAutosave, currentBatchKey, loadingDraft, saveBatch, saving]);

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
        footerText={hasUnsavedBatch ? 'Есть несохранённые параметры. Автосохранение сработает после загрузки всех фото.' : 'Фото и параметры печати сохранены в draft.'}
        saveLabel={hasUnsavedBatch ? 'Сохранить draft' : 'Draft сохранён'}
        onDefaultSizeChange={setDefaultSizeId}
        onApplySizeToAll={() => setSettingsById((current) => Object.fromEntries(
          Object.entries(current).map(([id, settings]) => [id, { ...settings, sizeId: defaultSizeId }]),
        ))}
        onAddPhotoClick={() => inputRef.current?.click()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
        onUpdateItem={updateItem}
        onRemoveItem={removeItem}
        onRetryItem={uploadQueue.retryItem}
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
