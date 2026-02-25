import { useEffect, useMemo, useState } from 'react';
import { getReasonPresetsSettings } from '../../api';

export type ReasonPresetKind = 'delete' | 'status_cancel' | 'online_cancel';

const STORAGE_KEY = 'reason_presets_cache_v1';

const DEFAULT_REASON_PRESETS: Record<ReasonPresetKind, string[]> = {
  delete: [
    'Ошибочный заказ',
    'Дубликат заказа',
    'Клиент отказался',
    'Невозможно выполнить заказ',
    'Техническая ошибка',
  ],
  status_cancel: [
    'Клиент отменил заказ',
    'Не подтверждена предоплата',
    'Нет материалов в наличии',
    'Нарушены сроки выполнения',
    'Ошибочное оформление заказа',
  ],
  online_cancel: [
    'Клиент не вышел на связь',
    'Клиент отказался от заказа',
    'Не подтверждена предоплата',
    'Обнаружена ошибка в заказе',
    'Дубликат онлайн-заказа',
  ],
};

function normalizeList(list: unknown, fallback: string[]): string[] {
  if (!Array.isArray(list)) return fallback;
  const data = list
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .map((v) => v.slice(0, 120));
  return Array.from(new Set(data));
}

function readCachedPresets(): Record<ReasonPresetKind, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REASON_PRESETS;
    const parsed = JSON.parse(raw) as Partial<Record<ReasonPresetKind, unknown>>;
    return {
      delete: normalizeList(parsed.delete, DEFAULT_REASON_PRESETS.delete),
      status_cancel: normalizeList(parsed.status_cancel, DEFAULT_REASON_PRESETS.status_cancel),
      online_cancel: normalizeList(parsed.online_cancel, DEFAULT_REASON_PRESETS.online_cancel),
    };
  } catch {
    return DEFAULT_REASON_PRESETS;
  }
}

function writeCachedPresets(data: Record<ReasonPresetKind, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useReasonPresets() {
  const [presets, setPresets] = useState<Record<ReasonPresetKind, string[]>>(() => readCachedPresets());

  useEffect(() => {
    let isCancelled = false;
    getReasonPresetsSettings()
      .then((res) => {
        if (isCancelled) return;
        const next: Record<ReasonPresetKind, string[]> = {
          delete: normalizeList(res.data?.delete, DEFAULT_REASON_PRESETS.delete),
          status_cancel: normalizeList(res.data?.status_cancel, DEFAULT_REASON_PRESETS.status_cancel),
          online_cancel: normalizeList(res.data?.online_cancel, DEFAULT_REASON_PRESETS.online_cancel),
        };
        setPresets(next);
        writeCachedPresets(next);
      })
      .catch(() => {
        // leave cached/default presets
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const getPresets = useMemo(() => {
    return (kind: ReasonPresetKind) => presets[kind] || DEFAULT_REASON_PRESETS[kind];
  }, [presets]);

  return {
    presets,
    getPresets,
    setLocalPresets: (next: Record<ReasonPresetKind, string[]>) => {
      setPresets(next);
      writeCachedPresets(next);
    },
  };
}

