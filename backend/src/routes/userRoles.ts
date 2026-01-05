import { Router } from 'express'
import { UserRolesController } from '../modules/users/controllers/userRolesController'
import { authenticate, asyncHandler } from '../middleware'

const router = Router()

// Получить все роли
router.get('/roles', authenticate, asyncHandler(UserRolesController.getAllRoles))

// Получить роль по ID
router.get('/roles/:id', authenticate, asyncHandler(UserRolesController.getRoleById))

// Создать новую роль
router.post('/roles', authenticate, asyncHandler(UserRolesController.createRole))

// Обновить роль
router.put('/roles/:id', authenticate, asyncHandler(UserRolesController.updateRole))

// Удалить роль
router.delete('/roles/:id', authenticate, asyncHandler(UserRolesController.deleteRole))

// Получить всех пользователей
router.get('/users', authenticate, asyncHandler(UserRolesController.getAllUsers))

// Назначить роль пользователю
router.post('/assign-role', authenticate, asyncHandler(UserRolesController.assignRoleToUser))

// Получить разрешения пользователя
router.get('/users/:userId/permissions', authenticate, asyncHandler(UserRolesController.getUserPermissions))

// Проверить разрешение пользователя
router.get('/users/:userId/permissions/:permission', authenticate, asyncHandler(UserRolesController.checkPermission))

// Получить все доступные разрешения
router.get('/permissions', authenticate, asyncHandler(UserRolesController.getAllPermissions))

// Создать стандартные роли
router.post('/create-default-roles', authenticate, asyncHandler(UserRolesController.createDefaultRoles))

export default router
