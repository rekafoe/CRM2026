import { Router } from 'express'
import { CustomerController } from '../controllers/customerController'

const router = Router()

/**
 * @route   GET /api/customers
 * @desc    Получить всех клиентов
 * @query   type - фильтр по типу (individual/legal)
 * @query   search - поиск по имени, компании, телефону, email
 * @access  Private
 */
router.get('/', CustomerController.getAll)

/**
 * @route   GET /api/customers/:id
 * @desc    Получить клиента по ID
 * @access  Private
 */
router.get('/:id', CustomerController.getById)

/**
 * @route   POST /api/customers
 * @desc    Создать нового клиента
 * @body    { type, first_name?, last_name?, company_name?, phone?, email?, ... }
 * @access  Private
 */
router.post('/', CustomerController.create)

/**
 * @route   PUT /api/customers/:id
 * @desc    Обновить клиента
 * @access  Private
 */
router.put('/:id', CustomerController.update)

/**
 * @route   DELETE /api/customers/:id
 * @desc    Удалить клиента
 * @access  Private
 */
router.delete('/:id', CustomerController.delete)

export default router
