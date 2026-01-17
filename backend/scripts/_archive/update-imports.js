const fs = require('fs');
const path = require('path');

// Mapping старых путей к новым
const pathMappings = {
  // Warehouse
  '../services/materialService': '../modules/warehouse/services/materialService',
  '../services/materialTransactionService': '../modules/warehouse/services/materialTransactionService',
  '../services/unifiedWarehouseService': '../modules/warehouse/services/unifiedWarehouseService',
  '../controllers/materialController': '../modules/warehouse/controllers/materialController',
  
  // Orders
  '../services/orderService': '../modules/orders/services/orderService',
  '../controllers/orderController': '../modules/orders/controllers/orderController',
  '../controllers/orderItemController': '../modules/orders/controllers/orderItemController',
  
  // Pricing
  '../services/pricingService': '../modules/pricing/services/pricingService',
  '../services/dynamicPricingService': '../modules/pricing/services/dynamicPricingService',
  
  // Add more mappings as needed
};

function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  
  for (const [oldPath, newPath] of Object.entries(pathMappings)) {
    const regex = new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    if (content.match(regex)) {
      content = content.replace(regex, newPath);
      updated = true;
    }
  }
  
  if (updated) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated: ${filePath}`);
  }
}

// Scan and update files
function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      updateImports(fullPath);
    }
  }
}

console.log('🔄 Updating imports...');
scanDirectory(path.join(__dirname, '../src'));
console.log('✅ Done!');

