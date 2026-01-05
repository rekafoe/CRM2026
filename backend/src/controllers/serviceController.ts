import { Request, Response } from 'express';
import { getDb } from '../db'; // 🔧 Исправлено: getDatabase → getDb

export const getServicePrices = async (req: Request, res: Response) => {
  try {
    const db = await getDb(); // 🔧 Добавлен await
    const services = await db.all(`
      SELECT 
        id,
        service_name,
        price_per_unit,
        unit,
        is_active,
        created_at,
        updated_at
      FROM service_prices 
      WHERE is_active = 1
      ORDER BY service_name
    `);

    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error('Ошибка получения услуг:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения услуг'
    });
  }
};

export const getServicePriceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb(); // 🔧 Добавлен await
    
    const service = await db.get(`
      SELECT 
        id,
        service_name,
        price_per_unit,
        unit,
        is_active,
        created_at,
        updated_at
      FROM service_prices 
      WHERE id = ? AND is_active = 1
    `, [id]);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Услуга не найдена'
      });
    }

    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error('Ошибка получения услуги:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения услуги'
    });
  }
};
