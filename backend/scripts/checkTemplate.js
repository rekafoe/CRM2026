const XLSX = require('xlsx');
const path = require('path');

const templatePath = process.argv[2] || 'd:\\CRM\\templates\\act-template.xlsx';

console.log(`Проверка шаблона: ${templatePath}`);

try {
  const wb = XLSX.readFile(templatePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  console.log(`Диапазон листа: ${ws['!ref']}`);
  console.log(`Ищем маркеры таблицы и плейсхолдеры...\n`);
  
  let foundMarkers = [];
  
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40); r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 15); c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      const cell = ws[addr];
      if (cell && cell.v && typeof cell.v === 'string') {
        const cellValue = cell.v;
        if (cellValue.includes('table') || 
            cellValue.includes('order') || 
            cellValue.includes('${') ||
            cellValue.toLowerCase().includes('table') ||
            cellValue.toLowerCase().includes('order')) {
          foundMarkers.push({
            row: r + 1,
            col: c + 1,
            addr: addr,
            value: cellValue
          });
        }
      }
    }
  }
  
  if (foundMarkers.length > 0) {
    console.log('Найденные маркеры и плейсхолдеры:');
    foundMarkers.forEach(m => {
      console.log(`  Строка ${m.row}, колонка ${m.col} (${m.addr}): "${m.value}"`);
    });
  } else {
    console.log('Маркеры таблицы и плейсхолдеры не найдены в первых 40 строках!');
  }
} catch (error) {
  console.error('Ошибка:', error.message);
}
