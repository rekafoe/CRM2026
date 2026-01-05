import express from 'express';
import { getServicePrices, getServicePriceById } from '../controllers/serviceController';

const router = express.Router();

// Получить все услуги
router.get('/', getServicePrices);

// Получить услугу по ID
router.get('/:id', getServicePriceById);

export default router;
