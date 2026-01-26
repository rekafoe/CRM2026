/**
 * Скрипт для генерации Excel шаблона счёта
 * Использует библиотеку exceljs для создания файла с плейсхолдерами и сохранением форматирования
 * Визуально точно соответствует примеру из скриншота
 */

import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// Создаем рабочую книгу
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Счет');

// Настраиваем ширину столбцов
worksheet.columns = [
  { width: 5 },   // A: №
  { width: 30 },  // B: Товары (работы, услуги) - часть 1
  { width: 30 },  // C: Товары (работы, услуги) - часть 2 (merged)
  { width: 12 },  // D: Единица измерения
  { width: 12 },  // E: Количество
  { width: 12 },  // F: Цена
  { width: 15 },  // G: Сумма
  { width: 12 },  // H: Ставка НДС, %
  { width: 15 },  // I: Сумма НДС
  { width: 15 },  // J: Всего с НДС
];

// === ИНФОРМАЦИЯ ОБ ИСПОЛНИТЕЛЕ (строки 1-3) ===
// Строка 1: Название компании (merged A1:J1)
worksheet.mergeCells('A1:J1');
const cellA1 = worksheet.getCell('A1');
cellA1.value = 'Общество с ограниченной ответственностью "Светлан Эстетикс"';
cellA1.alignment = { horizontal: 'left', vertical: 'middle' };
cellA1.font = { size: 11 };

// Строка 2: Банковские реквизиты (merged A2:J2)
worksheet.mergeCells('A2:J2');
const cellA2 = worksheet.getCell('A2');
cellA2.value = 'Р/сч: BY96ALFA30122D24630010270000 в ЗАО \'Альфа-Банк\' код ALFABY2X, УНП:193679900';
cellA2.alignment = { horizontal: 'left', vertical: 'middle' };
cellA2.font = { size: 10 };

// Строка 3: Адрес (merged A3:J3)
worksheet.mergeCells('A3:J3');
const cellA3 = worksheet.getCell('A3');
cellA3.value = 'Адрес: Республика Беларусь, 220069, г. Минск, пр-т Дзержинского, д. 3Б, оф. 5';
cellA3.alignment = { horizontal: 'left', vertical: 'middle' };
cellA3.font = { size: 10 };

// Пустые строки 4-5

// === ЗАГОЛОВОК ДОКУМЕНТА (строка 6) ===
// Строка 6: "Счет № ... от ..." (merged A6:J6)
worksheet.mergeCells('A6:J6');
const cellA6 = worksheet.getCell('A6');
cellA6.value = 'Счет № ${contractNumber} от ${contractDate}';
cellA6.alignment = { horizontal: 'center', vertical: 'middle' };
cellA6.font = { size: 14, bold: true };

// Пустые строки 7-8

// === ИНФОРМАЦИЯ О ЗАКАЗЧИКЕ/ПЛАТЕЛЬЩИКЕ (строки 9-11) ===
// Строка 9: Заказчик
const cellA9 = worksheet.getCell('A9');
cellA9.value = 'Заказчик: ${legalName}';
cellA9.alignment = { horizontal: 'left', vertical: 'middle' };
cellA9.font = { size: 11 };

// Строка 10: Плательщик
const cellA10 = worksheet.getCell('A10');
cellA10.value = 'Плательщик: ${legalName}, ${taxId} адрес: ${legalAddress}';
cellA10.alignment = { horizontal: 'left', vertical: 'middle' };
cellA10.font = { size: 11 };

// Строка 11: Расчетный счет
const cellA11 = worksheet.getCell('A11');
cellA11.value = 'p/c: ${bankDetails}';
cellA11.alignment = { horizontal: 'left', vertical: 'middle' };
cellA11.font = { size: 11 };

// Пустые строки 12-13

// === ТАБЛИЦА ТОВАРОВ/УСЛУГ ===
// Строки 14-15: Заголовки таблицы (двухрядные заголовки с вертикальным объединением)
const headerRow14 = worksheet.getRow(14);
const headerRow15 = worksheet.getRow(15);
headerRow14.height = 20;
headerRow15.height = 20;

