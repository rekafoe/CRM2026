import { Router } from 'express';
import { asyncHandler } from '../../../middleware';
import { OperationsController } from '../controllers/operationsController';
import productSetupRouter from './productSetup';

import categoriesRouter from './categories';
import catalogRouter from './catalog';
import schemaRouter from './schema';
import configsRouter from './configs';
import calculateRouter from './calculate';
import productCrudRouter from './productCrud';
import parametersRouter from './parameters';
import materialsRouter from './materials';
import servicesRouter from './services';

const router = Router();

// --- Статические маршруты (до параметризованных!) ---
router.use('/categories', categoriesRouter);
router.use('/', catalogRouter);  // /debug, /parameter-presets, GET /, /category/:categoryId

// --- Параметризованные маршруты: schema, configs, calculate, params, materials, services, operations ---
router.use('/', schemaRouter);       // /:productId/schema
router.use('/', configsRouter);      // /:productId/configs
router.use('/', calculateRouter);    // /:productId/calculate, /:productId/validate-size
router.use('/', parametersRouter);   // /:productId/parameters
router.use('/', materialsRouter);    // /:productId/materials
router.use('/', servicesRouter);     // /:productId/services

// Операции продукта (через контроллер)
router.get('/:productId/operations', asyncHandler((req, res) => OperationsController.getProductOperations(req, res)));
router.post('/:productId/operations/bulk', asyncHandler((req, res) => OperationsController.bulkAddOperationsToProduct(req, res)));
router.post('/:productId/operations', asyncHandler((req, res) => OperationsController.addOperationToProduct(req, res)));
router.put('/:productId/operations/:linkId', asyncHandler((req, res) => OperationsController.updateProductOperation(req, res)));
router.delete('/:productId/operations/:linkId', asyncHandler((req, res) => OperationsController.removeOperationFromProduct(req, res)));

// --- CRUD продукта (POST /setup, POST /, PUT /:id, DELETE /:id, GET /:productId) ---
// Должен быть ПОСЛЕДНИМ, т.к. содержит catch-all GET /:productId
router.use('/', productCrudRouter);

// Setup продукта (пошаговая настройка)
router.use(productSetupRouter);

export default router;
