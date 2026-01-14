import { Request, Response } from 'express'
import { CustomerService } from '../services/customerService'
import { asyncHandler } from '../../../middleware'

export class CustomerController {
  /**
   * GET /api/customers - Получить всех клиентов
   */
  static getAll = asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as 'individual' | 'legal' | undefined
    const search = req.query.search as string | undefined

    const customers = await CustomerService.getAllCustomers({ type, search })
    res.json(customers)
  })

  /**
   * GET /api/customers/:id - Получить клиента по ID
   */
  static getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    const customer = await CustomerService.getCustomerById(id)
    if (!customer) {
      res.status(404).json({ error: 'Клиент не найден' })
      return
    }

    res.json(customer)
  })

  /**
   * POST /api/customers - Создать нового клиента
   */
  static create = asyncHandler(async (req: Request, res: Response) => {
    const {
      type,
      first_name,
      last_name,
      middle_name,
      company_name,
      legal_name,
      tax_id,
      phone,
      email,
      address,
      notes
    } = req.body

    if (!type || !['individual', 'legal'].includes(type)) {
      res.status(400).json({ error: 'Необходимо указать тип клиента (individual или legal)' })
      return
    }

    try {
      const customer = await CustomerService.createCustomer({
        type,
        first_name,
        last_name,
        middle_name,
        company_name,
        legal_name,
        tax_id,
        phone,
        email,
        address,
        notes
      })

      res.status(201).json(customer)
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Ошибка создания клиента' })
    }
  })

  /**
   * PUT /api/customers/:id - Обновить клиента
   */
  static update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    const {
      type,
      first_name,
      last_name,
      middle_name,
      company_name,
      legal_name,
      tax_id,
      phone,
      email,
      address,
      notes
    } = req.body

    try {
      const customer = await CustomerService.updateCustomer(id, {
        type,
        first_name,
        last_name,
        middle_name,
        company_name,
        legal_name,
        tax_id,
        phone,
        email,
        address,
        notes
      })

      res.json(customer)
    } catch (error: any) {
      if (error.message === 'Клиент не найден') {
        res.status(404).json({ error: error.message })
        return
      }
      res.status(400).json({ error: error.message || 'Ошибка обновления клиента' })
    }
  })

  /**
   * DELETE /api/customers/:id - Удалить клиента
   */
  static delete = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    try {
      await CustomerService.deleteCustomer(id)
      res.status(204).send()
    } catch (error: any) {
      if (error.message.includes('не найден')) {
        res.status(404).json({ error: error.message })
        return
      }
      res.status(400).json({ error: error.message || 'Ошибка удаления клиента' })
    }
  })
}