// Стиль для заголовков таблицы
const headerStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  font: { size: 10, bold: true },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  }
};

// Объединяем ячейки для заголовков (вертикальное объединение строк 14-15)
worksheet.mergeCells('A14:A15');
worksheet.mergeCells('B14:C15');
worksheet.mergeCells('D14:D15');
worksheet.mergeCells('E14:E15');
worksheet.mergeCells('F14:F15');
worksheet.mergeCells('G14:G15');
worksheet.mergeCells('H14:H15');
worksheet.mergeCells('I14:I15');
worksheet.mergeCells('J14:J15');

// Заполняем заголовки таблицы (в объединенных ячейках)
headerRow14.getCell(1).value = '№';
headerRow14.getCell(1).style = headerStyle;

headerRow14.getCell(2).value = 'Товары (работы, услуги)';
headerRow14.getCell(2).style = headerStyle;

headerRow14.getCell(4).value = 'Единица изме-\nрения';
headerRow14.getCell(4).style = headerStyle;

headerRow14.getCell(5).value = 'Количество';
headerRow14.getCell(5).style = headerStyle;

headerRow14.getCell(6).value = 'Цена';
headerRow14.getCell(6).style = headerStyle;

headerRow14.getCell(7).value = 'Сумма';
headerRow14.getCell(7).style = headerStyle;

headerRow14.getCell(8).value = 'Ставка НДС, %';
headerRow14.getCell(8).style = headerStyle;

headerRow14.getCell(9).value = 'Сумма НДС';
headerRow14.getCell(9).style = headerStyle;

headerRow14.getCell(10).value = 'Всего с НДС';
headerRow14.getCell(10).style = headerStyle;

// Строка 16: Маркер таблицы (в столбце B, как в скриншоте)
const markerRow = worksheet.getRow(16);
markerRow.getCell(2).value = '${table:orderItems}';
// Очищаем остальные ячейки строки 16, чтобы маркер был только в столбце B

// Строка 17: Шаблон строки данных
const templateRow = worksheet.getRow(17);
templateRow.height = 20;

// Стиль для ячеек данных
const dataStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  font: { size: 10 }
};

// Стиль для текстовых ячеек (выравнивание по левому краю)
const textDataStyle: Partial<ExcelJS.Style> = {
  ...dataStyle,
  alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
};

// Заполняем шаблон строки
templateRow.getCell(1).value = '${number}';
templateRow.getCell(1).style = dataStyle;

// Объединяем ячейки B-C в строке-шаблоне данных, чтобы соответствовать заголовку
worksheet.mergeCells('B17:C17');
templateRow.getCell(2).value = '${name}';
templateRow.getCell(2).style = textDataStyle;

templateRow.getCell(4).value = '${unit}';
templateRow.getCell(4).style = dataStyle;

templateRow.getCell(5).value = '${quantity}';
templateRow.getCell(5).style = dataStyle;

templateRow.getCell(6).value = '${price}';
templateRow.getCell(6).style = dataStyle;

templateRow.getCell(7).value = '${amount}';
templateRow.getCell(7).style = dataStyle;

templateRow.getCell(8).value = 'Без НДС';
templateRow.getCell(8).style = dataStyle;

templateRow.getCell(9).value = '-';
templateRow.getCell(9).style = dataStyle;

templateRow.getCell(10).value = '${totalWithVat}';
templateRow.getCell(10).style = dataStyle;

// Строка 18: Итого
const totalRow = worksheet.getRow(18);
totalRow.height = 25;

const totalStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  },
  alignment: { horizontal: 'right', vertical: 'middle' },
  font: { size: 11, bold: true }
};

// Объединяем ячейки для "Итого"
worksheet.mergeCells('F18:G18');
totalRow.getCell(6).value = 'Итого:';
totalRow.getCell(6).style = totalStyle;

