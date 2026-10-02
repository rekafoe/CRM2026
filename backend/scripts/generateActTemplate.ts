/**
 * Скрипт для генерации Excel шаблона акта выполненных работ
 * Использует библиотеку exceljs для создания файла с плейсхолдерами и сохранением форматирования
 */

import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// Создаем рабочую книгу
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Акт');

// Настраиваем ширину столбцов
worksheet.columns = [
  { width: 5 },   // A: №
  { width: 40 },  // B: Наименование
  { width: 12 },  // C: Единица измерения
  { width: 12 },  // D: Количество
  { width: 15 },  // E: Цена
  { width: 15 },  // F: Сумма
  { width: 12 },  // G: Ставка НДС
  { width: 15 },  // H: Сумма НДС
  { width: 18 },  // I: Всего с НДС
];

// === ИНФОРМАЦИЯ ОБ ИСПОЛНИТЕЛЕ ===
worksheet.getCell('A1').value = 'Общество с ограниченной ответственностью "Светлан Эстетикс"';
worksheet.getCell('A2').value = 'Р/сч: BY96 ALFA 3012 2D24 6300 1027 0000 в ЗАО \'Альфа-Банк\', код ALFABY2X';
worksheet.getCell('A3').value = 'УНП: 193679900';
worksheet.getCell('A4').value = 'Адрес: Республика Беларусь, 220069, г. Минск, пр-т Дзержинского, д. 3Б, оф. 5';
// Пустая строка 5

// === ЗАГОЛОВОК ДОКУМЕНТА ===
// A6:B6 объединены - "АКТ"
worksheet.mergeCells('A6:B6');
const cellA6 = worksheet.getCell('A6');
cellA6.value = 'АКТ';
cellA6.alignment = { horizontal: 'center', vertical: 'middle' };
cellA6.font = { bold: true, size: 12 };

// C6 - "№ ${contractNumber}"
const cellC6 = worksheet.getCell('C6');
cellC6.value = '№ ${contractNumber}';
cellC6.alignment = { horizontal: 'center', vertical: 'middle' };
cellC6.font = { bold: true, size: 12 };

// A7:B7 объединены - "выполненных работ"
worksheet.mergeCells('A7:B7');
const cellA7 = worksheet.getCell('A7');
cellA7.value = 'выполненных работ';
cellA7.alignment = { horizontal: 'center', vertical: 'middle' };
cellA7.font = { size: 11 };

// C7 - "от ${contractDate}"
const cellC7 = worksheet.getCell('C7');
cellC7.value = 'от ${contractDate}';
cellC7.alignment = { horizontal: 'center', vertical: 'middle' };
cellC7.font = { size: 11 };

// Пустая строка 8

// === ИНФОРМАЦИЯ О ЗАКАЗЧИКЕ ===
worksheet.getCell('A9').value = 'Заказчик:';
worksheet.getCell('B9').value = '${legalName}';
worksheet.getCell('A10').value = 'Р/сч:';
worksheet.getCell('B10').value = '${bankDetails}';
worksheet.getCell('A11').value = 'УНП:';
worksheet.getCell('B11').value = '${taxId}';
worksheet.getCell('A12').value = 'Адрес:';
worksheet.getCell('B12').value = '${legalAddress}';
// Пустая строка 13

// === ЗАГОЛОВОК ТАБЛИЦЫ (строка 14) ===
const headerRow = worksheet.getRow(14);
headerRow.values = [
  '№',
  'Наименование работы (услуги)',
  'Единица изме-',
  'Количество',
  'Цена, руб.коп.',
  'Сумма, руб.коп.',
  'Ставка НДС, %',
  'Сумма НДС, руб.коп.',
  'Всего с НДС, руб.коп.'
];

// Стиль для заголовков таблицы
const headerStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } }
  },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E6E6' } // Светло-серый
  },
  alignment: { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true },
  font: { bold: true, size: 11 }
};

headerRow.eachCell((cell, colNumber) => {
  if (colNumber <= 9) {
    cell.style = headerStyle;
  }
});

// === ШАБЛОН СТРОКИ ТАБЛИЦЫ ===
// Строка 15 - маркер начала таблицы
const markerRow = worksheet.getRow(15);
markerRow.getCell(1).value = '${table:orderItems}';

// Строка 16 - шаблон строки данных
const templateRow = worksheet.getRow(16);
templateRow.values = [
  '${number}',
  '${name}',
  '${unit}',
  '${quantity}',
  '${price}',
  '${amount}',
  '${vatRate}',
  '${vatAmount}',
  '${totalWithVat}'
];

// Стиль для ячеек данных
const dataStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } }
  },
  alignment: { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true },
  font: { size: 10 }
};

// Стиль для текстовых ячеек (выравнивание по левому краю)
const textDataStyle: Partial<ExcelJS.Style> = {
  ...dataStyle,
  alignment: { horizontal: 'left' as const, vertical: 'middle' as const, wrapText: true }
};

templateRow.eachCell((cell, colNumber) => {
  if (colNumber <= 9) {
    // Для колонки "Наименование" (colNumber = 2) используем выравнивание по левому краю
    if (colNumber === 2) {
      cell.style = textDataStyle;
    } else {
      cell.style = dataStyle;
    }
  }
});

// Пустая строка 17

// === ИТОГОВЫЕ СТРОКИ (строки 19-21) ===
const totalStyle: Partial<ExcelJS.Style> = {
  border: {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } }
  },
  alignment: { vertical: 'middle' as const },
  font: { size: 10 }
};

