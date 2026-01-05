console.log('Loading routes...')

import { Router } from 'express'
import authRoutes from './auth'
import usersRoutes from './users'
import ordersRoutes from './orders'
import orderStatusesRoutes from './orderStatuses'
import materialsRoutes from './materials'
import pricingRoutes from './pricing'
import paperTypesRoutes from './paperTypes'
import printingTechnologiesRoutes from './printingTechnologies'
import productsRoutes from './products'
import operationsRoutes from './operations'
import printersRoutes from './printers'
import reportsRoutes from './reports'
import dailyReportsRoutes from './dailyReports'
import materialCategoriesRoutes from './materialCategories'
import suppliersRoutes from './suppliers'
import notificationsRoutes from './notifications'
import warehouseReportsRoutes from './warehouseReports'

const router = Router()

// API routes
router.use('/auth', authRoutes)
router.use('/users', usersRoutes)
router.use('/orders', ordersRoutes)
router.use('/order-statuses', orderStatusesRoutes)
router.use('/materials', materialsRoutes)
router.use('/pricing', pricingRoutes)
router.use('/paper-types', paperTypesRoutes)
router.use('/printing-technologies', printingTechnologiesRoutes)
router.use('/products', productsRoutes)
router.use('/operations', operationsRoutes)
router.use('/printers', printersRoutes)
router.use('/reports', reportsRoutes)
router.use('/daily-reports', dailyReportsRoutes)
router.use('/material-categories', materialCategoriesRoutes)
router.use('/suppliers', suppliersRoutes)
router.use('/notifications', notificationsRoutes)
router.use('/warehouse-reports', warehouseReportsRoutes)

console.log('Routes setup complete')

export default router