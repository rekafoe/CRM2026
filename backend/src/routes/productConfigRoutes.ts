import express from 'express';
import { productConfigController } from '../controllers/productConfigController';

const router = express.Router();

// Получить все конфигурации продуктов
router.get('/', productConfigController.getAllProductConfigs);

// Получить конфигурацию продукта по ID
router.get('/:id', productConfigController.getProductConfigById);

// Создать новую конфигурацию продукта
router.post('/', productConfigController.createProductConfig);

// Обновить конфигурацию продукта
router.put('/:id', productConfigController.updateProductConfig);

// Удалить конфигурацию продукта
router.delete('/:id', productConfigController.deleteProductConfig);

export default router;
