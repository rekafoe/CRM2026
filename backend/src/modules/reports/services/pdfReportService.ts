import { MaterialService } from '../../warehouse/services/materialService';
import { getDb } from '../../../db';
import * as fs from 'fs';
import * as path from 'path';
import { launchPuppeteerBrowser } from '../../../utils/puppeteerLaunch';
import { logger } from '../../../utils/logger';

export interface StockReportData {
  materials: Array<{
    id: number;
    name: string;
    unit: string;
    quantity: number;
    min_quantity: number;
    category_name?: string;
    supplier_name?: string;
    status: 'ok' | 'low' | 'critical' | 'out_of_stock';
  }>;
  summary: {
    total: number;
    low_stock: number;
    critical: number;
    out_of_stock: number;
    ok: number;
  };
  generated_at: string;
  generated_by: string;
}

export class PDFReportService {
  /**
   * Генерация отчета об остатках материалов
   */
  static async generateStockReport(generatedBy: string): Promise<Buffer> {
    try {
      logger.info(`Generating stock report for ${generatedBy}...`);
      
      // Получаем все материалы
      const allMaterials = await MaterialService.getAllMaterials();
      
      // Анализируем материалы
      const materials = allMaterials.map(material => {
        let status: 'ok' | 'low' | 'critical' | 'out_of_stock' = 'ok';
        
        if (material.quantity <= 0) {
          status = 'out_of_stock';
        } else if (material.quantity <= material.min_quantity) {
          status = 'critical';
        } else if (material.quantity <= material.min_quantity * 1.5) {
          status = 'low';
        }
        
        return {
          id: material.id,
          name: material.name,
          unit: material.unit,
          quantity: material.quantity,
          min_quantity: material.min_quantity,
          category_name: material.category_name,
          supplier_name: material.supplier_name,
          status
        };
      });

      // Подсчитываем статистику
      const summary = {
        total: materials.length,
        low_stock: materials.filter(m => m.status === 'low').length,
        critical: materials.filter(m => m.status === 'critical').length,
        out_of_stock: materials.filter(m => m.status === 'out_of_stock').length,
        ok: materials.filter(m => m.status === 'ok').length
      };

      const reportData: StockReportData = {
        materials,
        summary,
        generated_at: new Date().toLocaleString('ru-RU'),
        generated_by: generatedBy
      };

      // Генерируем HTML отчет
      const html = this.generateHTMLReport(reportData);
      
      // Конвертируем HTML в PDF
      const pdfBuffer = await this.convertHTMLToPDF(html);
      
      return pdfBuffer;
      
    } catch (error) {
      logger.error('Error generating stock report', error);
      throw error;
    }
  }

  /**
   * Генерация HTML отчета
   */
  private static generateHTMLReport(data: StockReportData): string {
    const { materials, summary, generated_at, generated_by } = data;
    
    // Сортируем материалы по статусу (проблемные сначала)
    const sortedMaterials = materials.sort((a, b) => {
      const statusOrder = { 'out_of_stock': 0, 'critical': 1, 'low': 2, 'ok': 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчет об остатках материалов</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
        }
        .summary {
            display: flex;
            justify-content: space-around;
            margin-bottom: 30px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        .summary-item {
            text-align: center;
        }
        .summary-number {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-label {
            font-size: 14px;
            color: #666;
        }
        .status-ok { color: #28a745; }
        .status-low { color: #ffc107; }
        .status-critical { color: #fd7e14; }
        .status-out_of_stock { color: #dc3545; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #007bff;
            color: white;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge-ok { background-color: #d4edda; color: #155724; }
        .badge-low { background-color: #fff3cd; color: #856404; }
        .badge-critical { background-color: #f8d7da; color: #721c24; }
        .badge-out_of_stock { background-color: #f5c6cb; color: #721c24; }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Отчет об остатках материалов</h1>
        <p>Сгенерирован: ${generated_at}</p>
        <p>Пользователь: ${generated_by}</p>
    </div>

    <div class="summary">
        <div class="summary-item">
            <div class="summary-number status-ok">${summary.ok}</div>
            <div class="summary-label">В норме</div>
        </div>
        <div class="summary-item">
            <div class="summary-number status-low">${summary.low_stock}</div>
            <div class="summary-label">Низкий остаток</div>
        </div>
        <div class="summary-item">
            <div class="summary-number status-critical">${summary.critical}</div>
            <div class="summary-label">Критический</div>
        </div>
        <div class="summary-item">
            <div class="summary-number status-out_of_stock">${summary.out_of_stock}</div>
            <div class="summary-label">Нет в наличии</div>
        </div>
        <div class="summary-item">
            <div class="summary-number">${summary.total}</div>
            <div class="summary-label">Всего материалов</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Категория</th>
                <th>Поставщик</th>
                <th>Остаток</th>
                <th>Минимум</th>
                <th>Статус</th>
            </tr>
        </thead>
        <tbody>
            ${sortedMaterials.map(material => `
                <tr>
                    <td>${material.id}</td>
                    <td>${material.name}</td>
                    <td>${material.category_name || '-'}</td>
                    <td>${material.supplier_name || '-'}</td>
                    <td>${material.quantity} ${material.unit}</td>
                    <td>${material.min_quantity} ${material.unit}</td>
                    <td>
                        <span class="status-badge badge-${material.status}">
                            ${this.getStatusText(material.status)}
                        </span>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer">
        <p>Отчет сгенерирован автоматически системой CRM</p>
        <p>Время генерации: ${new Date().toLocaleString('ru-RU')}</p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Получение текста статуса
   */
  private static getStatusText(status: string): string {
    switch (status) {
      case 'ok': return 'В норме';
      case 'low': return 'Низкий остаток';
      case 'critical': return 'Критический';
      case 'out_of_stock': return 'Нет в наличии';
      default: return 'Неизвестно';
    }
  }

  /**
   * Конвертация HTML в PDF
   */
  private static async convertHTMLToPDF(html: string): Promise<Buffer> {
    let browser;
    
    try {
      logger.debug('Starting PDF generation...');
      
      // Запускаем браузер
      browser = await launchPuppeteerBrowser();

      const page = await browser.newPage();
      
      // Устанавливаем содержимое страницы
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      // Генерируем PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
            Отчет об остатках материалов - ${new Date().toLocaleDateString('ru-RU')}
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
            Страница <span class="pageNumber"></span> из <span class="totalPages"></span>
          </div>
        `
      }) as unknown as Buffer;

      logger.info('PDF generated successfully');
      return pdfBuffer;
      
    } catch (error) {
      logger.error('Error converting HTML to PDF', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Сохранение отчета в файл
   */
  static async saveReportToFile(reportBuffer: Buffer, filename: string): Promise<string> {
    try {
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, reportBuffer);
      
      logger.info(`Report saved to: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error saving report to file', error);
      throw error;
    }
  }
}
