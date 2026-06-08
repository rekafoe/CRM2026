export const ADMIN_HUB = '/adminpanel';

export type LocationStateWithBack = {
  backTo?: string;
};

/** Родительский маршрут по иерархии admin SPA (не history.back). */
export function getAdminBackTarget(pathname: string, _search = ''): string {
  if (/^\/adminpanel\/print-prices\//.test(pathname)) {
    return '/adminpanel/printers?tab=print';
  }
  if (/^\/adminpanel\/products\/\d+\/(template|edit|tech-process)/.test(pathname)) {
    return '/adminpanel/products';
  }
  if (/^\/adminpanel\/clients\/\d+/.test(pathname)) {
    return '/adminpanel/clients';
  }
  if (/^\/adminpanel\/design-editor\//.test(pathname)) {
    return '/adminpanel/design-templates';
  }
  if (/^\/adminpanel\/public-design-editor-preview\//.test(pathname)) {
    return '/adminpanel/design-templates';
  }
  if (pathname.startsWith('/adminpanel/') && pathname !== '/adminpanel' && pathname !== '/adminpanel/') {
    return ADMIN_HUB;
  }
  return ADMIN_HUB;
}
