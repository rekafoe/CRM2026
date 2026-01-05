import { Request, Response } from 'express'
import { UserRolesService } from '../services/userRolesService'
import { logger } from '../../../utils/logger'

export class UserRolesController {
  /**
   * Получить все роли
   */
  static async getAllRoles(req: Request, res: Response) {
    try {
      const roles = await UserRolesService.getAllRoles()
      res.json({ roles })
    } catch (error: any) {
      logger.error('Ошибка получения ролей', error)
      res.status(500).json({ error: 'Ошибка получения ролей' })
    }
  }

  /**
   * Получить роль по ID
   */
  static async getRoleById(req: Request, res: Response) {
    try {
      const { id } = req.params
      const roleId = parseInt(id)
      
      if (isNaN(roleId)) {
        res.status(400).json({ error: 'Неверный ID роли' })
        return
      }

      const role = await UserRolesService.getRoleById(roleId)
      if (!role) {
        res.status(404).json({ error: 'Роль не найдена' })
        return
      }

      res.json({ role })
    } catch (error: any) {
      logger.error('Ошибка получения роли', error)
      res.status(500).json({ error: 'Ошибка получения роли' })
    }
  }

  /**
   * Создать новую роль
   */
  static async createRole(req: Request, res: Response) {
    try {
      const { name, description, permissions } = req.body
      
      if (!name || !description || !Array.isArray(permissions)) {
        res.status(400).json({ error: 'Необходимо указать name, description и permissions' })
        return
      }

      const role = await UserRolesService.createRole({
        name,
        description,
        permissions
      })

      res.status(201).json({ role })
    } catch (error: any) {
      logger.error('Ошибка создания роли', error)
      res.status(500).json({ error: error.message || 'Ошибка создания роли' })
    }
  }

  /**
   * Обновить роль
   */
  static async updateRole(req: Request, res: Response) {
    try {
      const { id } = req.params
      const roleId = parseInt(id)
      
      if (isNaN(roleId)) {
        res.status(400).json({ error: 'Неверный ID роли' })
        return
      }

      const { name, description, permissions } = req.body
      
      const role = await UserRolesService.updateRole(roleId, {
        name,
        description,
        permissions
      })

      if (!role) {
        res.status(404).json({ error: 'Роль не найдена' })
        return
      }

      res.json({ role })
    } catch (error: any) {
      logger.error('Ошибка обновления роли', error)
      res.status(500).json({ error: error.message || 'Ошибка обновления роли' })
    }
  }

  /**
   * Удалить роль
   */
  static async deleteRole(req: Request, res: Response) {
    try {
      const { id } = req.params
      const roleId = parseInt(id)
      
      if (isNaN(roleId)) {
        res.status(400).json({ error: 'Неверный ID роли' })
        return
      }

      await UserRolesService.deleteRole(roleId)
      res.json({ message: 'Роль удалена' })
    } catch (error: any) {
      logger.error('Ошибка удаления роли', error)
      res.status(500).json({ error: error.message || 'Ошибка удаления роли' })
    }
  }

  /**
   * Получить всех пользователей
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await UserRolesService.getAllUsers()
      res.json({ users })
    } catch (error: any) {
      logger.error('Ошибка получения пользователей', error)
      res.status(500).json({ error: 'Ошибка получения пользователей' })
    }
  }

  /**
   * Назначить роль пользователю
   */
  static async assignRoleToUser(req: Request, res: Response) {
    try {
      const { userId, roleId } = req.body
      const authUser = (req as any).user as { id: number } | undefined
      
      if (!userId || !roleId) {
        res.status(400).json({ error: 'Необходимо указать userId и roleId' })
        return
      }

      if (!authUser) {
        res.status(401).json({ error: 'Не авторизован' })
        return
      }

      await UserRolesService.assignRoleToUser(userId, roleId, authUser.id)
      res.json({ message: 'Роль назначена пользователю' })
    } catch (error: any) {
      logger.error('Ошибка назначения роли', error)
      res.status(500).json({ error: error.message || 'Ошибка назначения роли' })
    }
  }

  /**
   * Получить разрешения пользователя
   */
  static async getUserPermissions(req: Request, res: Response) {
    try {
      const { userId } = req.params
      const userIdNum = parseInt(userId)
      
      if (isNaN(userIdNum)) {
        res.status(400).json({ error: 'Неверный ID пользователя' })
        return
      }

      const permissions = await UserRolesService.getUserPermissions(userIdNum)
      res.json({ permissions })
    } catch (error: any) {
      logger.error('Ошибка получения разрешений', error)
      res.status(500).json({ error: 'Ошибка получения разрешений' })
    }
  }

  /**
   * Проверить разрешение пользователя
   */
  static async checkPermission(req: Request, res: Response) {
    try {
      const { userId, permission } = req.params
      const userIdNum = parseInt(userId)
      
      if (isNaN(userIdNum)) {
        res.status(400).json({ error: 'Неверный ID пользователя' })
        return
      }

      const hasPermission = await UserRolesService.hasPermission(userIdNum, permission)
      res.json({ hasPermission })
    } catch (error: any) {
      logger.error('Ошибка проверки разрешения', error)
      res.status(500).json({ error: 'Ошибка проверки разрешения' })
    }
  }

  /**
   * Получить все доступные разрешения
   */
  static async getAllPermissions(req: Request, res: Response) {
    try {
      const permissions = await UserRolesService.getAllPermissions()
      res.json({ permissions })
    } catch (error: any) {
      logger.error('Ошибка получения разрешений', error)
      res.status(500).json({ error: 'Ошибка получения разрешений' })
    }
  }

  /**
   * Создать стандартные роли
   */
  static async createDefaultRoles(req: Request, res: Response) {
    try {
      await UserRolesService.createDefaultRoles()
      res.json({ message: 'Стандартные роли созданы' })
    } catch (error: any) {
      logger.error('Ошибка создания стандартных ролей', error)
      res.status(500).json({ error: 'Ошибка создания стандартных ролей' })
    }
  }
}
