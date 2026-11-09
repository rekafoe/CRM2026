import type { DesignTemplate } from '../../../api';
import { APP_CONFIG } from '../../../types';

export const DESIGNS_CATALOG_PATH = '/designs';
export const ADMIN_DESIGNS_CATALOG_PATH = '/adminpanel/design-templates';

type CatalogUser = { id: number; role?: string | null } | null | undefined;

export function readStoredCatalogUser(): { id: number; role: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = Number(localStorage.getItem(APP_CONFIG.storage.userId));
    const role = localStorage.getItem(APP_CONFIG.storage.role) || '';
    if (!Number.isFinite(id) || id <= 0 || !role) return null;
    return { id, role };
  } catch {
    return null;
  }
}

export function isDesignCatalogAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function canEditDesign(
  user: CatalogUser,
  template: { uploaded_by_user_id?: number | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (isDesignCatalogAdmin(user.role)) return true;
  if (!template || template.uploaded_by_user_id == null) return false;
  return Number(template.uploaded_by_user_id) === Number(user.id);
}

export function ownsDesignFamily(user: CatalogUser, variants: DesignTemplate[]): boolean {
  if (!user) return false;
  if (isDesignCatalogAdmin(user.role)) return true;
  if (variants.length === 0) return false;
  return variants.every((variant) => canEditDesign(user, variant));
}

export function designsCatalogPath(pathname: string): string {
  return pathname.startsWith('/designs') ? DESIGNS_CATALOG_PATH : ADMIN_DESIGNS_CATALOG_PATH;
}

export function resolveDesignCatalogReturn(
  state: unknown,
  role: string | null | undefined,
): string {
  const fromState = state && typeof state === 'object' && 'catalogPath' in state
    ? String((state as { catalogPath?: string }).catalogPath || '')
    : '';
  if (fromState === DESIGNS_CATALOG_PATH || fromState === ADMIN_DESIGNS_CATALOG_PATH) return fromState;
  return isDesignCatalogAdmin(role) ? ADMIN_DESIGNS_CATALOG_PATH : DESIGNS_CATALOG_PATH;
}
