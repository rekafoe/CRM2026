import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { getDb } from '../config/database';

export interface DocumentTemplate {
  id: number;
  name: string;
  type: 'contract' | 'act' | 'invoice';
  file_path: string;
  created_at: string;
  updated_at: string;
  is_default: boolean;
}

export interface TemplateData {
  // Данные клиента
  customerName?: string;
  companyName?: string;
  legalName?: string;
  legalAddress?: string;
  taxId?: string;
  bankDetails?: string;
  authorizedPerson?: string;
  
  // Данные договора
  contractNumber?: string;
  contractDate?: string;
  
  // Заказы
  orders?: Array<{
    number: string;
    date: string;
    amount: number;
    status: string;
  }>;
  totalAmount?: number;
  
  // Дополнительные поля
  [key: string]: any;
}

export class DocumentTemplateService {
  private static templatesDir = path.resolve(__dirname, '../templates');
  
  static init() {
    // Создаем директорию для шаблонов, если её нет
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
    
    // Создаем таблицу для шаблонов, если её нет
    this.initDatabase();
  }
  
  private static async initDatabase() {
    const db = await getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS document_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('contract', 'act', 'invoice')),
        file_path TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Таблица для маппинга полей шаблона
    await db.exec(`
      CREATE TABLE IF NOT EXISTS template_field_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL,
        template_field TEXT NOT NULL,
        system_field TEXT NOT NULL,
        field_label TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
        UNIQUE(template_id, template_field)
      )
    `);
  }
  
  /**
   * Сохранить шаблон в базу данных
   */
  static async saveTemplate(
    name: string,
    type: 'contract' | 'act' | 'invoice',
    filePath: string,
    isDefault: boolean = false
  ): Promise<DocumentTemplate> {
    const db = await getDb();
    
    console.log(`[DocumentTemplate] Сохранение шаблона: имя="${name}", тип="${type}", путь="${filePath}", по умолчанию=${isDefault}`);
    
    // Если это шаблон по умолчанию, снимаем флаг с других шаблонов этого типа
    if (isDefault) {
      await db.run(
        'UPDATE document_templates SET is_default = 0 WHERE type = ?',
        type
      );
      console.log(`[DocumentTemplate] Снят флаг is_default с других шаблонов типа "${type}"`);
    }
    
    const result = await db.run(
      `INSERT INTO document_templates (name, type, file_path, is_default, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      name,
      type,
      filePath,
      isDefault ? 1 : 0
    );
    
    const savedTemplate = await this.getTemplate(result.lastID!);
    console.log(`[DocumentTemplate] Шаблон сохранен: ID=${savedTemplate.id}, имя="${savedTemplate.name}", путь="${savedTemplate.file_path}", is_default=${savedTemplate.is_default}`);
    
    return savedTemplate;
  }
  
  /**
   * Получить шаблон по ID
   */
  static async getTemplate(id: number): Promise<DocumentTemplate> {
    const db = await getDb();
    const template = await db.get<DocumentTemplate>(
      'SELECT * FROM document_templates WHERE id = ?',
      id
    );
    
    if (!template) {
      throw new Error('Шаблон не найден');
    }
    
    return template;
  }
  
  /**
   * Получить шаблон по умолчанию для типа
   * Если шаблон по умолчанию не найден, возвращает первый доступный шаблон этого типа
   */
  static async getDefaultTemplate(type: 'contract' | 'act' | 'invoice'): Promise<DocumentTemplate | null> {
    const db = await getDb();
    
    // Сначала ищем шаблон по умолчанию
    let template = await db.get<DocumentTemplate>(
      'SELECT * FROM document_templates WHERE type = ? AND is_default = 1 LIMIT 1',
      type
    );
    
    // Если не найден, берем самый новый загруженный шаблон этого типа
    // (самый новый = с самым большим ID или самой поздней датой создания)
    if (!template) {
      // Сначала получаем все шаблоны этого типа для отладки
      const allTemplates = await db.all<DocumentTemplate>(
        'SELECT * FROM document_templates WHERE type = ? ORDER BY id DESC, created_at DESC',
        type
      );
      
      const templatesArray = Array.isArray(allTemplates) ? allTemplates : [];
      console.log(`[DocumentTemplate] Найдено шаблонов типа "${type}": ${templatesArray.length}`);
      templatesArray.forEach((t, index) => {
        console.log(`[DocumentTemplate]   ${index + 1}. ID ${t.id}, имя "${t.name}", is_default=${t.is_default}, создан ${t.created_at}, путь: ${t.file_path}`);
      });
      
      template = templatesArray[0] || null;
    }
    
    if (template) {
      console.log(`[DocumentTemplate] Выбран шаблон для типа "${type}": ID ${template.id}, имя "${template.name}", путь "${template.file_path}", is_default=${template.is_default}`);
    } else {
      console.warn(`[DocumentTemplate] Шаблон для типа "${type}" не найден в базе данных`);
    }
    
    return template || null;
  }
  
  /**
   * Получить все шаблоны
   */
  static async getAllTemplates(): Promise<DocumentTemplate[]> {
    const db = await getDb();
    const rows = await db.all<DocumentTemplate>('SELECT * FROM document_templates ORDER BY type, name');
    return (Array.isArray(rows) ? rows : []) as DocumentTemplate[];
  }
  
  /**
   * Получить шаблоны по типу
   */
  static async getTemplatesByType(type: 'contract' | 'act' | 'invoice'): Promise<DocumentTemplate[]> {
    const db = await getDb();
    const rows = await db.all<DocumentTemplate>(
      'SELECT * FROM document_templates WHERE type = ? ORDER BY is_default DESC, name',
      type
    );
    return (Array.isArray(rows) ? rows : []) as DocumentTemplate[];
  }
  
  /**
   * Установить шаблон как шаблон по умолчанию
   */
  static async setDefaultTemplate(id: number): Promise<void> {
    const db = await getDb();
    const template = await this.getTemplate(id);
    
    // Снимаем флаг с других шаблонов этого типа
    await db.run(
      'UPDATE document_templates SET is_default = 0 WHERE type = ?',
      template.type
    );
    
    // Устанавливаем флаг для выбранного шаблона
    await db.run(
      'UPDATE document_templates SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      id
    );
  }
  
  /**
   * Удалить шаблон
   */
  static async deleteTemplate(id: number): Promise<void> {
    const db = await getDb();
    const template = await this.getTemplate(id);
    
    // Удаляем файл
    if (fs.existsSync(template.file_path)) {
      fs.unlinkSync(template.file_path);
    }
    
    // Удаляем запись из БД
    await db.run('DELETE FROM document_templates WHERE id = ?', id);
  }
  
  /**
   * Генерация Word документа из шаблона
   */
  static async generateWordFromTemplate(
    templatePath: string,
    data: TemplateData
  ): Promise<Buffer> {
    try {
      // Читаем шаблон
      const content = fs.readFileSync(templatePath, 'binary');
      const zip = new PizZip(content);
      
      // Создаем экземпляр Docxtemplater
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
      
      // Заполняем шаблон данными
      doc.render(data);
      
      // Генерируем документ
      const buf = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      
      return buf;
    } catch (error: any) {
      if (error.properties && error.properties.errors instanceof Array) {
        const errors = error.properties.errors
          .map((e: any) => e.properties?.explanation || e.message)
          .join(', ');
        throw new Error(`Ошибка в шаблоне: ${errors}`);
      }
      throw new Error(`Ошибка генерации документа: ${error.message}`);
    }
  }
  
  /**
   * Генерация Excel документа из шаблона с использованием exceljs (сохраняет форматирование)
   */
  static async generateExcelFromTemplate(
    templatePath: string,
    data: TemplateData
  ): Promise<Buffer> {
    try {
      // Проверяем существование файла
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Файл шаблона не найден: ${templatePath}`);
      }
      
      console.log(`[DocumentTemplate] Генерация Excel из шаблона через exceljs: ${templatePath}`);
      
      // Проверяем расширение файла
      const ext = path.extname(templatePath).toLowerCase();
      if (ext !== '.xlsx' && ext !== '.xls') {
        throw new Error(`Неподдерживаемый формат файла: ${ext}. Используйте .xlsx или .xls формат.`);
      }
      
      // Загружаем шаблон через exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);
      
      if (workbook.worksheets.length === 0) {
        throw new Error('Шаблон не содержит листов');
      }
      
      const worksheet = workbook.worksheets[0];
      
      // Автоматически вычисляем totalAmount из orders или orderItems
      let totalAmount = data.totalAmount;
      if ((totalAmount === undefined || totalAmount === null) && data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
        totalAmount = data.orders.reduce((sum, order) => {
          const amount = typeof order.amount === 'number' ? order.amount : Number(order.amount) || 0;
          return sum + amount;
        }, 0);
      }
      // Если totalAmount не указан, вычисляем из orderItems
      if ((totalAmount === undefined || totalAmount === null || totalAmount === 0) && data.orderItems && Array.isArray(data.orderItems) && data.orderItems.length > 0) {
        totalAmount = data.orderItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      }
      
      // Вычисляем общее количество позиций
      let totalQuantity = 0;
      if (data.orderItems && Array.isArray(data.orderItems) && data.orderItems.length > 0) {
        totalQuantity = data.orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      }
      
      // Подготавливаем данные для шаблона
      const templateData: any = {
        customerName: data.customerName || data.companyName || '',
        companyName: data.companyName || '',
        legalName: data.legalName || '',
        legalAddress: data.legalAddress || '',
        taxId: data.taxId || '',
        bankDetails: data.bankDetails || '',
        authorizedPerson: data.authorizedPerson || '',
        contractNumber: data.contractNumber || '',
        contractDate: data.contractDate || new Date().toLocaleDateString('ru-RU'),
        totalAmount: totalAmount || 0,
        totalQuantity: totalQuantity,
        executorAuthorizedPerson: '', // Можно добавить в конфигурацию системы
      };
      
      // Функция для преобразования числа в пропись (поддержка до миллиона)
      const numberToWords = (num: number): string => {
        const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
        const onesFeminine = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
        const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
        const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
        const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
        
        if (num === 0) return 'ноль рублей';
        
        const rubles = Math.floor(num);
        const kopecks = Math.round((num - rubles) * 100);
        
        // Функция для преобразования трехзначного числа (0-999)
        const convertThreeDigits = (n: number, useFeminine: boolean = false): string => {
          if (n === 0) return '';
          
          const onesArray = useFeminine ? onesFeminine : ones;
          let result = '';
          
          // Сотни
          if (n >= 100) {
            const h = Math.floor(n / 100);
            result += hundreds[h] + ' ';
          }
          
          // Десятки и единицы
          const remainder = n % 100;
          if (remainder >= 20) {
            const t = Math.floor(remainder / 10);
            const o = remainder % 10;
            result += tens[t] + ' ' + onesArray[o] + ' ';
          } else if (remainder >= 10) {
            result += teens[remainder - 10] + ' ';
          } else if (remainder > 0) {
            result += onesArray[remainder] + ' ';
          }
          
          return result.trim();
        };
        
        let result = '';
        
        // Миллионы (1,000,000 - 999,999,999)
        if (rubles >= 1000000) {
          const millions = Math.floor(rubles / 1000000);
          const millionsPart = convertThreeDigits(millions);
          result += millionsPart + ' ';
          
          // Склонение "миллион"
          const lastDigit = millions % 10;
          const lastTwoDigits = millions % 100;
          if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
            result += 'миллионов ';
          } else if (lastDigit === 1) {
            result += 'миллион ';
          } else if (lastDigit >= 2 && lastDigit <= 4) {
            result += 'миллиона ';
          } else {
            result += 'миллионов ';
          }
        }
        
        // Тысячи (1,000 - 999,999)
        const thousands = Math.floor((rubles % 1000000) / 1000);
        if (thousands > 0) {
          const thousandsPart = convertThreeDigits(thousands, true); // Для тысяч используем женский род
          result += thousandsPart + ' ';
          
          // Склонение "тысяча"
          const lastDigit = thousands % 10;
          const lastTwoDigits = thousands % 100;
          if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
            result += 'тысяч ';
          } else if (lastDigit === 1) {
            result += 'тысяча ';
          } else if (lastDigit >= 2 && lastDigit <= 4) {
            result += 'тысячи ';
          } else {
            result += 'тысяч ';
          }
        }
        
        // Единицы (0 - 999)
        const units = rubles % 1000;
        if (units > 0 || rubles === 0) {
          const unitsPart = convertThreeDigits(units);
          result += unitsPart + ' ';
        }
        
        // Склонение рублей
        const lastDigit = rubles % 10;
        const lastTwoDigits = rubles % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
          result += 'рублей';
        } else if (lastDigit === 1) {
          result += 'рубль';
        } else if (lastDigit >= 2 && lastDigit <= 4) {
          result += 'рубля';
        } else {
          result += 'рублей';
        }
        
        // Копейки
        if (kopecks > 0) {
          result += ' ' + kopecks;
          if (kopecks === 1) {
            result += ' копейка';
          } else if (kopecks >= 2 && kopecks <= 4) {
            result += ' копейки';
          } else {
            result += ' копеек';
          }
        }
        
        return result.trim().replace(/\s+/g, ' '); // Убираем лишние пробелы
      };
      
      templateData.totalAmountInWords = numberToWords(totalAmount || 0);
      
      // Добавляем все дополнительные поля из data
      Object.keys(data).forEach(key => {
        if (key !== 'orderItems' && !templateData.hasOwnProperty(key)) {
          templateData[key] = data[key];
        }
      });
      
      // Обрабатываем простые плейсхолдеры и таблицы
      console.log(`[DocumentTemplate] Обрабатываем шаблон через exceljs, orderItems: ${data.orderItems?.length || 0}`);
      
      // Функция для очистки значений от невалидных XML символов
      const sanitizeValue = (value: any): any => {
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'string') {
          // Удаляем невалидные XML символы (контрольные символы кроме табуляции, переноса строки и возврата каретки)
          return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        }
        if (typeof value === 'number') {
          // Проверяем, что число валидно
          if (isNaN(value) || !isFinite(value)) {
            return '';
          }
          return value;
        }
        if (typeof value === 'boolean') {
          return value;
        }
        // Для остальных типов преобразуем в строку
        return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      };
      
      // Обрабатываем все ячейки листа
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          if (cell.value && typeof cell.value === 'string') {
            let cellValue = cell.value;
            
            // Заменяем простые плейсхолдеры ${fieldName}
            cellValue = cellValue.replace(/\$\{(\w+)\}/g, (match, fieldName) => {
              const value = templateData[fieldName];
              return sanitizeValue(value);
            });
            
            // Если значение изменилось, обновляем ячейку с очисткой
            if (cellValue !== cell.value) {
              try {
                cell.value = sanitizeValue(cellValue);
              } catch (e) {
                console.warn(`[DocumentTemplate] Ошибка установки значения для ячейки ${rowNumber}:${colNumber}`, e);
                cell.value = '';
              }
            }
          }
        });
      });
      
      // Обрабатываем таблицу orderItems
      if (data.orderItems && Array.isArray(data.orderItems) && data.orderItems.length > 0) {
        console.log(`[DocumentTemplate] Обрабатываем таблицу orderItems: ${data.orderItems.length} позиций`);
        
        // Ищем строку с маркером ${table:orderItems}
        let tableMarkerRow: number | null = null;
        let templateRowNumber: number | null = null;
        
        worksheet.eachRow((row, rowNumber) => {
          row.eachCell((cell) => {
            if (cell.value && typeof cell.value === 'string') {
              const cellValue = cell.value.trim();
              if (cellValue === '${table:orderItems}' || cellValue.includes('${table:orderItems}')) {
                tableMarkerRow = rowNumber;
                templateRowNumber = rowNumber + 1; // Следующая строка - шаблон
                console.log(`[DocumentTemplate] Найден маркер таблицы в строке ${rowNumber}`);
              }
            }
          });
        });
        
        // Если не нашли маркер, ищем строку с плейсхолдерами позиций
        if (!templateRowNumber) {
          const itemPlaceholders = ['${number}', '${name}', '${unit}', '${quantity}', '${price}', '${amount}'];
          worksheet.eachRow((row, rowNumber) => {
            let foundPlaceholders = 0;
            row.eachCell((cell) => {
              if (cell.value && typeof cell.value === 'string') {
                const cellValue = cell.value.trim();
                for (const placeholder of itemPlaceholders) {
                  if (cellValue === placeholder || cellValue.includes(placeholder)) {
                    foundPlaceholders++;
                    break;
                  }
                }
              }
            });
            if (foundPlaceholders >= 3 && !templateRowNumber) {
              templateRowNumber = rowNumber;
              console.log(`[DocumentTemplate] Найдена строка-шаблон в строке ${rowNumber} с ${foundPlaceholders} плейсхолдерами`);
            }
          });
        }
        
        if (templateRowNumber) {
          // Получаем шаблон строки
          const templateRow = worksheet.getRow(templateRowNumber);
          const templateCells: any[] = [];
          
          // Определяем максимальное количество столбцов (обычно 10 для счёта)
          const maxColumns = 10;
          
          // Собираем данные из всех столбцов, правильно обрабатывая объединенные ячейки
          for (let colNum = 1; colNum <= maxColumns; colNum++) {
            const cell = templateRow.getCell(colNum);
            
            // Проверяем, является ли ячейка частью объединения
            // Если да, используем главную ячейку (master cell)
            let actualCell = cell;
            try {
              // В ExcelJS, если ячейка объединена, нужно получить главную ячейку
              // Проверяем через worksheet.model для определения объединений
              const cellAddress = cell.address;
              // Если ячейка является частью объединения, её master будет в другом месте
              // Для упрощения используем саму ячейку, но проверяем её значение
            } catch (e) {
              // Игнорируем ошибки
            }
            
            // Безопасно копируем только нужные свойства стиля
            const safeStyle: any = {};
            if (actualCell.style) {
              if (actualCell.style.border) safeStyle.border = actualCell.style.border;
              if (actualCell.style.fill) safeStyle.fill = actualCell.style.fill;
              if (actualCell.style.font) safeStyle.font = actualCell.style.font;
              if (actualCell.style.alignment) safeStyle.alignment = actualCell.style.alignment;
              if (actualCell.style.numFmt) safeStyle.numFmt = actualCell.style.numFmt;
            }
            
            // Для объединенных ячеек (например, B-C) используем значение главной ячейки
            // Если это столбец C и он объединен с B, используем значение из B
            let cellValue = actualCell.value;
            if (colNum === 3) {
              // Столбец C - проверяем, объединен ли он с B
              const cellB = templateRow.getCell(2);
              // Если B имеет значение, а C пустой или имеет то же значение, используем B
              if (cellB.value && (!cellValue || cellValue === cellB.value)) {
                cellValue = cellB.value;
              }
            }
            
            templateCells.push({
              value: cellValue,
              style: Object.keys(safeStyle).length > 0 ? safeStyle : undefined,
              numFmt: actualCell.numFmt,
              isMerged: colNum === 2 || colNum === 3 // Помечаем B и C как объединенные
            });
          }
          
          // Удаляем маркер таблицы, если он был найден
          if (tableMarkerRow) {
            const markerRow = worksheet.getRow(tableMarkerRow);
            markerRow.eachCell((cell) => {
              if (cell.value && typeof cell.value === 'string' && cell.value.includes('${table:orderItems}')) {
                cell.value = '';
              }
            });
          }
          
          // Вставляем строки данных
          // Если нужно вставить больше одной строки, вставляем пустые строки после шаблонной строки
          // Это сдвинет существующие строки (включая строки "Итого") вниз
          const itemsToInsert = data.orderItems.length;
          if (itemsToInsert > 1) {
            try {
              // Вставляем пустые строки после шаблонной строки
              // Используем insertRows для правильной обработки merged cells
              const rowsToInsert = Array(itemsToInsert - 1).fill(null).map(() => []);
              worksheet.insertRows(templateRowNumber! + 1, rowsToInsert);
              console.log(`[DocumentTemplate] Вставлено ${itemsToInsert - 1} пустых строк после строки ${templateRowNumber}`);
            } catch (e) {
              console.warn(`[DocumentTemplate] Не удалось вставить строки через insertRows, используем прямое заполнение:`, e);
              // Продолжаем с прямым заполнением, если insertRows не работает
            }
          }
          
          // Заполняем строки данными, начиная со шаблонной строки
          data.orderItems.forEach((item, index) => {
            const targetRowNumber = templateRowNumber! + index;
            const row = worksheet.getRow(targetRowNumber);
            
            // Маппинг столбцов: A=1, B=2, C=3 (но B-C объединены), D=4, E=5, F=6, G=7, H=8, I=9, J=10
            // Поля: number, name (B-C объединены), unit, quantity, price, amount, vatRate, vatAmount, totalWithVat
            // ВАЖНО: templateCells собирается по colNum от 1 до 10, поэтому:
            // templateCells[0] = A (colNum 1)
            // templateCells[1] = B (colNum 2, объединено с C)
            // templateCells[2] = C (colNum 3, но это та же ячейка что и B из-за объединения)
            // templateCells[3] = D (colNum 4)
            // и т.д.
            const columnMapping: { [key: number]: { field: string; templateCellIndex: number } } = {
              1: { field: 'number', templateCellIndex: 0 },      // A: number (templateCells[0])
              2: { field: 'name', templateCellIndex: 1 },        // B: name (templateCells[1], объединено с C)
              4: { field: 'unit', templateCellIndex: 3 },        // D: unit (templateCells[3])
              5: { field: 'quantity', templateCellIndex: 4 },    // E: quantity (templateCells[4])
              6: { field: 'price', templateCellIndex: 5 },       // F: price (templateCells[5])
              7: { field: 'amount', templateCellIndex: 6 },      // G: amount (templateCells[6])
              8: { field: 'vatRate', templateCellIndex: 7 },     // H: vatRate (templateCells[7], статичный "Без НДС")
              9: { field: 'vatAmount', templateCellIndex: 8 },   // I: vatAmount (templateCells[8], статичный "-")
              10: { field: 'totalWithVat', templateCellIndex: 9 } // J: totalWithVat (templateCells[9])
            };
            
            // Заполняем каждый столбец
            Object.keys(columnMapping).forEach(colNumStr => {
              const colNum = parseInt(colNumStr);
              const mapping = columnMapping[colNum];
              const templateCell = templateCells[mapping.templateCellIndex];
              const cell = row.getCell(colNum);
              let cellValue: any = '';
              
              // Логируем для первых двух позиций для отладки
              if (index < 2) {
                console.log(`[DocumentTemplate] Заполнение столбца ${colNum} (${mapping.field}) для строки ${targetRowNumber}:`, {
                  templateValue: templateCell?.value,
                  itemValue: (item as any)[mapping.field],
                  templateCellIndex: mapping.templateCellIndex
                });
              }
              
              // Пропускаем столбец C, так как он объединен с B в шаблоне
              // insertRows автоматически скопирует объединение из шаблонной строки
              if (colNum === 3) {
                return; // Пропускаем заполнение столбца C
              }
              
              // Если в шаблоне есть плейсхолдер, заменяем его
              if (templateCell && templateCell.value && typeof templateCell.value === 'string') {
                const originalValue = templateCell.value;
                cellValue = originalValue.replace(/\$\{(\w+)\}/g, (match, fieldName) => {
                  const value = (item as any)[fieldName];
                  const sanitized = sanitizeValue(value);
                  if (sanitized !== undefined && sanitized !== null && sanitized !== '') {
                    return sanitized;
                  }
                  return '';
                });
                
                // Если после замены остался плейсхолдер, очищаем значение
                if (cellValue === originalValue && originalValue.includes('${')) {
                  cellValue = '';
                }
              } else {
                // Если плейсхолдера нет в шаблоне, берем значение из item по имени поля
                // Это важно для случаев, когда в шаблоне нет плейсхолдера, но нужно заполнить ячейку
                const value = (item as any)[mapping.field];
                if (value !== undefined && value !== null) {
                  cellValue = sanitizeValue(value);
                } else {
                  cellValue = '';
                }
              }
              
              // Дополнительная проверка: если это столбец J (totalWithVat) и значение пустое,
              // но в item есть totalWithVat, используем его
              if (colNum === 10 && (!cellValue || cellValue === '') && (item as any).totalWithVat !== undefined) {
                cellValue = sanitizeValue((item as any).totalWithVat);
                console.log(`[DocumentTemplate] Восстановлено значение totalWithVat для строки ${targetRowNumber}:`, cellValue);
              }
              
              // Устанавливаем значение - убеждаемся, что значение валидно
              try {
                const sanitizedValue = sanitizeValue(cellValue);
                
                // Логируем для отладки столбца totalWithVat (столбец J, индекс 9)
                if (index < 2 && colNum === 10) {
                  console.log(`[DocumentTemplate] Заполнение ячейки ${targetRowNumber}:${colNum} (totalWithVat):`, {
                    templateValue: templateCell?.value,
                    itemTotalWithVat: (item as any).totalWithVat,
                    itemAmount: (item as any).amount,
                    cellValue: cellValue,
                    sanitizedValue: sanitizedValue
                  });
                }
                
                // Устанавливаем значение с проверкой типа
                if (typeof sanitizedValue === 'number') {
                  cell.value = sanitizedValue;
                } else if (typeof sanitizedValue === 'boolean') {
                  cell.value = sanitizedValue;
                } else if (sanitizedValue !== '' && sanitizedValue !== null && sanitizedValue !== undefined) {
                  // Все остальное - строка, но только если значение не пустое
                  cell.value = sanitizedValue;
                } else {
                  // Если значение пустое, оставляем ячейку пустой
                  cell.value = '';
                }
              } catch (e) {
                // Если не удалось установить значение, устанавливаем пустую строку
                console.warn(`[DocumentTemplate] Ошибка установки значения для ячейки ${targetRowNumber}:${colNum}`, e);
                cell.value = '';
              }
              
              // Применяем формат чисел, если он есть
              if (templateCell?.numFmt) {
                try {
                  cell.numFmt = templateCell.numFmt;
                } catch (e) {
                  console.warn(`[DocumentTemplate] Ошибка установки формата числа для ячейки ${targetRowNumber}:${colNum}`, e);
                }
              }
              
              // Безопасно копируем стили из шаблона
              if (templateCell?.style) {
                try {
                  // Копируем стили по частям, чтобы избежать проблем с XML
                  const style = templateCell.style;
                  
                  // Копируем границы (с глубоким копированием)
                  if (style.border) {
                    const border: any = {};
                    if (style.border.top) border.top = { ...style.border.top };
                    if (style.border.left) border.left = { ...style.border.left };
                    if (style.border.bottom) border.bottom = { ...style.border.bottom };
                    if (style.border.right) border.right = { ...style.border.right };
                    if (style.border.diagonal) border.diagonal = { ...style.border.diagonal };
                    if (Object.keys(border).length > 0) {
                      cell.border = border;
                    }
                  }
                  
                  // Копируем заливку
                  if (style.fill) {
                    const fill: any = { ...style.fill };
                    if (style.fill.fgColor) fill.fgColor = { ...style.fill.fgColor };
                    if (style.fill.bgColor) fill.bgColor = { ...style.fill.bgColor };
                    cell.fill = fill;
                  }
                  
                  // Копируем шрифт
                  if (style.font) {
                    const font: any = {};
                    if (style.font.name !== undefined) font.name = style.font.name;
                    if (style.font.size !== undefined) font.size = style.font.size;
                    if (style.font.bold !== undefined) font.bold = style.font.bold;
                    if (style.font.italic !== undefined) font.italic = style.font.italic;
                    if (style.font.underline !== undefined) font.underline = style.font.underline;
                    if (style.font.color !== undefined) {
                      font.color = typeof style.font.color === 'object' && style.font.color !== null
                        ? { ...style.font.color }
                        : style.font.color;
                    }
                    if (Object.keys(font).length > 0) {
                      cell.font = font;
                    }
                  }
                  
                  // Копируем выравнивание
                  if (style.alignment) {
                    const alignment: any = {};
                    if (style.alignment.horizontal !== undefined) alignment.horizontal = style.alignment.horizontal;
                    if (style.alignment.vertical !== undefined) alignment.vertical = style.alignment.vertical;
                    if (style.alignment.wrapText !== undefined) alignment.wrapText = style.alignment.wrapText;
                    if (style.alignment.textRotation !== undefined) alignment.textRotation = style.alignment.textRotation;
                    if (Object.keys(alignment).length > 0) {
                      cell.alignment = alignment;
                    }
                  }
                } catch (e) {
                  console.warn(`[DocumentTemplate] Ошибка копирования стиля для ячейки ${targetRowNumber}:${colNum}`, e);
                  // Продолжаем без стиля, если не удалось скопировать
                }
              }
            });
          });
          
          console.log(`[DocumentTemplate] Таблица успешно заполнена: ${data.orderItems.length} строк`);
        } else {
          console.warn(`[DocumentTemplate] Не найдена строка-шаблон для таблицы orderItems`);
        }
      }
      
      // Генерируем документ
      // Используем writeBuffer с базовыми опциями для сохранения стилей
      const buffer = await workbook.xlsx.writeBuffer({
        useStyles: true,
        useSharedStrings: false // Отключаем shared strings для избежания проблем
      });
      
      // Преобразуем в Buffer, если это еще не Buffer
      const result: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
      
      // Проверяем, что буфер не пустой
      if (!result || (result as Buffer).length === 0) {
        throw new Error('Сгенерированный буфер пуст');
      }
      
      const bufferLength = (result as Buffer).length;
      console.log(`[DocumentTemplate] Excel файл успешно сгенерирован через exceljs, размер: ${bufferLength} байт`);
      
      return result;
    } catch (error: any) {
      console.error(`[DocumentTemplate] Детали ошибки генерации Excel:`, {
        message: error.message,
        stack: error.stack,
        templatePath: templatePath
      });
      throw new Error(`Ошибка генерации Excel документа: ${error.message}`);
    }
  }
  
  /**
   * Альтернативная генерация Excel через библиотеку exceljs (fallback)
   * Используется, когда основной метод не работает
   */
  // Метод generateExcelDirectly удален - теперь используется exceljs в основном методе generateExcelFromTemplate

  /**
   * Генерация документа (автоматически определяет тип по расширению)
   */
  static async generateDocument(
    templatePath: string,
    data: TemplateData
  ): Promise<Buffer> {
    const ext = path.extname(templatePath).toLowerCase();
    
    if (ext === '.docx') {
      return this.generateWordFromTemplate(templatePath, data);
    } else if (ext === '.xlsx' || ext === '.xls') {
      return this.generateExcelFromTemplate(templatePath, data);
    } else {
      throw new Error(`Неподдерживаемый формат шаблона: ${ext}`);
    }
  }

  /**
   * Анализ шаблона и извлечение плейсхолдеров
   */
  static async analyzeTemplate(templateId: number): Promise<{
    placeholders: string[];
    type: 'docx' | 'xlsx' | 'xls';
  }> {
    const template = await this.getTemplate(templateId);
    const ext = path.extname(template.file_path).toLowerCase();
    
    if (ext === '.docx') {
      return this.analyzeWordTemplate(template.file_path);
    } else if (ext === '.xlsx' || ext === '.xls') {
      return this.analyzeExcelTemplate(template.file_path);
    } else {
      throw new Error(`Неподдерживаемый формат шаблона: ${ext}`);
    }
  }

  /**
   * Анализ Word шаблона (docx)
   */
  private static async analyzeWordTemplate(templatePath: string): Promise<{
    placeholders: string[];
    type: 'docx';
  }> {
    try {
      const content = fs.readFileSync(templatePath, 'binary');
      const zip = new PizZip(content);
      
      // Собираем весь XML контент из всех файлов документа
      const xmlFiles: string[] = [];
      
      // Добавляем основной документ
      if (zip.files['word/document.xml']) {
        xmlFiles.push('word/document.xml');
      }
      
      // Добавляем все header и footer файлы
      for (const fileName in zip.files) {
        if ((fileName.startsWith('word/header') || fileName.startsWith('word/footer')) && 
            fileName.endsWith('.xml')) {
          xmlFiles.push(fileName);
        }
      }
      
      // Собираем весь XML текст
      let allXmlText = '';
      for (const fileName of xmlFiles) {
        const file = zip.files[fileName];
        if (file && !file.dir) {
          try {
            allXmlText += file.asText();
          } catch (e) {
            // Игнорируем ошибки чтения отдельных файлов
          }
        }
      }
      
      // Извлекаем плейсхолдеры из XML
      // Word может разбивать плейсхолдеры на несколько <w:t> элементов,
      // поэтому ищем паттерны напрямую в XML тексте
      const placeholders = new Set<string>();
      
      // Ищем плейсхолдеры в формате {fieldName}, {#fieldName}, {/fieldName}
      // Используем более гибкое регулярное выражение, которое найдет плейсхолдеры
      // даже если они разбиты на несколько XML элементов
      const placeholderRegex = /\{([#\/]?)([a-zA-Z0-9_]+)\}/g;
      let match;
      
      // Ищем в полном XML тексте
      while ((match = placeholderRegex.exec(allXmlText)) !== null) {
        const prefix = match[1]; // # или / для циклов
        const fieldName = match[2];
        
        // Пропускаем служебные теги циклов (они обрабатываются отдельно)
        if (prefix === '#' || prefix === '/') {
          // Для циклов добавляем имя массива (без префикса)
          // Например, {#orders} -> orders
          placeholders.add(fieldName);
          continue;
        }
        
        placeholders.add(fieldName);
      }
      
      // Также извлекаем текст из всех <w:t> элементов и ищем плейсхолдеры там
      // Это помогает найти плейсхолдеры, которые Word разбил на части
      const textNodesRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let textMatch;
      let combinedText = '';
      
      while ((textMatch = textNodesRegex.exec(allXmlText)) !== null) {
        combinedText += textMatch[1];
      }
      
      // Ищем плейсхолдеры в собранном тексте
      const textPlaceholderRegex = /\{([#\/]?)([a-zA-Z0-9_]+)\}/g;
      while ((match = textPlaceholderRegex.exec(combinedText)) !== null) {
        const prefix = match[1];
        const fieldName = match[2];
        
        if (prefix === '#' || prefix === '/') {
          placeholders.add(fieldName);
          continue;
        }
        
        placeholders.add(fieldName);
      }
      
      return {
        placeholders: Array.from(placeholders).sort(),
        type: 'docx',
      };
    } catch (error: any) {
      throw new Error(`Ошибка анализа Word шаблона: ${error.message}`);
    }
  }

  /**
   * Анализ Excel шаблона (xlsx/xls)
   */
  private static async analyzeExcelTemplate(templatePath: string): Promise<{
    placeholders: string[];
    type: 'xlsx' | 'xls';
  }> {
    try {
      // XLSX файлы - это ZIP архивы, читаем их как ZIP
      const templateBuffer = fs.readFileSync(templatePath, 'binary');
      const zip = new PizZip(templateBuffer);
      const placeholders = new Set<string>();
      
      // Читаем все XML файлы из архива
      for (const fileName in zip.files) {
        if (fileName.endsWith('.xml') || fileName.endsWith('.xml.rels')) {
          try {
            const file = zip.files[fileName];
            if (file && !file.dir) {
              const content = file.asText();
              
              // Ищем плейсхолдеры в формате ${fieldName} или ${table:arrayName}
              const placeholderRegex = /\$\{([^}]+)\}/g;
              let match;
              
              while ((match = placeholderRegex.exec(content)) !== null) {
                const placeholder = match[1];
                
                // Обрабатываем таблицы: ${table:orders} -> table:orders
                if (placeholder.startsWith('table:')) {
                  placeholders.add(placeholder);
                } else {
                  placeholders.add(placeholder);
                }
              }
            }
          } catch (e) {
            // Игнорируем ошибки чтения отдельных файлов
          }
        }
      }
      
      return {
        placeholders: Array.from(placeholders).sort(),
        type: templatePath.endsWith('.xlsx') ? 'xlsx' : 'xls',
      };
    } catch (error: any) {
      throw new Error(`Ошибка анализа Excel шаблона: ${error.message}`);
    }
  }

  /**
   * Сохранить маппинг полей для шаблона
   */
  static async saveFieldMapping(
    templateId: number,
    mappings: Array<{
      templateField: string;
      systemField: string;
      fieldLabel?: string;
    }>
  ): Promise<void> {
    const db = await getDb();
    
    // Удаляем старые маппинги
    await db.run('DELETE FROM template_field_mappings WHERE template_id = ?', templateId);
    
    // Сохраняем новые маппинги
    for (const mapping of mappings) {
      await db.run(
        `INSERT INTO template_field_mappings (template_id, template_field, system_field, field_label, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        templateId,
        mapping.templateField,
        mapping.systemField,
        mapping.fieldLabel || null
      );
    }
  }

  /**
   * Получить маппинг полей для шаблона
   */
  static async getFieldMapping(templateId: number): Promise<Array<{
    id: number;
    templateField: string;
    systemField: string;
    fieldLabel: string | null;
  }>> {
    const db = await getDb();
    const rows = await db.all<{
      id: number;
      template_field: string;
      system_field: string;
      field_label: string | null;
    }>(
      'SELECT * FROM template_field_mappings WHERE template_id = ? ORDER BY id',
      templateId
    );
    
    return (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.id,
      templateField: row.template_field,
      systemField: row.system_field,
      fieldLabel: row.field_label,
    }));
  }

  /**
   * Автоматическое сопоставление полей шаблона с данными системы
   * Создает маппинг на основе стандартных имен полей
   */
  private static createAutoMapping(placeholders: string[]): Array<{
    templateField: string;
    systemField: string;
  }> {
    // Стандартные соответствия полей
    const fieldMapping: Record<string, string> = {
      // Основные поля клиента
      'customerName': 'customerName',
      'companyName': 'companyName',
      'legalName': 'legalName',
      'legalAddress': 'legalAddress',
      'address': 'legalAddress',
      'taxId': 'taxId',
      'bankDetails': 'bankDetails',
      'authorizedPerson': 'authorizedPerson',
      
      // Поля договора/акта/счета
      'contractNumber': 'contractNumber',
      'contractDate': 'contractDate',
      'actNumber': 'contractNumber',
      'actDate': 'contractDate',
      'invoiceNumber': 'contractNumber',
      'invoiceDate': 'contractDate',
      
      // Суммы и количества
      'totalAmount': 'totalAmount',
      'totalQuantity': 'totalQuantity',
      'totalAmountInWords': 'totalAmountInWords',
      
      // Массивы (таблицы)
      'orderItems': 'orderItems',
      'orders': 'orders',
      
      // Поля внутри таблиц orderItems
      'number': 'number',
      'name': 'name',
      'unit': 'unit',
      'quantity': 'quantity',
      'price': 'price',
      'amount': 'amount',
      'vatRate': 'vatRate',
      'vatAmount': 'vatAmount',
      'totalWithVat': 'totalWithVat',
      
      // Поля внутри таблиц orders
      'date': 'date',
      'status': 'status',
    };
    
    const mappings: Array<{ templateField: string; systemField: string }> = [];
    
    for (const placeholder of placeholders) {
      // Убираем префиксы циклов (#, /) и префикс table:
      const cleanPlaceholder = placeholder
        .replace(/^#/, '')
        .replace(/^\//, '')
        .replace(/^table:/, '');
      
      // Ищем соответствие в маппинге
      const systemField = fieldMapping[cleanPlaceholder];
      
      if (systemField) {
        mappings.push({
          templateField: placeholder,
          systemField: systemField
        });
      } else {
        // Если точного соответствия нет, пробуем найти по частичному совпадению
        // Например, customer_name -> customerName
        const normalized = cleanPlaceholder
          .replace(/_/g, '')
          .replace(/-/g, '')
          .toLowerCase();
        
        const found = Object.keys(fieldMapping).find(key => {
          const normalizedKey = key.replace(/_/g, '').replace(/-/g, '').toLowerCase();
          return normalizedKey === normalized;
        });
        
        if (found) {
          mappings.push({
            templateField: placeholder,
            systemField: fieldMapping[found]
          });
        }
      }
    }
    
    return mappings;
  }

  /**
   * Генерация документа с учетом маппинга полей (автоматического или ручного)
   */
  static async generateDocumentWithMapping(
    templateId: number,
    data: TemplateData
  ): Promise<Buffer> {
    const template = await this.getTemplate(templateId);
    
    console.log(`[DocumentTemplate] generateDocumentWithMapping: получены данные:`, {
      orderItemsCount: data.orderItems?.length || 0,
      totalAmount: data.totalAmount,
      totalQuantity: data.totalQuantity,
      customerName: data.customerName
    });
    
    // Получаем ручной маппинг полей (если есть)
    const manualMappings = await this.getFieldMapping(templateId);
    
    // Если ручного маппинга нет, создаем автоматический
    let mappings = manualMappings;
    if (mappings.length === 0) {
      // Анализируем шаблон для получения плейсхолдеров
      try {
        const analysis = await this.analyzeTemplate(templateId);
        const autoMappings = this.createAutoMapping(analysis.placeholders);
        mappings = autoMappings.map(m => ({
          id: undefined,
          templateField: m.templateField,
          systemField: m.systemField,
          fieldLabel: ''
        }));
        console.log(`[DocumentTemplate] Создан автоматический маппинг: ${mappings.length} полей`);
      } catch (error) {
        // Если анализ не удался, работаем без маппинга
        console.warn('Не удалось создать автоматический маппинг:', error);
      }
    }
    
    // Подготавливаем данные с автоматическим расчетом totalAmount и contractNumber
    let preparedData: TemplateData = { ...data };
    
    // Автоматически генерируем contractNumber, если он не указан
    if (!preparedData.contractNumber || preparedData.contractNumber.trim() === '') {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      // Простой номер на основе timestamp (можно улучшить, добавив счетчик в БД)
      const sequence = String(Date.now() % 10000).padStart(4, '0');
      preparedData.contractNumber = `${year}${month}-${sequence}`;
    }
    
    // Автоматически устанавливаем contractDate, если он не указан
    if (!preparedData.contractDate || preparedData.contractDate.trim() === '') {
      preparedData.contractDate = new Date().toLocaleDateString('ru-RU');
    }
    
    // Автоматически вычисляем totalAmount из orderItems, если он не указан явно
    if (preparedData.orderItems && Array.isArray(preparedData.orderItems) && preparedData.orderItems.length > 0) {
      if (preparedData.totalAmount === undefined || preparedData.totalAmount === null || preparedData.totalAmount === 0) {
        preparedData.totalAmount = preparedData.orderItems.reduce((sum, item) => {
          const amount = typeof item.amount === 'number' ? item.amount : Number(item.amount) || 0;
          return sum + amount;
        }, 0);
        console.log(`[DocumentTemplate] Вычислен totalAmount из orderItems: ${preparedData.totalAmount}`);
      }
      
      // Вычисляем totalQuantity, если не указан
      if (!preparedData.totalQuantity || preparedData.totalQuantity === 0) {
        preparedData.totalQuantity = preparedData.orderItems.reduce((sum, item) => {
          const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0;
          return sum + qty;
        }, 0);
        console.log(`[DocumentTemplate] Вычислен totalQuantity из orderItems: ${preparedData.totalQuantity}`);
      }
    }
    
    // Если totalAmount все еще 0, пробуем вычислить из orders
    if ((preparedData.totalAmount === undefined || preparedData.totalAmount === null || preparedData.totalAmount === 0) && 
        preparedData.orders && Array.isArray(preparedData.orders) && preparedData.orders.length > 0) {
      preparedData.totalAmount = preparedData.orders.reduce((sum, order) => {
        const amount = typeof order.amount === 'number' ? order.amount : Number(order.amount) || 0;
        return sum + amount;
      }, 0);
      console.log(`[DocumentTemplate] Вычислен totalAmount из orders: ${preparedData.totalAmount}`);
    }
    
    // Если есть маппинг, преобразуем данные
    let mappedData: any = { ...preparedData };
    
    if (mappings.length > 0) {
      // Создаем объект для шаблона на основе маппинга
      mappedData = {};
      
      // Проверяем, есть ли маппинг для totalAmount и orders
      const totalAmountMapping = mappings.find(m => m.systemField === 'totalAmount');
      const ordersMapping = mappings.find(m => m.systemField === 'orders');
      
      // Если есть маппинг для totalAmount, но значение не указано, вычисляем из orders
      if (totalAmountMapping && (preparedData.totalAmount === undefined || preparedData.totalAmount === null)) {
        if (preparedData.orders && Array.isArray(preparedData.orders) && preparedData.orders.length > 0) {
          preparedData.totalAmount = preparedData.orders.reduce((sum, order) => {
            const amount = typeof order.amount === 'number' ? order.amount : Number(order.amount) || 0;
            return sum + amount;
          }, 0);
        }
      }
      
      for (const mapping of mappings) {
        // Получаем значение из исходных данных по systemField
        const value = this.getNestedValue(preparedData, mapping.systemField);
        // Используем templateField как ключ в mappedData (убираем префиксы для простых полей)
        const templateKey = mapping.templateField.replace(/^#/, '').replace(/^\//, '').replace(/^table:/, '');
        mappedData[templateKey] = value !== undefined ? value : '';
        // Также сохраняем с оригинальным именем для совместимости
        mappedData[mapping.templateField] = value !== undefined ? value : '';
      }
      
      // ВАЖНО: Сохраняем orderItems и orders напрямую, даже если их нет в маппинге
      // Это критично для работы таблиц в шаблонах
      if (preparedData.orderItems && Array.isArray(preparedData.orderItems)) {
        mappedData.orderItems = preparedData.orderItems;
        mappedData['table:orderItems'] = preparedData.orderItems; // Для xlsx-template
        console.log(`[DocumentTemplate] Сохранено ${preparedData.orderItems.length} позиций в mappedData.orderItems`);
      }
      
      if (preparedData.orders && Array.isArray(preparedData.orders)) {
        mappedData.orders = preparedData.orders;
        mappedData['table:orders'] = preparedData.orders; // Для xlsx-template
      }
      
      // Сохраняем также все исходные данные для обратной совместимости
      Object.assign(mappedData, preparedData);
      
      console.log(`[DocumentTemplate] Итоговый mappedData:`, {
        orderItemsCount: mappedData.orderItems?.length || 0,
        ordersCount: mappedData.orders?.length || 0,
        totalAmount: mappedData.totalAmount,
        hasTableOrderItems: !!mappedData['table:orderItems']
      });
    }
    
    // Убеждаемся, что orderItems передаются в generateDocument
    console.log(`[DocumentTemplate] Передаем данные в generateDocument:`, {
      orderItemsCount: mappedData.orderItems?.length || 0,
      hasTableOrderItems: !!mappedData['table:orderItems'],
      totalAmount: mappedData.totalAmount
    });
    
    // Проверяем, что путь к шаблону абсолютный и файл существует
    const templatePath = path.isAbsolute(template.file_path) 
      ? template.file_path 
      : path.resolve(__dirname, '../../', template.file_path);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Файл шаблона не найден: ${templatePath} (исходный путь: ${template.file_path})`);
    }
    
    console.log(`[DocumentTemplate] Используем шаблон: ${templatePath}`);
    
    return this.generateDocument(templatePath, mappedData);
  }

  /**
   * Получить вложенное значение из объекта по пути (например, "customer.name")
   */
  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Генерация имени файла для документа
   * Формат: Тип_документа_№_Название_компании_Дата.расширение
   * Пример: Договор_№1_Коворкинг_Работаем_23.12.2024.docx
   */
  static generateDocumentFilename(
    template: DocumentTemplate,
    data: TemplateData
  ): string {
    const ext = path.extname(template.file_path);
    
    // Определяем тип документа на русском
    const typeLabels: Record<string, string> = {
      contract: 'Договор',
      act: 'Акт',
      invoice: 'Счёт',
    };
    const documentType = typeLabels[template.type] || template.type;
    
    // Получаем номер документа (contractNumber или номер из данных)
    const contractNumber = data.contractNumber || '';
    // Форматируем номер для имени файла (убираем лишние символы)
    const sanitizedNumber = contractNumber
      .replace(/[<>:"/\\|?*]/g, '') // Удаляем недопустимые символы
      .replace(/\s+/g, '-') // Заменяем пробелы на дефисы
      .trim();
    const numberPart = sanitizedNumber ? `_№${sanitizedNumber}` : '';
    
    // Получаем название компании (приоритет: companyName > legalName > customerName)
    const companyName = data.companyName || data.legalName || data.customerName || 'Клиент';
    
    // Очищаем название от недопустимых символов для имени файла
    const sanitizedCompanyName = companyName
      .replace(/[<>:"/\\|?*]/g, '') // Удаляем недопустимые символы
      .replace(/\s+/g, '_') // Заменяем пробелы на подчеркивания
      .trim();
    
    // Форматируем дату (используем contractDate или текущую дату)
    let dateStr = '';
    if (data.contractDate) {
      // Пытаемся распарсить дату
      const date = new Date(data.contractDate);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).replace(/\./g, '.');
      } else {
        // Если не удалось распарсить, используем как есть (уже отформатированную)
        dateStr = data.contractDate.replace(/\//g, '.');
      }
    } else {
      dateStr = new Date().toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '.');
    }
    
    // Формируем имя файла
    // Формат: Договор_№202412-1234_Коворкинг_Работаем_23.12.2024.docx
    const filename = `${documentType}${numberPart}_${sanitizedCompanyName}_${dateStr}${ext}`;
    
    // Ограничиваем длину имени файла (максимум 255 символов для Windows, но лучше до 200)
    if (filename.length > 200) {
      const maxCompanyLength = 200 - documentType.length - numberPart.length - dateStr.length - ext.length - 10;
      const truncatedCompany = sanitizedCompanyName.substring(0, Math.max(10, maxCompanyLength));
      return `${documentType}${numberPart}_${truncatedCompany}_${dateStr}${ext}`;
    }
    
    return filename;
  }
}

// Инициализация при импорте
DocumentTemplateService.init();
