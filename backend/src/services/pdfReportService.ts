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
        headerTemplate: options?.headerTemplate ?? defaultHeaderTemplate,
        footerTemplate: options?.footerTemplate ?? defaultFooterTemplate
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
          orders.*,
          users.name as executedByName
        FROM orders 
        LEFT JOIN users ON users.id = orders.userId
        WHERE orders.id = ?
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
        const createdRaw = order.created_at ?? order.createdAt;
        if (createdRaw) {
          const date = new Date(createdRaw);
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

      // Вычисляем промежуточную сумму из позиций (до скидки)
      const subtotal = Array.isArray(items) && items.length > 0
        ? items.reduce((sum: number, item: any) => {
            const itemPrice = Number(item.price) || 0;
            const itemQuantity = Number(item.quantity) || 1;
            return sum + (itemPrice * itemQuantity);
          }, 0)
        : 0;

      // Применяем скидку заказа
      const discountPercent = Number(order.discount_percent) || 0;
      const calculatedTotalAmount = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;

      // Вычисляем предоплату и долг
      const rawPrepayment = order.prepaymentAmount ?? order.prepayment_amount ?? order.prepaymentamount ?? 0;
      const normalizedPrepayment = typeof rawPrepayment === 'string'
        ? Number(rawPrepayment.replace(',', '.'))
        : Number(rawPrepayment);
      const prepaymentAmount = Number.isFinite(normalizedPrepayment) ? normalizedPrepayment : 0;
      const debt = Math.max(0, calculatedTotalAmount - prepaymentAmount);

      // Генерируем HTML бланка
      const resolvedExecutedBy = order.executedByName || executedBy || undefined;
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
          
          const rawPrice = Number(item.price) || 0;
          const discountedPrice = Math.round(rawPrice * (1 - discountPercent / 100) * 100) / 100;
          return {
            type: item.type || 'Товар',
            quantity: Number(item.quantity) || 1,
            price: discountedPrice,
            parameters: paramParts.join(' | ') || ''
          };
        }),
        totalAmount: calculatedTotalAmount,
        companyPhone: companyPhones[0] || '+375 33 336 56 78',
        executedBy: resolvedExecutedBy
      });

      // Конвертируем HTML в PDF
      const pdfBuffer = await this.convertHTMLToPDF(html, {
        headerTemplate: '',
        footerTemplate: ''
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
    const logoSvg = `
      <svg class="logo-svg" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 8000 3000" width="150" height="56">
        <defs>
          <style type="text/css">
            <![CDATA[
              .fil0 {fill:black}
              .fnt2 {font-weight:900;font-size:481.04px;font-family:'Arial Black'}
              .fnt0 {font-weight:900;font-size:1272.95px;font-family:'Arial Black'}
              .fnt1 {font-weight:normal;font-size:1293.98px;font-family:'Caviar Dreams'}
            ]]>
          </style>
        </defs>
        <g id="Слой_x0020_1">
          <metadata id="CorelCorpID_0Corel-Layer"/>
          <g id="_1950664136784">
            <g>
              <g transform="matrix(0.852151 0 0 1 -3093.37 73.6627)">
                <text x="4000" y="1500"  class="fil0 fnt0">PRiN</text>
                <text x="7393.68" y="1500"  class="fil0 fnt0">Т</text>
              </g>
              <text x="4105.84" y="1624.65"  class="fil0 fnt1">CORE</text>
            </g>
            <text x="1389.95" y="2339.92"  class="fil0 fnt2">ПЕЧАТНЫЙ ЦЕНТР</text>
          </g>
        </g>
      </svg>
    `;

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
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
        }
        .logo-svg {
            display: block;
            width: 150px;
            height: auto;
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
                <div class="tear-off-logo">${logoSvg}</div>
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
                <div class="tear-off-date-label">Заказ поступил:</div>
                <div class="tear-off-date-value">${createdDate}</div>
            </div>
            <div class="tear-off-date-item">
                <div class="tear-off-date-label">Готовность:</div>
                <div class="tear-off-date-value">${readyDate}</div>
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
                <div class="company-name">${logoSvg}</div>
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
                    <div class="order-header-label">Заказ принят:</div>
                    <div class="order-header-value">${createdDate}</div>
                </div>
                <div class="order-header-item">
                    <div class="order-header-label">Готово к:</div>
                    <div class="order-header-value">${readyDate}</div>
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

  /** Реквизиты организации для товарного чека (env или значения по умолчанию) */
  private static getCompanyForReceipt(): { name: string; unp: string } {
    return {
      name: process.env.COMPANY_NAME || 'ООО "Светлан Эстетикс"',
      unp: process.env.COMPANY_UNP || '193679900'
    };
  }

  /** Сумма прописью для товарного чека: "(X) белорусских рублей Y копеек" */
  private static amountInWordsBel(num: number): string {
    const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const onesF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

    const rub = Math.floor(num);
    const kop = Math.round((num - rub) * 100);

    const three = (n: number, fem: boolean) => {
      if (n === 0) return '';
      const o = fem ? onesF : ones;
      let r = '';
      if (n >= 100) r += hundreds[Math.floor(n / 100)] + ' ';
      const rem = n % 100;
      if (rem >= 20) r += tens[Math.floor(rem / 10)] + ' ' + o[rem % 10] + ' ';
      else if (rem >= 10) r += teens[rem - 10] + ' ';
      else if (rem > 0) r += o[rem] + ' ';
      return r.trim();
    };

    let w = '';
    if (rub >= 1_000_000) {
      const m = Math.floor(rub / 1_000_000);
      w += three(m, false) + ' ';
      const ld = m % 10, l2 = m % 100;
      w += (l2 >= 11 && l2 <= 19) ? 'миллионов ' : (ld === 1 ? 'миллион ' : ld >= 2 && ld <= 4 ? 'миллиона ' : 'миллионов ');
    }
    const th = Math.floor((rub % 1_000_000) / 1000);
    if (th > 0) {
      w += three(th, true) + ' ';
      const ld = th % 10, l2 = th % 100;
      w += (l2 >= 11 && l2 <= 19) ? 'тысяч ' : (ld === 1 ? 'тысяча ' : ld >= 2 && ld <= 4 ? 'тысячи ' : 'тысяч ');
    }
    const u = rub % 1000;
    w += (u > 0 || rub === 0) ? three(u, false) + ' ' : '';
    w = w.trim().replace(/\s+/g, ' ');

    let kopStr = '';
    if (kop > 0) {
      kopStr = String(kop);
      if (kop === 1) kopStr += ' копейка';
      else if (kop >= 2 && kop <= 4) kopStr += ' копейки';
      else kopStr += ' копеек';
    } else {
      kopStr = '00 копеек';
    }
    return w ? `(${w}) белорусских рублей ${kopStr}` : kopStr;
  }

  /**
   * Краткое название позиции для товарного чека: название продукта, стороны печати, материал и плотность в одном блоке (напр. "Визитки. 2-стор., офисная 80 г").
   */
  private static getCommodityReceiptItemName(it: any): string {
    let productName = (it.type || 'Товар').trim();
    let sidesStr = '';
    let materialDensityStr = '';
    try {
      const params = typeof it.params === 'string' ? JSON.parse(it.params || '{}') : (it.params || {});
      if (params.productName) productName = String(params.productName).trim();

      const specs = params.specifications || {};
      const ps: Array<{ label?: string; key?: string; value?: string }> = Array.isArray(params.parameterSummary) ? params.parameterSummary : [];

      const sides = specs.sides ?? (typeof specs.sides === 'number' ? specs.sides : undefined);
      if (sides === 1) sidesStr = '1-стор.';
      else if (sides === 2) sidesStr = '2-стор.';
      if (!sidesStr && ps.length) {
        const sidesEntry = ps.find((x: any) => /сторон|печать|sides/i.test(String(x.label || x.key || '')));
        if (sidesEntry?.value) sidesStr = String(sidesEntry.value).toLowerCase().includes('двух') || String(sidesEntry.value).includes('2') ? '2-стор.' : '1-стор.';
      }

      const paperTypeEntry = ps.find((x: any) => /тип\s*бумаги|paperType|бумага/i.test(String(x.label || x.key || '')));
      const densityEntry = ps.find((x: any) => /плотность|density|г\/м/i.test(String(x.label || x.key || '')));
      const paperTypeVal = paperTypeEntry?.value ? String(paperTypeEntry.value).trim() : '';
      let densityVal = densityEntry?.value ? String(densityEntry.value).trim() : '';
      if (!paperTypeVal && !densityVal) {
        if (specs.paperType || specs.paperDensity) {
          const pt = specs.paperType ? String(specs.paperType) : '';
          const den = specs.paperDensity ? String(specs.paperDensity) : '';
          if (pt) materialDensityStr = pt.toLowerCase();
          if (den) materialDensityStr += (materialDensityStr ? ' ' : '') + den.replace(/\s*г\/м².*/i, '').trim() + ' г';
        }
      } else {
        if (densityVal) {
          densityVal = densityVal.replace(/\s*г\/м².*/i, '').trim();
          if (densityVal && !/\d/.test(densityVal)) densityVal = '';
          else if (densityVal && !/г\s*$/i.test(densityVal)) densityVal = densityVal + ' г';
        }
        materialDensityStr = [paperTypeVal.toLowerCase(), densityVal].filter(Boolean).join(' ');
      }
    } catch (_) { /* ignore */ }

    const extra = [sidesStr, materialDensityStr].filter(Boolean);
    if (extra.length) return `${productName}. ${extra.join(', ')}`;
    return productName;
  }

  /**
   * Генерация PDF товарного чека по заказу (заполненный)
   */
  static async generateCommodityReceipt(
    orderId: number,
    executedBy?: string
  ): Promise<Buffer> {
    try {
      console.log(`📄 Generating commodity receipt for order ${orderId}...`);
      const db = await getDb();

      const order: any = await db.get(`
        SELECT orders.*, users.name as executedByName
        FROM orders
        LEFT JOIN users ON users.id = orders.userId
        WHERE orders.id = ?
      `, [orderId]);
      if (!order) throw new Error(`Заказ с ID ${orderId} не найден`);

      const items = await db.all(`
        SELECT id, type, quantity, price, params
        FROM items
        WHERE orderId = ?
        ORDER BY id
      `, [orderId]) as any[];

      const createdRaw = order.created_at ?? order.createdAt;
      let orderDate = '';
      if (createdRaw) {
        const d = new Date(createdRaw);
        if (!isNaN(d.getTime())) {
          const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
          orderDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
        }
      }
      if (!orderDate) {
        const d = new Date();
        const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        orderDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
      }

      const receiptNumber = String(order.number || orderId);
      const orderNumber = String(order.number || orderId);
      const discountPercent = Number(order.discount_percent) || 0;
      const rows = (items || []).map((it: any, idx: number) => {
        const q = Number(it.quantity) || 1;
        const rawP = Number(it.price) || 0;
        const p = Math.round(rawP * (1 - discountPercent / 100) * 100) / 100;
        const sum = Math.round(q * p * 100) / 100;
        const name = this.getCommodityReceiptItemName(it);
        return { num: idx + 1, name, quantity: q, price: p, sum };
      });
      const totalAmount = rows.reduce((s: number, r: any) => s + r.sum, 0);

      const company = this.getCompanyForReceipt();
      const manager = order.executedByName || executedBy || '';

      const html = this.generateCommodityReceiptHTML({
        receiptNumber,
        orderNumber,
        orderDate,
        companyName: company.name,
        unp: company.unp,
        rows,
        totalAmount,
        amountInWords: this.amountInWordsBel(totalAmount),
        manager,
        isBlank: false
      });

      const pdfBuffer = await this.convertHTMLToPDF(html, { headerTemplate: '', footerTemplate: '' });
      return pdfBuffer;
    } catch (error: any) {
      console.error('❌ Error generating commodity receipt:', error);
      throw new Error(`Ошибка генерации товарного чека: ${error?.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Генерация PDF бланка товарного чека (пустая форма)
   */
  static async generateCommodityReceiptBlank(): Promise<Buffer> {
    try {
      console.log(`📄 Generating commodity receipt blank...`);
      const company = this.getCompanyForReceipt();
      const html = this.generateCommodityReceiptHTML({
        receiptNumber: '______',
        orderNumber: '______',
        orderDate: '________________',
        companyName: company.name,
        unp: company.unp,
        rows: [],
        totalAmount: 0,
        amountInWords: '',
        manager: '',
        isBlank: true
      });
      const pdfBuffer = await this.convertHTMLToPDF(html, { headerTemplate: '', footerTemplate: '' });
      return pdfBuffer;
    } catch (error: any) {
      console.error('❌ Error generating commodity receipt blank:', error);
      throw new Error(`Ошибка генерации бланка товарного чека: ${error?.message || 'Неизвестная ошибка'}`);
    }
  }

  private static generateCommodityReceiptHTML(data: {
    receiptNumber: string;
    orderNumber: string;
    orderDate: string;
    companyName: string;
    unp: string;
    rows: Array<{ num: number; name: string; quantity: number; price: number; sum: number }>;
    totalAmount: number;
    amountInWords: string;
    manager: string;
    isBlank: boolean;
  }): string {
    const fmt = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { receiptNumber, orderNumber, orderDate, companyName, unp, rows, totalAmount, amountInWords, manager, isBlank } = data;

    const tableRows = isBlank
      ? `
        <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>2</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>4</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>5</td><td></td><td></td><td></td><td></td></tr>
      `
      : rows.map((r) => `
        <tr>
          <td>${r.num}</td>
          <td>${this.escapeHtml(r.name)}</td>
          <td>${r.quantity} шт.</td>
          <td>${fmt(r.price)}</td>
          <td>${fmt(r.sum)}</td>
        </tr>
      `).join('');

    const totalStr = isBlank ? '' : fmt(totalAmount);
    const itemsCount = rows.length;
    const summaryLine = isBlank
      ? 'Всего наименований ______, на сумму ________________ бел. руб. _________________________________________'
      : `Всего наименований ${itemsCount}, на сумму ${fmt(totalAmount)} бел. руб. ${amountInWords}`;

    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Товарный чек ${isBlank ? '(бланк)' : receiptNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 16px; line-height: 1.35; }
    .header { margin-bottom: 10px; }
    .title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
    .org { margin-bottom: 2px; }
    .unp { margin-bottom: 8px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    td:nth-child(1) { width: 28px; text-align: center; }
    td:nth-child(3) { width: 80px; text-align: right; }
    td:nth-child(4), td:nth-child(5) { text-align: right; width: 70px; }
    .total { font-weight: bold; margin: 6px 0; }
    .summary { margin: 8px 0; }
    .manager { margin-top: 12px; }
    .sign { margin-top: 24px; font-size: 10px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Товарный чек № ${receiptNumber} к заказу № ${orderNumber} от ${orderDate}</div>
    <div class="org">Организация ${this.escapeHtml(companyName)}</div>
    <div class="unp">УНП ${unp}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Товар</th>
        <th>Количество</th>
        <th>Цена</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="total">Итого: ${totalStr}</div>
  <div class="summary">${summaryLine}</div>
  <div class="manager">${manager ? `Менеджер: ${this.escapeHtml(manager)}` : 'Менеджер: ________________'}</div>
  <div class="sign">(подпись)</div>
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
   * Генерация товарного чека
   */
  static async generateReceipt(
    orderId: number,
    receiptNumber?: number
  ): Promise<Buffer> {
    try {
      console.log(`📄 Generating receipt for order ${orderId}...`);
      
      const db = await getDb();
      
      // Получаем заказ
      const order: any = await db.get(`
        SELECT 
          orders.*,
          users.name as managerName
        FROM orders 
        LEFT JOIN users ON users.id = orders.userId
        WHERE orders.id = ?
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

      const discountPercent = Number(order.discount_percent) || 0;

      // Формируем список товаров с упрощенными названиями и ценами со скидкой
      const receiptItems = (Array.isArray(items) ? items : []).map((item, index) => {
        let params: any = {};
        try {
          if (item.params) {
            params = typeof item.params === 'string' ? JSON.parse(item.params) : (item.params || {});
          }
        } catch (e) {
          params = {};
        }
        
        // Упрощенное название товара (как в примере)
        let itemName = item.type || 'Товар';
        
        // Если есть productName в params, используем его
        if (params.productName) {
          itemName = params.productName;
        } else if (params.description) {
          // Берем только основную часть описания
          itemName = params.description.split('.')[0] || itemName;
        }
        
        const qty = Number(item.quantity) || 1;
        const rawPrice = Number(item.price) || 0;
        const price = Math.round(rawPrice * (1 - discountPercent / 100) * 100) / 100;
        const amount = Math.round(qty * price * 100) / 100;
        return {
          number: index + 1,
          name: itemName,
          quantity: qty,
          price,
          amount
        };
      });

      const totalAmount = receiptItems.reduce((sum, it) => sum + it.amount, 0);

      // Форматируем дату
      let createdDate = '';
      try {
        const createdRaw = order.created_at ?? order.createdAt;
        if (createdRaw) {
          const date = new Date(createdRaw);
          if (!isNaN(date.getTime())) {
            const day = date.getDate();
            const month = date.toLocaleDateString('ru-RU', { month: 'long' });
            const year = date.getFullYear();
            createdDate = `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${year} г.`;
          }
        }
      } catch (e) {
        console.error('Error formatting created date:', e);
      }
      if (!createdDate) {
        const date = new Date();
        const day = date.getDate();
        const month = date.toLocaleDateString('ru-RU', { month: 'long' });
        const year = date.getFullYear();
        createdDate = `${day} ${month.charAt(0).toUpperCase() + month.slice(1)} ${year} г.`;
      }

      // Генерируем номер чека (если не передан, используем ID заказа)
      const receiptNum = receiptNumber || orderId;

      // Генерируем HTML товарного чека
      const managerName = order.managerName || 'Менеджер';
      const html = this.generateReceiptHTML({
        receiptNumber: receiptNum,
        orderNumber: order.number || `ORD-${order.id}`,
        orderDate: createdDate,
        items: receiptItems,
        totalAmount: totalAmount,
        managerName: managerName
      });

      // Конвертируем HTML в PDF
      const pdfBuffer = await this.convertHTMLToPDF(html, {
        headerTemplate: '',
        footerTemplate: ''
      });
      
      return pdfBuffer;
    } catch (error: any) {
      console.error('❌ Error generating receipt:', error);
      console.error('Error details:', {
        orderId,
        message: error?.message,
        stack: error?.stack
      });
      throw new Error(`Ошибка генерации товарного чека: ${error?.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Генерация HTML товарного чека
   */
  private static generateReceiptHTML(data: {
    receiptNumber: number;
    orderNumber: string;
    orderDate: string;
    items: Array<{
      number: number;
      name: string;
      quantity: number;
      price: number;
      amount: number;
    }>;
    totalAmount: number;
    managerName: string;
  }): string {
    const { receiptNumber, orderNumber, orderDate, items, totalAmount, managerName } = data;
    
    // Функция для преобразования числа в пропись
    const numberToWords = (num: number): string => {
      const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
      const onesFeminine = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
      const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
      const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
      const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
      
      if (num === 0) return 'ноль';
      
      const rubles = Math.floor(num);
      const kopecks = Math.round((num - rubles) * 100);
      
      const convertThreeDigits = (n: number, feminine: boolean = false): string => {
        if (n === 0) return '';
        
        const h = Math.floor(n / 100);
        const t = Math.floor((n % 100) / 10);
        const o = n % 10;
        
        let result = '';
        if (h > 0) result += hundreds[h] + ' ';
        if (t === 1) {
          result += teens[o] + ' ';
        } else {
          if (t > 1) result += tens[t] + ' ';
          if (o > 0) result += (feminine ? onesFeminine[o] : ones[o]) + ' ';
        }
        return result.trim();
      };
      
      let rublesText = convertThreeDigits(rubles, true);
      if (rublesText) {
        // Склонение рублей
        const lastDigit = rubles % 10;
        const lastTwoDigits = rubles % 100;
        let rubleWord = 'рублей';
        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
          rubleWord = 'рублей';
        } else if (lastDigit === 1) {
          rubleWord = 'рубль';
        } else if (lastDigit >= 2 && lastDigit <= 4) {
          rubleWord = 'рубля';
        }
        rublesText += ' ' + rubleWord;
      } else {
        rublesText = 'ноль рублей';
      }
      
      // Копейки
      let kopecksText = '';
      if (kopecks > 0) {
        const kopecksWords = convertThreeDigits(kopecks, true);
        const lastDigit = kopecks % 10;
        const lastTwoDigits = kopecks % 100;
        let kopekWord = 'копеек';
        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
          kopekWord = 'копеек';
        } else if (lastDigit === 1) {
          kopekWord = 'копейка';
        } else if (lastDigit >= 2 && lastDigit <= 4) {
          kopekWord = 'копейки';
        }
        kopecksText = kopecksWords + ' ' + kopekWord;
      } else {
        kopecksText = '00 копеек';
      }
      
      return rublesText + ' ' + kopecksText;
    };

    const totalInWords = numberToWords(totalAmount);
    const itemsCount = items.length;
    
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Товарный чек №${receiptNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Times New Roman', serif;
            font-size: 12pt;
            line-height: 1.4;
            padding: 20px;
            color: #000;
        }
        .receipt {
            max-width: 600px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 15px;
        }
        .header h1 {
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .company-info {
            text-align: left;
            margin-bottom: 15px;
        }
        .company-info div {
            margin-bottom: 3px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }
        table th, table td {
            border: 1px solid #000;
            padding: 5px;
            text-align: left;
        }
        table th {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: center;
        }
        table td {
            font-size: 11pt;
        }
        .number-col {
            width: 5%;
            text-align: center;
        }
        .name-col {
            width: 45%;
        }
        .quantity-col {
            width: 15%;
            text-align: center;
        }
        .price-col {
            width: 15%;
            text-align: right;
        }
        .amount-col {
            width: 20%;
            text-align: right;
        }
        .total {
            text-align: right;
            font-weight: bold;
            margin-bottom: 15px;
        }
        .summary {
            margin-bottom: 15px;
            line-height: 1.6;
        }
        .manager {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .manager-name {
            font-weight: bold;
        }
        .signature {
            margin-top: 30px;
            text-align: right;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <h1>Товарный чек № ${receiptNumber} к заказу № ${orderNumber} от ${orderDate}</h1>
        </div>
        
        <div class="company-info">
            <div>Организация ООО "Светлан Эстетикс"</div>
            <div>УНП 193679900</div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th class="number-col">№</th>
                    <th class="name-col">Товар</th>
                    <th class="quantity-col">Количество</th>
                    <th class="price-col">Цена</th>
                    <th class="amount-col">Сумма</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td class="number-col">${item.number}</td>
                        <td class="name-col">${this.escapeHtml(item.name)}</td>
                        <td class="quantity-col">${item.quantity} шт.</td>
                        <td class="price-col">${item.price.toFixed(2)}</td>
                        <td class="amount-col">${item.amount.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="total">
            Итого: ${totalAmount.toFixed(2)}
        </div>
        
        <div class="summary">
            Всего наименований ${itemsCount}, на сумму ${totalAmount.toFixed(2)} бел. руб. (${totalInWords})
        </div>
        
        <div class="manager">
            <div>
                <div class="manager-name">Менеджер: ${this.escapeHtml(managerName)}</div>
            </div>
            <div class="signature">
                (подпись)
            </div>
        </div>
    </div>
</body>
</html>`;

    return html;
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
