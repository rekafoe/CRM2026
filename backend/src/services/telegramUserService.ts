import { getDb } from '../db';

export interface TelegramUser {
  id: number;
  chat_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  role: string;
  notifications_enabled: boolean;
  notification_preferences: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateTelegramUserRequest {
  chat_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  notifications_enabled?: boolean;
  notification_preferences?: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
}

export interface UpdateTelegramUserRequest {
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  role?: string;
  notifications_enabled?: boolean;
  notification_preferences?: {
    low_stock: boolean;
    new_orders: boolean;
    system_alerts: boolean;
  };
}

export class TelegramUserService {
  /**
   * Получение всех Telegram пользователей
   */
  static async getAllUsers(): Promise<TelegramUser[]> {
    const db = await getDb();
    
    const users = await db.all(`
      SELECT 
        id, chat_id, username, first_name, last_name,
        is_active, role, notifications_enabled, notification_preferences,
        created_at, updated_at
      FROM telegram_users
      ORDER BY created_at DESC
    `);

    return users.map(user => ({
      ...user,
      notification_preferences: typeof user.notification_preferences === 'string'
        ? JSON.parse(user.notification_preferences)
        : user.notification_preferences
    }));
  }

  /**
   * Получение активных Telegram пользователей
   */
  static async getActiveUsers(): Promise<TelegramUser[]> {
    const db = await getDb();
    
    const users = await db.all(`
      SELECT 
        id, chat_id, username, first_name, last_name,
        is_active, role, notifications_enabled, notification_preferences,
        created_at, updated_at
      FROM telegram_users
      WHERE is_active = 1 AND notifications_enabled = 1
      ORDER BY created_at DESC
    `);

    return users.map(user => ({
      ...user,
      notification_preferences: typeof user.notification_preferences === 'string'
        ? JSON.parse(user.notification_preferences)
        : user.notification_preferences
    }));
  }

  /**
   * Получение пользователей по роли
   */
  static async getUsersByRole(role: string): Promise<TelegramUser[]> {
    const db = await getDb();
    
    const users = await db.all(`
      SELECT 
        id, chat_id, username, first_name, last_name,
        is_active, role, notifications_enabled, notification_preferences,
        created_at, updated_at
      FROM telegram_users
      WHERE role = ? AND is_active = 1 AND notifications_enabled = 1
      ORDER BY created_at DESC
    `, [role]);

    return users.map(user => ({
      ...user,
      notification_preferences: typeof user.notification_preferences === 'string'
        ? JSON.parse(user.notification_preferences)
        : user.notification_preferences
    }));
  }

  /**
   * Получение пользователя по chat_id
   */
  static async getUserByChatId(chatId: string): Promise<TelegramUser | null> {
    const db = await getDb();
    
    const user = await db.get(`
      SELECT 
        id, chat_id, username, first_name, last_name,
        is_active, role, notifications_enabled, notification_preferences,
        created_at, updated_at
      FROM telegram_users
      WHERE chat_id = ?
    `, [chatId]);

    if (!user) return null;

    return {
      ...user,
      notification_preferences: typeof user.notification_preferences === 'string'
        ? JSON.parse(user.notification_preferences)
        : user.notification_preferences
    };
  }

  /**
   * Создание нового Telegram пользователя
   */
  static async createUser(userData: CreateTelegramUserRequest): Promise<TelegramUser> {
    console.log(`💾 Creating Telegram user in database:`, userData);
    const db = await getDb();
    
    const defaultPreferences = {
      low_stock: true,
      new_orders: true,
      system_alerts: true
    };

    const preferences = userData.notification_preferences || defaultPreferences;
    console.log(`📋 Using preferences:`, preferences);

    const result = await db.run(`
      INSERT INTO telegram_users (
        chat_id, username, first_name, last_name, role,
        notifications_enabled, notification_preferences
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userData.chat_id,
      userData.username || null,
      userData.first_name || null,
      userData.last_name || null,
      userData.role || 'user',
      userData.notifications_enabled !== false ? 1 : 0,
      JSON.stringify(preferences)
    ]);

    console.log(`💾 Database insert result:`, result);

    const newUser = await this.getUserByChatId(userData.chat_id);
    if (!newUser) {
      throw new Error('Failed to create telegram user');
    }

    return newUser;
  }

  /**
   * Обновление Telegram пользователя
   */
  static async updateUser(id: number, userData: UpdateTelegramUserRequest): Promise<TelegramUser> {
    const db = await getDb();
    
    const updateFields = [];
    const values = [];

    if (userData.username !== undefined) {
      updateFields.push('username = ?');
      values.push(userData.username);
    }
    if (userData.first_name !== undefined) {
      updateFields.push('first_name = ?');
      values.push(userData.first_name);
    }
    if (userData.last_name !== undefined) {
      updateFields.push('last_name = ?');
      values.push(userData.last_name);
    }
    if (userData.is_active !== undefined) {
      updateFields.push('is_active = ?');
      values.push(userData.is_active ? 1 : 0);
    }
    if (userData.role !== undefined) {
      updateFields.push('role = ?');
      values.push(userData.role);
    }
    if (userData.notifications_enabled !== undefined) {
      updateFields.push('notifications_enabled = ?');
      values.push(userData.notifications_enabled ? 1 : 0);
    }
    if (userData.notification_preferences !== undefined) {
      updateFields.push('notification_preferences = ?');
      values.push(JSON.stringify(userData.notification_preferences));
    }

    if (updateFields.length === 0) {
      console.log('⚠️ No fields to update, returning existing user');
      const user = await this.getUserByChatId(userData.username || '');
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await db.run(`
      UPDATE telegram_users 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `, values);

    const updatedUser = await db.get(`
      SELECT 
        id, chat_id, username, first_name, last_name,
        is_active, role, notifications_enabled, notification_preferences,
        created_at, updated_at
      FROM telegram_users
      WHERE id = ?
    `, [id]);

    if (!updatedUser) {
      throw new Error('Telegram user not found');
    }

    return {
      ...updatedUser,
      notification_preferences: typeof updatedUser.notification_preferences === 'string'
        ? JSON.parse(updatedUser.notification_preferences)
        : updatedUser.notification_preferences
    };
  }

  /**
   * Удаление Telegram пользователя
   */
  static async deleteUser(id: number): Promise<boolean> {
    const db = await getDb();
    
    const result = await db.run('DELETE FROM telegram_users WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }

  /**
   * Получение статистики Telegram пользователей
   */
  static async getStats(): Promise<{
    total: number;
    active: number;
    byRole: Record<string, number>;
  }> {
    const db = await getDb();
    
    const total = await db.get('SELECT COUNT(*) as count FROM telegram_users');
    const active = await db.get('SELECT COUNT(*) as count FROM telegram_users WHERE is_active = 1');
    const byRole = await db.all(`
      SELECT role, COUNT(*) as count 
      FROM telegram_users 
      WHERE is_active = 1 
      GROUP BY role
    `);

    return {
      total: total.count,
      active: active.count,
      byRole: byRole.reduce((acc, row) => {
        acc[row.role] = row.count;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}
