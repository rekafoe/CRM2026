import { Request, Response } from 'express'
import { AuthService } from '../services'

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as { email: string; password: string }
      const result = await AuthService.login(email, password)
      res.json(result)
    } catch (error: any) {
      const status = error.message === 'Email и пароль обязательны' ? 400 : 401
      res.status(status).json({ message: error.message })
    }
  }

  static async getCurrentUser(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        res.status(401).json({ message: 'Токен не предоставлен' })
        return
      }
      
      const user = await AuthService.getCurrentUser(token)
      res.json(user)
    } catch (error: any) {
      res.status(401).json({ message: error.message })
    }
  }
}
