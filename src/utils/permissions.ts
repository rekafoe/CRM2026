import { PERMISSIONS, USER_ROLES } from '../config/constants';

/**
 * Проверка прав доступа пользователя
 */
export const hasPermission = (
  userRole: string | undefined,
  permission: keyof typeof PERMISSIONS
): boolean => {
  if (!userRole) return false;
  
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(userRole as any);
};

/**
 * Проверка, является ли пользователь администратором
 */
export const isAdmin = (userRole: string | undefined): boolean => {
  return userRole === USER_ROLES.ADMIN;
};

/**
 * Проверка, является ли пользователь менеджером
 */
export const isManager = (userRole: string | undefined): boolean => {
  return userRole === USER_ROLES.MANAGER;
};

/**
 * Проверка, может ли пользователь редактировать
 */
export const canEdit = (userRole: string | undefined): boolean => {
  return userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.MANAGER;
};

/**
 * Проверка, может ли пользователь только просматривать
 */
export const isViewerOnly = (userRole: string | undefined): boolean => {
  return userRole === USER_ROLES.VIEWER;
};

/**
 * Получить описание роли
 */
export const getRoleDescription = (role: string): string => {
  const descriptions: Record<string, string> = {
    [USER_ROLES.ADMIN]: 'Администратор - полный доступ ко всем функциям',
    [USER_ROLES.MANAGER]: 'Менеджер - управление заказами и материалами',
    [USER_ROLES.VIEWER]: 'Наблюдатель - только просмотр данных',
  };
  
  return descriptions[role] || 'Неизвестная роль';
};

export default {
  hasPermission,
  isAdmin,
  isManager,
  canEdit,
  isViewerOnly,
  getRoleDescription,
};
