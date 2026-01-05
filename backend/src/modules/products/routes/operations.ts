/**
 * Роуты для управления операциями
 */

import { Router } from 'express';
import { OperationsController } from '../controllers/operationsController';
import { asyncHandler } from '../../../middleware';

const router = Router();

// CRUD для операций
router.get('/', asyncHandler((req, res) => OperationsController.getAllOperations(req, res)));
router.get('/:id', asyncHandler((req, res) => OperationsController.getOperationById(req, res)));
router.post('/', asyncHandler((req, res) => OperationsController.createOperation(req, res)));
router.put('/:id', asyncHandler((req, res) => OperationsController.updateOperation(req, res)));
router.delete('/:id', asyncHandler((req, res) => OperationsController.deleteOperation(req, res)));

export default router;

