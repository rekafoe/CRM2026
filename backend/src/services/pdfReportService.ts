import { MaterialService } from './materialService';
import { getDb } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';

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
      console.log(`📄 Generating stock report for ${generatedBy}...`);
      
      // Получаем все материалы
      const allMaterials = await MaterialService.getAllMaterials();
      
      // Анализируем материалы
      const materials = allMaterials.map(material => {
        const minQuantity = material.min_quantity || 0;
        let status: 'ok' | 'low' | 'critical' | 'out_of_stock' = 'ok';

        if (material.quantity <= 0) {
          status = 'out_of_stock';
        } else if (material.quantity <= minQuantity) {
          status = 'critical';
        } else if (material.quantity <= minQuantity * 1.5) {
          status = 'low';
        }

        return {
          id: material.id,
          name: material.name,
          unit: material.unit,
          quantity: material.quantity,
          min_quantity: minQuantity,
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
      const pdfBuffer = await this.convertHTMLToPDF(html, {});
      
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Error generating stock report:', error);
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
  private static async convertHTMLToPDF(
    html: string,
    options?: { headerTemplate?: string; footerTemplate?: string }
  ): Promise<Buffer> {
    let browser;
    
    try {
      console.log('🔄 Starting PDF generation...');
      
      // Запускаем браузер
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      
      // Устанавливаем содержимое страницы
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });

      // Определяем header и footer
      const hasCustomHeaderFooter = !!(options?.headerTemplate || options?.footerTemplate);
      const defaultHeaderTemplate = `
        <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
          Отчет об остатках материалов - ${new Date().toLocaleDateString('ru-RU')}
        </div>
      `;
      const defaultFooterTemplate = `
        <div style="font-size: 10px; text-align: center; width: 100%; color: #666;">
          Страница <span class="pageNumber"></span> из <span class="totalPages"></span>
        </div>
      `;

      // Генерируем PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: hasCustomHeaderFooter ? '30mm' : '20mm',
          left: '15mm'
        },
        displayHeaderFooter: hasCustomHeaderFooter || true,
        headerTemplate: options?.headerTemplate || defaultHeaderTemplate,
        footerTemplate: options?.footerTemplate || defaultFooterTemplate
      });

      console.log('✅ PDF generated successfully');
      return Buffer.from(pdfBuffer);
      
    } catch (error) {
      console.error('❌ Error converting HTML to PDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Генерация PDF бланка заказа
   */
  static async generateOrderBlank(
    orderId: number, 
    companyPhones: string[] = ['+375 33 336 56 78'],
    executedBy?: string
  ): Promise<Buffer> {
    try {
      console.log(`📄 Generating order blank for order ${orderId}...`);
      
      const db = await getDb();
      
      // Получаем заказ
      const order: any = await db.get(`
        SELECT 
          id, 
          number, 
          status, 
          created_at, 
          customerName, 
          customerPhone, 
          customerEmail,
          prepaymentAmount
        FROM orders 
        WHERE id = ?
      `, [orderId]);

      if (!order) {
        throw new Error(`Заказ с ID ${orderId} не найден`);
      }

      // Получаем позиции заказа
      const items = await db.all(`
        SELECT 
          id,
          type,
          quantity,
          price,
          params
        FROM items
        WHERE orderId = ?
        ORDER BY id
      `, [orderId]);

      // Получаем максимальную дату готовности из позиций
      let readyDate: string | null = null;
      for (const item of items) {
        if (item.params) {
          try {
            const params = typeof item.params === 'string' ? JSON.parse(item.params) : item.params;
            if (params.readyDate) {
              const itemReadyDate = new Date(params.readyDate);
              if (!readyDate || itemReadyDate > new Date(readyDate)) {
                readyDate = params.readyDate;
              }
            }
          } catch (e) {
            // Игнорируем ошибки парсинга
          }
        }
      }

      // Форматируем даты
      let createdDate = '';
      try {
        if (order.created_at) {
          const date = new Date(order.created_at);
          if (!isNaN(date.getTime())) {
            createdDate = date.toLocaleDateString('ru-RU', { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric' 
            });
          }
        }
      } catch (e) {
        console.error('Error formatting created date:', e);
      }
      if (!createdDate) {
        createdDate = new Date().toLocaleDateString('ru-RU');
      }

      let readyDateFormatted = 'Не указана';
      try {
        if (readyDate) {
          const date = new Date(readyDate);
          if (!isNaN(date.getTime())) {
            readyDateFormatted = date.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }
      } catch (e) {
        console.error('Error formatting ready date:', e);
      }

      // Вычисляем общую сумму из позиций
      const calculatedTotalAmount = Array.isArray(items) && items.length > 0
        ? items.reduce((sum: number, item: any) => {
            const itemPrice = Number(item.price) || 0;
            const itemQuantity = Number(item.quantity) || 1;
            return sum + (itemPrice * itemQuantity);
          }, 0)
        : 0;

      // Вычисляем предоплату и долг
      const prepaymentAmount = Number(order.prepaymentAmount) || 0;
      const debt = Math.max(0, calculatedTotalAmount - prepaymentAmount);

      // Генерируем HTML бланка
      const html = this.generateOrderBlankHTML({
        orderNumber: order.number || `ORD-${order.id}`,
        createdDate,
        readyDate: readyDateFormatted,
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        cost: calculatedTotalAmount,
        prepaymentAmount: prepaymentAmount,
        debt: debt,
        items: (Array.isArray(items) ? items : []).map(item => {
          let params: any = {};
          try {
            if (item.params) {
              params = typeof item.params === 'string' ? JSON.parse(item.params) : (item.params || {});
            }
          } catch (e) {
            // Игнорируем ошибки парсинга params
            params = {};
          }
          
          // Формируем строку параметров в том же формате, что и в OrderItemSummary
          const paramParts: string[] = [];
          
          // Стороны
          const sides = Number(item.sides) || 0;
          if (sides > 0) {
            paramParts.push(`${sides} стор.`);
          }
          
          // Брак
          const waste = Number(item.waste) || 0;
          if (waste > 0) {
            paramParts.push(`брак: ${waste} шт.`);
          }
          
          // Листов
          const sheetCount = Number(item.sheets) || Number(params.sheetsNeeded) || Number(params.layout?.sheetsNeeded) || null;
          if (sheetCount != null && sheetCount > 0) {
            paramParts.push(`Листов: ${sheetCount}`);
          }
          
          // На листе
          const itemsPerSheet = Number(params.layout?.itemsPerSheet) || Number(params.piecesPerSheet) || null;
          if (itemsPerSheet != null && itemsPerSheet > 0) {
            paramParts.push(`На листе: ${itemsPerSheet}`);
          }
          
          // Формат листа
          const sheetSize = params.layout?.sheetSize || null;
          if (sheetSize) {
            paramParts.push(`Формат листа: ${sheetSize}`);
          }
          
          // Формат печати
          const specs = params.specifications || {};
          const materialFormat = specs.format || params.formatInfo || sheetSize || null;
          if (materialFormat) {
            paramParts.push(`Формат печати: ${materialFormat}`);
          }
          
          // Тип материала
          const materialTypeRaw = specs.paperType || specs.materialType || null;
          const materialTypeFromSummary = params.parameterSummary && Array.isArray(params.parameterSummary)
            ? params.parameterSummary.find((p: any) => 
                (p.label || p.key || '').toLowerCase() === 'материал' || 
                (p.label || p.key || '').toLowerCase() === 'тип материала'
              )?.value
            : null;
          const materialType = materialTypeFromSummary || materialTypeRaw;
          if (materialType) {
            paramParts.push(`Тип: ${materialType}`);
          }
          
          // Плотность
          const materialDensity = specs.paperDensity || params.paperDensity || null;
          if (materialDensity) {
            paramParts.push(`Плотность: ${materialDensity} г/м²`);
          }
          
          // Материал (paperName)
          if (params.paperName) {
            paramParts.push(`Материал: ${params.paperName}`);
          }
          
          // Ламинация
          if (params.lamination && params.lamination !== 'none') {
            const laminationText = params.lamination === 'matte' ? 'мат' : 
                                  params.lamination === 'glossy' ? 'гл' : 
                                  params.lamination;
            paramParts.push(`Ламинация: ${laminationText}`);
          }
          
          // Дополнительные параметры из parameterSummary (исключая уже показанные)
          if (params.parameterSummary && Array.isArray(params.parameterSummary)) {
            const excludedLabels = [
              'материал', 'тип материала', 'плотность бумаги', 'плотность',
              'тип продукта', 'тираж', 'стороны печати', 'срок изготовления',
              'формат', 'размер', 'ламинация'
            ];
            
            params.parameterSummary.forEach((p: any) => {
              const label = (p.label || p.key || '').toLowerCase();
              if (!excludedLabels.some(excluded => label.includes(excluded))) {
                paramParts.push(`${p.label || p.key || ''}: ${p.value || ''}`);
              }
            });
          }
          
          return {
            type: item.type || 'Товар',
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
            parameters: paramParts.join(' | ') || ''
          };
        }),
        totalAmount: calculatedTotalAmount,
        companyPhone: companyPhones[0] || '+375 33 336 56 78',
        executedBy: executedBy || undefined
      });

      // Конвертируем HTML в PDF
      const companyPhone = companyPhones[0] || '+375 33 336 56 78';
      const pdfBuffer = await this.convertHTMLToPDF(html, {
        headerTemplate: '',
        footerTemplate: `
          <div style="font-size: 8px; text-align: center; width: 100%; color: #666; padding-top: 5px;">
            ${companyPhone}
          </div>
        `
      });
      
      return pdfBuffer;
    } catch (error: any) {
      console.error('❌ Error generating order blank:', error);
      console.error('Error details:', {
        orderId,
        message: error?.message,
        stack: error?.stack
      });
      throw new Error(`Ошибка генерации PDF бланка: ${error?.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Генерация HTML бланка заказа
   */
  private static generateOrderBlankHTML(data: {
    orderNumber: string;
    createdDate: string;
    readyDate: string;
    customerName: string;
    customerPhone: string;
    cost: number;
    prepaymentAmount: number;
    debt: number;
    items: Array<{
      type: string;
      quantity: number;
      price: number;
      parameters: string;
    }>;
    totalAmount: number;
    companyPhone: string;
    executedBy?: string;
  }): string {
    const { orderNumber, createdDate, readyDate, customerName, customerPhone, cost, prepaymentAmount, debt, items, totalAmount, companyPhone: companyPhoneValue, executedBy } = data;
    const companyPhone = companyPhoneValue;

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Бланк заказа ${orderNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Arial', sans-serif;
            padding: 10px;
            color: #333;
            line-height: 1.3;
            font-size: 10px;
        }
        .tear-off-section {
            border-bottom: 2px dashed #666;
            padding-bottom: 15px;
            margin-bottom: 15px;
            page-break-after: avoid;
        }
        .tear-off-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #999;
        }
        .tear-off-logo {
            width: 150px;
            height: 50px;
            background: #000;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
        }
        .tear-off-contact {
            flex: 1;
            padding-left: 15px;
            font-size: 9px;
            line-height: 1.4;
        }
        .tear-off-contact strong {
            display: block;
            margin-bottom: 3px;
            font-size: 10px;
            color: #000;
        }
        .tear-off-summary-right {
            width: 180px;
            padding-left: 15px;
            border-left: 1px solid #999;
            font-size: 9px;
        }
        .tear-off-summary-item {
            margin-bottom: 6px;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }
        .tear-off-summary-item:last-child {
            border-bottom: none;
        }
        .tear-off-summary-label {
            color: #555;
            font-size: 8px;
            display: block;
            margin-bottom: 2px;
        }
        .tear-off-summary-value {
            font-weight: bold;
            color: #000;
            font-size: 10px;
            display: block;
        }
        .tear-off-dates {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 9px;
        }
        .tear-off-date-item {
            flex: 1;
            text-align: center;
        }
        .tear-off-date-label {
            color: #555;
            font-size: 8px;
            margin-bottom: 2px;
        }
        .tear-off-date-value {
            font-weight: bold;
            color: #000;
            font-size: 9px;
        }
        .tear-off-items {
            margin-top: 10px;
        }
        .tear-off-items-title {
            font-weight: bold;
            font-size: 10px;
            margin-bottom: 5px;
            color: #000;
        }
        .tear-off-items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
        }
        .tear-off-items-table th {
            background-color: #666;
            color: white;
            padding: 4px 3px;
            text-align: left;
            font-weight: bold;
            font-size: 7px;
        }
        .tear-off-items-table td {
            padding: 3px;
            border-bottom: 1px solid #ddd;
            font-size: 8px;
        }
        .tear-off-items-table tr:nth-child(even) {
            background-color: #f5f5f5;
        }
        .tear-off-notes {
            margin-top: 10px;
            padding: 6px;
            font-size: 7px;
            color: #555;
            line-height: 1.3;
        }
        .tear-off-notes p {
            margin: 2px 0;
        }
        .main-section {
            margin-top: 15px;
        }
        .company-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #333;
        }
        .company-info-left {
            flex: 1;
        }
        .company-name {
            font-size: 16px;
            font-weight: bold;
            color: #000;
            margin-bottom: 4px;
        }
        .company-details {
            font-size: 9px;
            color: #555;
            line-height: 1.4;
        }
        .order-summary-right {
            width: 180px;
            padding-left: 15px;
            border-left: 1px solid #999;
            font-size: 9px;
        }
        .order-summary-item {
            margin-bottom: 6px;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }
        .order-summary-item:last-child {
            border-bottom: none;
        }
        .order-summary-label {
            color: #555;
            font-size: 8px;
            display: block;
            margin-bottom: 2px;
        }
        .order-summary-value {
            font-weight: bold;
            color: #000;
            font-size: 10px;
            display: block;
        }
        .order-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 10px;
        }
        .order-header-item {
            flex: 1;
            text-align: center;
        }
        .order-header-label {
            font-size: 8px;
            color: #555;
            margin-bottom: 2px;
        }
        .order-header-value {
            font-size: 11px;
            font-weight: bold;
            color: #333;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            font-size: 9px;
        }
        .items-table th {
            background-color: #666;
            color: white;
            padding: 5px 3px;
            text-align: left;
            font-weight: bold;
            font-size: 8px;
        }
        .items-table td {
            padding: 4px 3px;
            border-bottom: 1px solid #ddd;
            font-size: 9px;
        }
        .items-table tr:nth-child(even) {
            background-color: #f5f5f5;
        }
        .item-params {
            font-size: 8px;
            color: #555;
            font-style: italic;
        }
        .summary-section {
            display: flex;
            justify-content: flex-end;
            gap: 20px;
            margin-bottom: 10px;
            padding: 8px;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 10px;
        }
        .summary-item {
            text-align: right;
        }
        .summary-label {
            font-size: 9px;
            color: #555;
            margin-bottom: 2px;
        }
        .summary-value {
            font-size: 12px;
            font-weight: bold;
            color: #000;
        }
        .notes {
            margin-top: 10px;
            padding: 6px;
            font-size: 7px;
            color: #555;
            line-height: 1.3;
        }
        .notes p {
            margin: 2px 0;
        }
        .executed-by {
            margin-top: 8px;
            text-align: right;
            font-size: 8px;
            color: #555;
            padding-top: 6px;
            border-top: 1px solid #999;
        }
    </style>
</head>
<body>
    <!-- Отрывной талон сверху -->
    <div class="tear-off-section">
        <div class="tear-off-header">
            <div style="display: flex; flex: 1;">
                <div class="tear-off-logo">ЛОГО</div>
                <div class="tear-off-contact">
                    <strong>Контактная информация:</strong>
                    Телефон: ${companyPhone}<br>
                    Адрес: г. Минск, пр-т Дзержинского, 3Б<br>
                    (ст. метро Юбилейная Площадь, ст. м Грушевка)<br>
                    График работы: пн-пт: 9:00 - 20:00, сб-вс: 10:00-19:00
                </div>
            </div>
            <div class="tear-off-summary-right">
                <div class="tear-off-summary-item">
                    <span class="tear-off-summary-label">Заказ №:</span>
                    <span class="tear-off-summary-value">${orderNumber}</span>
                </div>
                <div class="tear-off-summary-item">
                    <span class="tear-off-summary-label">Стоимость:</span>
                    <span class="tear-off-summary-value">${cost.toFixed(2)} руб.</span>
                </div>
                <div class="tear-off-summary-item">
                    <span class="tear-off-summary-label">Предоплата:</span>
                    <span class="tear-off-summary-value">${prepaymentAmount.toFixed(2)} руб.</span>
                </div>
                <div class="tear-off-summary-item">
                    <span class="tear-off-summary-label">Долг:</span>
                    <span class="tear-off-summary-value">${debt.toFixed(2)} руб.</span>
                </div>
                ${executedBy ? `
                <div class="tear-off-summary-item">
                    <span class="tear-off-summary-label">Выполнил:</span>
                    <span class="tear-off-summary-value">${this.escapeHtml(executedBy)}</span>
                </div>
                ` : ''}
            </div>
        </div>
        
        <div class="tear-off-dates">
            <div class="tear-off-date-item">
                <div class="tear-off-date-label">Готовность:</div>
                <div class="tear-off-date-value">${readyDate}</div>
            </div>
            <div class="tear-off-date-item">
                <div class="tear-off-date-label">Заказ поступил:</div>
                <div class="tear-off-date-value">${createdDate}</div>
            </div>
            ${customerName ? `
            <div class="tear-off-date-item">
                <div class="tear-off-date-label">Клиент:</div>
                <div class="tear-off-date-value">${this.escapeHtml(customerName)}</div>
            </div>
            ` : ''}
            ${customerPhone ? `
            <div class="tear-off-date-item">
                <div class="tear-off-date-label">Телефон:</div>
                <div class="tear-off-date-value">${this.escapeHtml(customerPhone)}</div>
            </div>
            ` : ''}
        </div>
        
        <div class="tear-off-items">
            <div class="tear-off-items-title">Позиции заказа:</div>
            <table class="tear-off-items-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">№</th>
                        <th style="width: 35%;">Наименование</th>
                        <th style="width: 40%;">Параметры</th>
                        <th style="width: 8%; text-align: center;">Кол-во</th>
                        <th style="width: 12%; text-align: right;">Сумма</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${this.escapeHtml(item.type)}</strong></td>
                            <td style="font-size: 7px; color: #555;">${this.escapeHtml(item.parameters || '')}</td>
                            <td style="text-align: center;">${item.quantity}</td>
                            <td style="text-align: right;"><strong>${(item.price * item.quantity).toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="tear-off-notes">
            <p>• Выдача заказов производится только при наличии чека и данного отрывного талона</p>
            <p>• Исполнитель гарантирует хранение выполненных заказов в течение 1 месяца. Заказ утилизируется по истечении указанного срока.</p>
        </div>
    </div>

    <!-- Основной бланк -->
    <div class="main-section">
        <div class="company-header">
            <div class="company-info-left">
                <div class="company-name">ПЕЧАТНЫЙ ЦЕНТР</div>
                <div class="company-details">
                    Телефон: ${companyPhone}<br>
                    Адрес: г. Минск, пр-т Дзержинского, 3Б<br>
                    (ст. метро Юбилейная Площадь, ст. м Грушевка)<br>
                    График работы: пн-пт: 9:00 - 20:00, сб-вс: 10:00-19:00
                </div>
            </div>
            <div class="order-summary-right">
                <div class="order-summary-item">
                    <span class="order-summary-label">Заказ №:</span>
                    <span class="order-summary-value">${orderNumber}</span>
                </div>
                <div class="order-summary-item">
                    <span class="order-summary-label">Стоимость:</span>
                    <span class="order-summary-value">${cost.toFixed(2)} руб.</span>
                </div>
                <div class="order-summary-item">
                    <span class="order-summary-label">Предоплата:</span>
                    <span class="order-summary-value">${prepaymentAmount.toFixed(2)} руб.</span>
                </div>
                <div class="order-summary-item">
                    <span class="order-summary-label">Долг:</span>
                    <span class="order-summary-value">${debt.toFixed(2)} руб.</span>
                </div>
                ${executedBy ? `
                <div class="order-summary-item">
                    <span class="order-summary-label">Выполнил:</span>
                    <span class="order-summary-value">${this.escapeHtml(executedBy)}</span>
                </div>
                ` : ''}
            </div>
        </div>

            <div class="order-header">
                <div class="order-header-item">
                    <div class="order-header-label">Готово к:</div>
                    <div class="order-header-value">${readyDate}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Заказ принят:</div>
                    <div class="order-header-value">${createdDate}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Заказ №:</div>
                    <div class="order-header-value">${orderNumber}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Стоимость:</div>
                    <div class="order-header-value">${cost.toFixed(2)}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Предоплата:</div>
                    <div class="order-header-value">${prepaymentAmount.toFixed(2)}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Долг:</div>
                    <div class="order-header-value">${debt.toFixed(2)}</div>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 3%;">№</th>
                        <th style="width: 25%;">Наименование</th>
                        <th style="width: 50%;">Параметры</th>
                        <th style="width: 5%; text-align: center;">Кол-во</th>
                        <th style="width: 8%; text-align: right;">Цена</th>
                        <th style="width: 9%; text-align: right;">Сумма</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><strong>${this.escapeHtml(item.type)}</strong></td>
                            <td class="item-params">${this.escapeHtml(item.parameters || '')}</td>
                            <td style="text-align: center;">${item.quantity}</td>
                            <td style="text-align: right;">${item.price.toFixed(2)}</td>
                            <td style="text-align: right;"><strong>${(item.price * item.quantity).toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="summary-section">
                <div class="summary-item">
                    <div class="summary-label">ИТОГО:</div>
                    <div class="summary-value">${totalAmount.toFixed(2)} BYN</div>
                </div>
            </div>

            ${executedBy ? `
            <div class="executed-by">
                Выполнил: <strong>${this.escapeHtml(executedBy)}</strong>
            </div>
            ` : ''}
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Экранирование HTML
   */
  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
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
      
      console.log(`📄 Report saved to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('❌ Error saving report to file:', error);
      throw error;
    }
  }
}
