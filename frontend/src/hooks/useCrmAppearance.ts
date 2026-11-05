import { useEffect } from 'react';

/** Светлая, «Пудра» и Deep Ink. Плотность: обычная или компактная (строка 34px). */
export type CrmTheme = 'light' | 'powder' | 'dark';
export type CrmDensity = 'regular' | 'compact';

export type CrmAppearance = {
  theme: CrmTheme;
  density: CrmDensity;
};

export const CRM_APPEARANCE_EVENT = 'pc-appearance-change';

export const CRM_APPEARANCE_DEFAULT: CrmAppearance = {
  theme: 'light',
  density: 'regular',
};

export function appearanceStorageKey(userId: string): string {
  const id = String(userId || '').trim() || '0';
  return `pc-appearance:${id}`;
}

export function currentAppearanceUserId(): string {
  if (typeof localStorage === 'undefined') return '0';
  return localStorage.getItem('crmUserId') || '0';
}

function isCrmTheme(value: unknown): value is CrmTheme {
  return value === 'light' || value === 'powder' || value === 'dark';
}

function isCrmDensity(value: unknown): value is CrmDensity {
  return value === 'regular' || value === 'compact';
}

export function readCrmAppearance(userId: string): CrmAppearance {
  try {
    const raw = localStorage.getItem(appearanceStorageKey(userId));
    if (!raw) return CRM_APPEARANCE_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<CrmAppearance>;
    return {
      theme: isCrmTheme(parsed.theme) ? parsed.theme : 'light',
      density: isCrmDensity(parsed.density) ? parsed.density : 'regular',
    };
  } catch {
    return CRM_APPEARANCE_DEFAULT;
  }
}

export function ensureCrmAppearance(userId = currentAppearanceUserId()): CrmAppearance {
  const appearance = readCrmAppearance(userId);
  try {
    const key = appearanceStorageKey(userId);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(appearance));
    }
  } catch {
    /* хранилище может быть закрыто */
  }
  applyCrmAppearance(appearance);
  return appearance;
}

export function applyCrmAppearance(appearance: CrmAppearance = CRM_APPEARANCE_DEFAULT): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.density = appearance.density;
  try {
    if (localStorage.getItem('theme') === 'dark') {
      localStorage.setItem('theme', 'light');
    }
  } catch {
    /* хранилище может быть закрыто */
  }
}

export function saveCrmAppearance(userId: string, appearance: CrmAppearance = CRM_APPEARANCE_DEFAULT): void {
  localStorage.setItem(appearanceStorageKey(userId), JSON.stringify(appearance));
  applyCrmAppearance(appearance);
  window.dispatchEvent(new CustomEvent(CRM_APPEARANCE_EVENT));
}

export function useCrmAppearance(): void {
  useEffect(() => {
    const apply = () => {
      ensureCrmAppearance(currentAppearanceUserId());
    };
    apply();
    window.addEventListener(CRM_APPEARANCE_EVENT, apply);
    window.addEventListener('storage', apply);
    return () => {
      window.removeEventListener(CRM_APPEARANCE_EVENT, apply);
      window.removeEventListener('storage', apply);
    };
  }, []);
}
