/**
 * ЕДИНАЯ КОНФИГУРАЦИЯ БД ДЛЯ ВСЕХ СКРИПТОВ
 * 
 * Все скрипты должны использовать ТОЛЬКО эту конфигурацию!
 */

const path = require('path');

//  ЕДИНСТВЕННАЯ РАБОЧАЯ БД
const DB_PATH = path.resolve(__dirname, '../data.db');

module.exports = {
  DB_PATH,
  
  // Для удобства в других скриптах
  getDbPath: () => DB_PATH
};

