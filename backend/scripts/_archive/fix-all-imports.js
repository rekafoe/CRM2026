const fs = require('fs');
const path = require('path');

// Mapping старых относительных путей к новым
const pathReplacements = [
  // Config и database
  { from: /from ['"]\.\.\/config\/database['"]/g, to: `from '../../config/database'` },
  { from: /from ['"]\.\.\/db['"]/g, to: `from '../../db'` },
  
  // Utils
  { from: /from ['"]\.\.\/utils\/logger['"]/g, to: `from '../../utils/logger'` },
  { from: /from ['"]\.\.\/utils['"]/g, to: `from '../../utils'` },
  { from: /from ['"]\.\.\/utils\/printing['"]/g, to: `from '../../utils/printing'` },
  
  // Models
  { from: /from ['"]\.\.\/models['"]/g, to: `from '../../models'` },
  { from: /from ['"]\.\.\/models\/Material['"]/g, to: `from '../../models/Material'` },
  { from: /from ['"]\.\.\/models\/userOrderPage['"]/g, to: `from '../../models/userOrderPage'` },
  { from: /from ['"]\.\.\/models\/mappers\/itemMapper['"]/g, to: `from '../../models/mappers/itemMapper'` },
  { from: /from ['"]\.\.\/models\/mappers\/telegramPhotoOrderMapper['"]/g, to: `from '../../models/mappers/telegramPhotoOrderMapper'` },
  
  // Middleware
  { from: /from ['"]\.\.\/middleware['"]/g, to: `from '../../middleware'` },
  { from: /from ['"]\.\.\/middleware\/auth['"]/g, to: `from '../../middleware/auth'` },
  { from: /from ['"]\.\.\/middleware\/asyncHandler['"]/g, to: `from '../../middleware/asyncHandler'` },
  
  // Config
  { from: /from ['"]\.\.\/config\/upload['"]/g, to: `from '../../config/upload'` },
  
  // Types
  { from: /from ['"]\.\.\/types\/products['"]/g, to: `from '../../types/products'` },
  { from: /from ['"]\.\.\.\/\.\.\.\/shared\/types\/entities['"]/g, to: `from '../../../shared/types/entities'` },
  
  // Repositories
  { from: /from ['"]\.\.\/repositories\/orderRepository['"]/g, to: `from '../../repositories/orderRepository'` },
  
  // Warehouse services (for cross-module imports)
  { from: /from ['"]\.\.\/modules\/warehouse\/services\/materialService['"]/g, to: `from '../warehouse/services/materialService'` },
  { from: /from ['"]\.\.\/modules\/warehouse\/services\/materialTransactionService['"]/g, to: `from '../warehouse/services/materialTransactionService'` },
  { from: /from ['"]\.\.\/modules\/warehouse\/services\/unifiedWarehouseService['"]/g, to: `from '../warehouse/services/unifiedWarehouseService'` },
  
  // Pricing services (for cross-module imports)
  { from: /from ['"]\.\.\/modules\/pricing\/services\/pricingService['"]/g, to: `from '../pricing/services/pricingService'` },
  { from: /from ['"]\.\.\/modules\/pricing\/services\/dynamicPricingService['"]/g, to: `from '../pricing/services/dynamicPricingService'` },
  
  // Services within modules
  { from: /from ['"]\.\.\/services\/materialService['"]/g, to: `from '../warehouse/services/materialService'` },
  { from: /from ['"]\.\.\/services\/telegramService['"]/g, to: `from '../telegram/services/telegramService'` },
  { from: /from ['"]\.\.\/services\/stockMonitoringService['"]/g, to: `from '../warehouse/services/stockMonitoringService'` },
  { from: /from ['"]\.\.\/services\/autoOrderService['"]/g, to: `from '../telegram/services/autoOrderService'` },
  { from: /from ['"]\.\.\/services\/userNotificationService['"]/g, to: `from '../notifications/services/userNotificationService'` },
  { from: /from ['"]\.\.\/services\/cacheService['"]/g, to: `from '../shared/services/cacheService'` },
  { from: /from ['"]\.\.\/services\/optimizedQueries['"]/g, to: `from '../shared/services/optimizedQueries'` },
  { from: /from ['"]\.\.\/services\/notificationService['"]/g, to: `from '../notifications/services/notificationService'` },
  { from: /from ['"]\.\.\/services\/photoOrderService['"]/g, to: `from '../telegram/services/photoOrderService'` },
  { from: /from ['"]\.\.\/services\/pdfReportService['"]/g, to: `from '../reports/services/pdfReportService'` },
  { from: /from ['"]\.\.\/services\/realPricingService['"]/g, to: `from '../pricing/services/realPricingService'` },
  { from: /from ['"]\.\.\/services\/layoutCalculationService['"]/g, to: `from '../pricing/services/layoutCalculationService'` },
  { from: /from ['"]\.\.\/services\/unifiedWarehouseService['"]/g, to: `from '../warehouse/services/unifiedWarehouseService'` },
  { from: /from ['"]\.\.\/services\/materialTransactionService['"]/g, to: `from '../warehouse/services/materialTransactionService'` },
  { from: /from ['"]\.\.\/services\/autoMaterialDeductionService['"]/g, to: `from '../warehouse/services/autoMaterialDeductionService'` },
  
  // Services (generic replacements for ./services)
  { from: /from ['"]\.\.\/services['"](?! )/g, to: `from '../services'` },
  
  // Controllers within modules  
  { from: /from ['"]\.\.\/controllers\/telegramUserController['"]/g, to: `from '../telegram/controllers/telegramUserController'` },
  { from: /from ['"]\.\.\/controllers\/telegramWebhookController['"]/g, to: `from '../telegram/controllers/telegramWebhookController'` },
  { from: /from ['"]\.\.\/controllers\/telegramSettingsController['"]/g, to: `from '../telegram/controllers/telegramSettingsController'` },
  
  // Controllers (generic)
  { from: /from ['"]\.\.\/controllers['"](?! )/g, to: `from '../controllers'` },
  
  // Middleware (generic with same folder structure)
  { from: /from ['"]\.\.\/middleware['"](?!\/)/g, to: `from '../middleware'` },
  
  // Root services reference
  { from: /from ['"]\.\/services\/telegramService['"]/g, to: `from './modules/telegram/services/telegramService'` },
  { from: /from ['"]\.\/services\/stockMonitoringService['"]/g, to: `from './modules/warehouse/services/stockMonitoringService'` },
  { from: /from ['"]\.\/services\/autoOrderService['"]/g, to: `from './modules/telegram/services/autoOrderService'` },
  { from: /from ['"]\.\/services\/userNotificationService['"]/g, to: `from './modules/notifications/services/userNotificationService'` },
];

function updateFileImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  const originalContent = content;
  
  for (const replacement of pathReplacements) {
    if (content.match(replacement.from)) {
      content = content.replace(replacement.from, replacement.to);
      updated = true;
    }
  }
  
  if (updated && content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function scanDirectory(dir, ignorePatterns = ['node_modules', 'dist', '__tests__']) {
  const files = fs.readdirSync(dir);
  let updatedCount = 0;
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!ignorePatterns.includes(file)) {
        updatedCount += scanDirectory(fullPath, ignorePatterns);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      if (updateFileImports(fullPath)) {
        updatedCount++;
      }
    }
  }
  
  return updatedCount;
}

console.log('🔄 Fixing all import paths...\n');
const srcPath = path.join(__dirname, '../src');
const count = scanDirectory(srcPath);
console.log(`\n✅ Complete! Updated ${count} files.`);