// Строка 19
const row19 = worksheet.getRow(19);
row19.getCell(5).value = 'Итого:';
row19.getCell(5).style = { ...totalStyle, alignment: { horizontal: 'right' as const, vertical: 'middle' as const } };
row19.getCell(6).value = '${totalAmount}';
row19.getCell(6).style = { ...totalStyle, alignment: { horizontal: 'center' as const, vertical: 'middle' as const }, font: { size: 10, bold: true } };

// Строка 20
const row20 = worksheet.getRow(20);
row20.getCell(5).value = 'Без налога (НДС):';
row20.getCell(5).style = { ...totalStyle, alignment: { horizontal: 'right' as const, vertical: 'middle' as const } };
row20.getCell(6).value = '${totalAmount}';
row20.getCell(6).style = { ...totalStyle, alignment: { horizontal: 'center' as const, vertical: 'middle' as const }, font: { size: 10, bold: true } };

// Строка 21
const row21 = worksheet.getRow(21);
row21.getCell(5).value = 'Всего с НДС:';
row21.getCell(5).style = { ...totalStyle, alignment: { horizontal: 'right' as const, vertical: 'middle' as const } };
row21.getCell(6).value = '${totalAmount}';
row21.getCell(6).style = { ...totalStyle, alignment: { horizontal: 'center' as const, vertical: 'middle' as const }, font: { size: 10, bold: true } };

// Пустая строка 22

// === ТЕКСТОВОЕ РЕЗЮМЕ ===
// Строка 23: "Всего оказано услуг ${totalQuantity}, на сумму: ${totalAmountInWords}"
worksheet.mergeCells('A23:I23');
const cellA23 = worksheet.getCell('A23');
cellA23.value = 'Всего оказано услуг ${totalQuantity}, на сумму: ${totalAmountInWords}';
cellA23.alignment = { horizontal: 'left', vertical: 'middle' };

// Пустая строка 24

// Строка 25: длинный текст
worksheet.mergeCells('A25:I25');
const cellA25 = worksheet.getCell('A25');
cellA25.value = 'Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.';
cellA25.alignment = { horizontal: 'left', vertical: 'middle' };

// Пустая строка 26

// === БЛОКИ ПОДПИСЕЙ ===
// Строка 27
worksheet.getCell('A27').value = 'Исполнитель:';
worksheet.getCell('I27').value = 'Заказчик:';

// Строка 28
worksheet.mergeCells('A28:D28');
const cellA28 = worksheet.getCell('A28');
cellA28.value = 'должность';
cellA28.border = {
  bottom: { style: 'thin', color: { argb: 'FF000000' } }
};

const cellI28 = worksheet.getCell('I28');
cellI28.value = 'должность';
cellI28.border = {
  bottom: { style: 'thin', color: { argb: 'FF000000' } }
};

// Строка 29
worksheet.mergeCells('A29:D29');
const cellA29 = worksheet.getCell('A29');
cellA29.value = 'подпись, ФИО';
cellA29.border = {
  bottom: { style: 'thin', color: { argb: 'FF000000' } }
};

const cellI29 = worksheet.getCell('I29');
cellI29.value = 'подпись, ФИО';
cellI29.border = {
  bottom: { style: 'thin', color: { argb: 'FF000000' } }
};

// Пустая строка 30

// Строка 31
worksheet.getCell('A31').value = '${executorAuthorizedPerson}';
worksheet.getCell('I31').value = '${authorizedPerson}';

// Сохраняем файл
const outputPath = path.resolve(__dirname, '../../templates/act-template.xlsx');
const outputDir = path.dirname(outputPath);

// Создаем директорию, если её нет
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Если файл существует, удаляем его
if (fs.existsSync(outputPath)) {
  try {
    fs.unlinkSync(outputPath);
  } catch (e) {
    console.log(` Не удалось удалить старый файл: ${(e as Error).message}`);
  }
}

// Сохраняем файл
workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log(`Шаблон акта создан: ${outputPath}`);
    console.log('\n Доступные плейсхолдеры:');
    console.log('  - ${contractNumber} - Номер акта');
    console.log('  - ${contractDate} - Дата акта');
    console.log('  - ${legalName} - Наименование заказчика');
    console.log('  - ${bankDetails} - Банковские реквизиты заказчика');
    console.log('  - ${taxId} - УНП заказчика');
    console.log('  - ${legalAddress} - Адрес заказчика');
    console.log('  - ${table:orderItems} - Начало таблицы позиций');
    console.log('    * ${number} - Порядковый номер');
    console.log('    * ${name} - Наименование работы/услуги');
    console.log('    * ${unit} - Единица измерения');
    console.log('    * ${quantity} - Количество');
    console.log('    * ${price} - Цена за единицу');
    console.log('    * ${amount} - Сумма');
    console.log('    * ${vatRate} - Ставка НДС');
    console.log('    * ${vatAmount} - Сумма НДС');
    console.log('    * ${totalWithVat} - Всего с НДС');
    console.log('  - ${totalAmount} - Общая сумма');
    console.log('  - ${totalQuantity} - Общее количество услуг');
    console.log('  - ${totalAmountInWords} - Сумма прописью');
    console.log('  - ${authorizedPerson} - Уполномоченное лицо заказчика');
    console.log('  - ${executorAuthorizedPerson} - Уполномоченное лицо исполнителя');
  })
  .catch((error) => {
    console.error('Ошибка при создании шаблона:', error);
    process.exit(1);
  });
