import { getDb } from '../config/database'
import { hashPassword, getTodayString } from '../utils'
import { User } from '../models'

export class AuthService {
  static async login(email: string, password: string) {
    if (!email || !password) {
      throw new Error('Email и пароль обязательны')
    }

    const hashedPassword = hashPassword(password)
    const db = await getDb()
    const user = await db.get<{ id: number; api_token: string; name: string; role: string }>(
      'SELECT id, api_token, name, role FROM users WHERE email = ? AND password_hash = ?',
      email,
      hashedPassword
    )

    if (!user) {
      throw new Error('Неверные данные')
    }

    // Ensure daily report exists for today for this user
    const today = getTodayString()
    const exists = await db.get('SELECT id FROM daily_reports WHERE report_date = ? AND user_id = ?', today, user.id)
    if (!exists) {
      try {
        await db.run('INSERT INTO daily_reports (report_date, user_id) VALUES (?, ?)', today, user.id)
      } catch {}
    }

    return {
      token: user.api_token,
      name: user.name,
      role: user.role,
      user_id: user.id,
      session_date: today
    }
  }

  static async getCurrentUser(token: string) {
    const db = await getDb()
    const user = await db.get<{ id: number; name: string; role: string }>(
      'SELECT id, name, role FROM users WHERE api_token = ?',
      token
    )
    
    if (!user) {
      throw new Error('Неверный токен')
    }
    
    return user
  }
}
