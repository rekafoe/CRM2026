const { Database } = require('sqlite3');

const up = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      CREATE TABLE IF NOT EXISTS product_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        formats TEXT NOT NULL, -- JSON array of formats
        recommended_paper_types TEXT NOT NULL, -- JSON array of paper types
        recommended_densities TEXT NOT NULL, -- JSON array of densities
        laminations TEXT NOT NULL, -- JSON array of laminations
        sides TEXT NOT NULL, -- JSON array of sides
        pages TEXT, -- JSON array of pages (optional)
        special_options TEXT, -- JSON object with special options
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    db.run(query, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Создаем индексы
      const indexQueries = [
        'CREATE INDEX IF NOT EXISTS idx_product_configs_name ON product_configs(name)',
        'CREATE INDEX IF NOT EXISTS idx_product_configs_active ON product_configs(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_product_configs_created_at ON product_configs(created_at)'
      ];

      let completed = 0;
      const total = indexQueries.length;

      indexQueries.forEach(indexQuery => {
        db.run(indexQuery, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          completed++;
          if (completed === total) {
            resolve();
          }
        });
      });
    });
  });
};

const down = (db) => {
  return new Promise((resolve, reject) => {
    db.run('DROP TABLE IF EXISTS product_configs', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
};

module.exports = { up, down };
