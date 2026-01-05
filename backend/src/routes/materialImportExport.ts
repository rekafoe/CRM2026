import { Router } from 'express'
import { MaterialImportExportController } from '../controllers'
import { asyncHandler } from '../middleware'

const router = Router()

// GET /api/material-import-export/template - получить шаблон для импорта
router.get('/template', asyncHandler(MaterialImportExportController.getImportTemplate))

// GET /api/material-import-export/export/csv - экспорт в CSV
router.get('/export/csv', asyncHandler(MaterialImportExportController.exportToCSV))

// GET /api/material-import-export/export/json - экспорт в JSON
router.get('/export/json', asyncHandler(MaterialImportExportController.exportToJSON))

// POST /api/material-import-export/validate - валидация данных импорта
router.post('/validate', asyncHandler(MaterialImportExportController.validateImportData))

// POST /api/material-import-export/import - импорт из JSON
router.post('/import', asyncHandler(MaterialImportExportController.importFromJSON))

export default router
