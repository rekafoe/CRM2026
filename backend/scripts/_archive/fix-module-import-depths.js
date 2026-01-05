const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const MODULES_DIR = path.join(SRC_DIR, 'modules');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = content;

  const relToModules = path.relative(MODULES_DIR, path.dirname(filePath)).split(path.sep);
  const isDeepModuleFile = relToModules.length >= 2 && ['controllers', 'routes', 'services'].includes(relToModules[1]);

  if (isDeepModuleFile) {
    // Bump depth to src/* from modules/*/{controllers|routes|services}
    updated = updated
      .replace(/from ['"]\.\.\/config\//g, "from '../../../config/")
      .replace(/from ['"]\.\.\/middleware(?![\w/])/g, "from '../../../middleware")
      .replace(/from ['"]\.\.\/middleware\//g, "from '../../../middleware/")
      .replace(/from ['"]\.\.\/models\//g, "from '../../../models/")
      .replace(/from ['"]\.\.\/utils\//g, "from '../../../utils/")
      .replace(/from ['"]\.\.\/db['"]/g, "from '../../../db'")
      .replace(/from ['"]\.\.\/types\//g, "from '../../../types/");

    // Cross-module references: ../<module>/ -> ../../<module>/
    updated = updated
      .replace(/from ['"]\.\.\/telegram\//g, "from '../../telegram/")
      .replace(/from ['"]\.\.\/warehouse\//g, "from '../../warehouse/")
      .replace(/from ['"]\.\.\/pricing\//g, "from '../../pricing/")
      .replace(/from ['"]\.\.\/shared\//g, "from '../../shared/");

    // Special cases inside notifications/services
    updated = updated.replace(/from ['"]\.\/telegramService['"]/g, "from '../../telegram/services/telegramService'");
  }

  if (updated !== content) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('fixed', path.relative(SRC_DIR, filePath));
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (entry.endsWith('.ts')) fixFile(full);
  }
}

walk(MODULES_DIR);
console.log('✅ import depth fix complete');
