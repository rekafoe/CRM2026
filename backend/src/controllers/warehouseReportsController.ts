import { Request, Response } from 'express';
import { WarehouseReportsService } from '../services/warehouseReportsService';
import { PDFReportService } from '../services/pdfReportService';
import { Logger } from '../utils/logger';

export class WarehouseReportsController {
  /**
   * Получение сводки по складу
   */
  static async getSummary(req: Request, res: Response) {
    try {
      const filters = req.query;
      const summary = await WarehouseReportsService.getSummary(filters);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      Logger.getInstance().error('Error getting warehouse summary:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения сводки склада'
      });
    }
  }

  /**
   * Получение материалов с низким остатком
   */
  static async getLowStockItems(req: Request, res: Response) {
    try {
      const filters = req.query;
      const items = await WarehouseReportsService.getLowStockItems(filters);
      
      res.json({
        success: true,
        data: items
      });
    } catch (error) {
      Logger.getInstance().error('Error getting low stock items:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения дефицитных материалов'
      });
    }
  }

  /**
   * Получение сводки по поставщикам
   */
  static async getSupplierSummary(req: Request, res: Response) {
    try {
      const filters = req.query;
      const summary = await WarehouseReportsService.getSupplierSummary(filters);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      Logger.getInstance().error('Error getting supplier summary:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения сводки по поставщикам'
      });
    }
  }

  /**
   * Получение движений материалов
   */
  static async getMaterialMovements(req: Request, res: Response) {
    try {
      const filters = req.query;
      const movements = await WarehouseReportsService.getMaterialMovements(filters);
      
      res.json({
        success: true,
        data: movements
      });
    } catch (error) {
      Logger.getInstance().error('Error getting material movements:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения движений материалов'
      });
    }
  }

  /**
   * Получение сводки по категориям
   */
  static async getCategorySummary(req: Request, res: Response) {
    try {
      const filters = req.query;
      const summary = await WarehouseReportsService.getCategorySummary(filters);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      Logger.getInstance().error('Error getting category summary:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения сводки по категориям'
      });
    }
  }

  /**
   * ABC-анализ материалов
   */
  static async getABCAnalysis(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analysis = await WarehouseReportsService.getABCAnalysis(filters);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      Logger.getInstance().error('Error getting ABC analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения ABC-анализа'
      });
    }
  }

  /**
   * Анализ оборачиваемости материалов
   */
  static async getTurnoverAnalysis(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analysis = await WarehouseReportsService.getTurnoverAnalysis(filters);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      Logger.getInstance().error('Error getting turnover analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения анализа оборачиваемости'
      });
    }
  }

  /**
   * Анализ стоимости по категориям
   */
  static async getCostAnalysis(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analysis = await WarehouseReportsService.getCostAnalysis(filters);
      
      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      Logger.getInstance().error('Error getting cost analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения анализа стоимости'
      });
    }
  }

  /**
   * Расширенная аналитика поставщиков
   */
  static async getSupplierAnalytics(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analytics = await WarehouseReportsService.getSupplierAnalytics(filters);
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      Logger.getInstance().error('Error getting supplier analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения аналитики поставщиков'
      });
    }
  }

  /**
   * Прогнозирование потребностей в материалах
   */
  static async getForecastingData(req: Request, res: Response) {
    try {
      const filters = req.query;
      const data = await WarehouseReportsService.getForecastingData(filters);
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      Logger.getInstance().error('Error getting forecasting data:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения прогнозных данных'
      });
    }
  }

  /**
   * Генерация PDF отчета по складу
   */
  static async generatePdfReport(req: Request, res: Response) {
    try {
      console.log('📄 PDF generation request:', req.params, req.query);
      const { reportType = 'summary' } = req.params;
      const user = (req as any).user;
      console.log('👤 User:', user);
      const generatedBy = user?.name || user?.email || 'Система';

      let pdfBuffer: Buffer;

      if (reportType === 'stock') {
        // Используем существующий PDFReportService для отчета по остаткам
        pdfBuffer = await PDFReportService.generateStockReport(generatedBy);
      } else {
        // Генерируем новый PDF отчет на основе типа
        pdfBuffer = await WarehouseReportsService.generatePdfReport(reportType as string, generatedBy);
      }

      const filename = `warehouse-report-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      res.send(pdfBuffer);
    } catch (error) {
      Logger.getInstance().error('Error generating PDF report:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка генерации PDF отчета'
      });
    }
  }
}