import { Request, Response } from 'express';
import { productConfigService } from '../services/productConfigService';

export const productConfigController = {
  // Получить все конфигурации продуктов
  async getAllProductConfigs(req: Request, res: Response) {
    try {
      const configs = await productConfigService.getAllProductConfigs();
      res.json(configs);
    } catch (error) {
      console.error('Ошибка получения конфигураций продуктов:', error);
      res.status(500).json({ error: 'Ошибка получения конфигураций продуктов' });
    }
  },

  // Получить конфигурацию продукта по ID
  async getProductConfigById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const config = await productConfigService.getProductConfigById(id);
      
      if (!config) {
        return res.status(404).json({ error: 'Конфигурация продукта не найдена' });
      }
      
      res.json(config);
    } catch (error) {
      console.error('Ошибка получения конфигурации продукта:', error);
      res.status(500).json({ error: 'Ошибка получения конфигурации продукта' });
    }
  },

  // Создать новую конфигурацию продукта
  async createProductConfig(req: Request, res: Response) {
    try {
      const configData = req.body;
      const newConfig = await productConfigService.createProductConfig(configData);
      res.status(201).json(newConfig);
    } catch (error) {
      console.error('Ошибка создания конфигурации продукта:', error);
      res.status(500).json({ error: 'Ошибка создания конфигурации продукта' });
    }
  },

  // Обновить конфигурацию продукта
  async updateProductConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const configData = req.body;
      const updatedConfig = await productConfigService.updateProductConfig(id, configData);
      
      if (!updatedConfig) {
        return res.status(404).json({ error: 'Конфигурация продукта не найдена' });
      }
      
      res.json(updatedConfig);
    } catch (error) {
      console.error('Ошибка обновления конфигурации продукта:', error);
      res.status(500).json({ error: 'Ошибка обновления конфигурации продукта' });
    }
  },

  // Удалить конфигурацию продукта
  async deleteProductConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await productConfigService.deleteProductConfig(id);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Конфигурация продукта не найдена' });
      }
      
      res.json({ message: 'Конфигурация продукта удалена' });
    } catch (error) {
      console.error('Ошибка удаления конфигурации продукта:', error);
      res.status(500).json({ error: 'Ошибка удаления конфигурации продукта' });
    }
  }
};