totalRow.getCell(8).value = 'X';
totalRow.getCell(8).style = {
  ...dataStyle,
  alignment: { horizontal: 'center', vertical: 'middle' }
};

totalRow.getCell(10).value = '${totalAmount}';
totalRow.getCell(10).style = {
  ...dataStyle,
  alignment: { horizontal: 'right', vertical: 'middle' },
  font: { size: 11, bold: true }
};

// Пустые строки 19-22

// === СУММА НДС И ВСЕГО К ОПЛАТЕ (строки 23-24) ===
// Строка 23: Сумма НДС
const cellA23 = worksheet.getCell('A23');
cellA23.value = 'Сумма НДС: Ноль белорусских рублей 00 копеек';
cellA23.alignment = { horizontal: 'left', vertical: 'middle' };
cellA23.font = { size: 11 };

// Строка 24: Всего к оплате
const cellA24 = worksheet.getCell('A24');
cellA24.value = 'Всего к оплате на сумму с НДС: ${totalAmountinWords}';
cellA24.alignment = { horizontal: 'left', vertical: 'middle' };
cellA24.font = { size: 11 };

// Пустые строки 25-26

// === ПОДПИСЬ (строка 27) ===
// Строка 27: Руководитель предприятия
const cellA27 = worksheet.getCell('A27');
cellA27.value = 'Руководитель предприятия_________';
cellA27.alignment = { horizontal: 'left', vertical: 'middle' };
cellA27.font = { size: 11 };

// Имя (столбец G)
const cellG27 = worksheet.getCell('G27');
cellG27.value = '(А.Г.Кулик)';
cellG27.alignment = { horizontal: 'left', vertical: 'middle' };
cellG27.font = { size: 11 };

// Сохраняем файл
const outputPath = path.resolve(__dirname, '../templates/invoice-template.xlsx');
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Если файл существует, удаляем его
if (fs.existsSync(outputPath)) {
  try {
    fs.unlinkSync(outputPath);
  } catch (e) {
    console.log(`⚠️  Не удалось удалить старый файл: ${(e as Error).message}`);
  }
}

workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log(`✅ Шаблон счёта успешно создан: ${outputPath}`);
    console.log('\n📋 Структура шаблона:');
    console.log('  - Строки 1-3: Информация об исполнителе (merged A-J)');
    console.log('  - Строка 6: Заголовок "Счет № ... от ..." (merged A-J, центрировано, жирный)');
    console.log('  - Строки 9-11: Информация о заказчике/плательщике');
    console.log('  - Строки 14-15: Заголовки таблицы (вертикально объединенные)');
    console.log('  - Строка 16, столбец B: Маркер ${table:orderItems}');
    console.log('  - Строка 17: Шаблон строки данных');
    console.log('  - Строка 18: Итого (с ${totalAmount})');
    console.log('  - Строки 23-24: Сумма НДС и всего к оплате');
    console.log('  - Строка 27: Подпись');
    console.log('\n📝 Доступные плейсхолдеры:');
    console.log('  - ${contractNumber} - Номер счёта');
    console.log('  - ${contractDate} - Дата счёта');
    console.log('  - ${legalName} - Наименование заказчика');
    console.log('  - ${taxId} - УНП заказчика');
    console.log('  - ${legalAddress} - Адрес заказчика');
    console.log('  - ${bankDetails} - Банковские реквизиты заказчика');
    console.log('  - ${table:orderItems} - Начало таблицы позиций');
    console.log('    * ${number} - Порядковый номер');
    console.log('    * ${name} - Наименование товара/услуги');
    console.log('    * ${unit} - Единица измерения');
    console.log('    * ${quantity} - Количество');
    console.log('    * ${price} - Цена за единицу');
    console.log('    * ${amount} - Сумма');
    console.log('    * ${totalWithVat} - Всего с НДС');
    console.log('  - ${totalAmount} - Общая сумма');
    console.log('  - ${totalAmountinWords} - Сумма прописью');
  })
  .catch((error) => {
    console.error('❌ Ошибка при создании шаблона:', error);
    process.exit(1);
  });
