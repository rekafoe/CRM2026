import { Router } from 'express'
import { MaterialCategoryController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/material-categories - получить все категории
router.get('/', asyncHandler(MaterialCategoryController.getAllCategories))

// GET /api/material-categories/stats - получить статистику по категориям
router.get('/stats', asyncHandler(MaterialCategoryController.getCategoryStats))

// GET /api/material-categories/:id - получить категорию по ID
router.get('/:id', asyncHandler(MaterialCategoryController.getCategoryById))

// POST /api/material-categories - создать новую категорию
router.post('/', asyncHandler(MaterialCategoryController.createCategory))

// PUT /api/material-categories/:id - обновить категорию
router.put('/:id', asyncHandler(MaterialCategoryController.updateCategory))

// DELETE /api/material-categories/:id - удалить категорию
router.delete('/:id', asyncHandler(MaterialCategoryController.deleteCategory))

export default router
