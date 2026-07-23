#!/usr/bin/env node
/**
 * Sync shared design-editor core: CRM → printcore-website vendor.
 *
 * Usage (from CRM repo root):
 *   node tools/sync-design-editor.mjs
 *   node tools/sync-design-editor.mjs --dry-run
 *   node tools/sync-design-editor.mjs --from-vendor   # reverse: vendor → CRM (rare)
 *
 * Default WEBSITE root: sibling ../printcore-website
 * Override: DESIGN_EDITOR_WEBSITE_ROOT=D:\printcore-website
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRM_ROOT = path.resolve(__dirname, '..');
const WEBSITE_ROOT = path.resolve(
  process.env.DESIGN_EDITOR_WEBSITE_ROOT
    || path.join(CRM_ROOT, '..', 'printcore-website'),
);
const CRM_SRC = path.join(CRM_ROOT, 'frontend', 'src');
const VENDOR = path.join(WEBSITE_ROOT, 'vendor', 'crm-design-editor');

const dryRun = process.argv.includes('--dry-run');
const fromVendor = process.argv.includes('--from-vendor');

/** Shared paths relative to frontend/src ↔ vendor root (same tree shape).
 *  Keep narrow: full publicDesignEditor on site may still be ahead of CRM —
 *  sync only canvas/core until public features are fully reverse-synced. */
const SYNC_PATHS = [
  'pages/admin/designEditor',
  'features/designEditorShell',
  'utils/fabricFontReload.ts',
  'utils/loadDesignFonts.ts',
];

/** Never overwrite these CRM-only files during sync. */
const SKIP_BASENAMES = new Set([
  'editorCanvasDisplaySharpness.ts',
  'EditorInAppFieldSheets.css',
]);

const WEBSITE_ONLY_IMPORT = 'lib/crm/clientEditor';
const CRM_ASSET_IMPORT_RE = /from ['"](?:\.\.\/)+utils\/crmEditorAssetUrl['"]/g;
const WEBSITE_ASSET_IMPORT = "from '../../../../../lib/crm/clientEditor/resolveCrmEditorAssetUrl'";

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function shouldSkip(filePath) {
  return SKIP_BASENAMES.has(path.basename(filePath));
}

function copyFile(src, dest) {
  if (dryRun) {
    console.log(`[dry-run] ${path.relative(CRM_ROOT, src)} → ${path.relative(WEBSITE_ROOT, dest)}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${path.relative(fromVendor ? VENDOR : CRM_SRC, src)}`);
}

function syncTree(relPath) {
  const srcRoot = fromVendor ? path.join(VENDOR, relPath) : path.join(CRM_SRC, relPath);
  const destRoot = fromVendor ? path.join(CRM_SRC, relPath) : path.join(VENDOR, relPath);

  if (!fs.existsSync(srcRoot)) {
    console.warn(`skip missing: ${srcRoot}`);
    return;
  }

  if (fs.statSync(srcRoot).isFile()) {
    if (shouldSkip(srcRoot)) return;
    const content = fs.readFileSync(srcRoot, 'utf8');
    if (fromVendor && content.includes(WEBSITE_ONLY_IMPORT)) {
      console.warn(`skip (website-only import): ${relPath}`);
      return;
    }
    copyFile(srcRoot, destRoot);
    return;
  }

  for (const file of walkFiles(srcRoot)) {
    if (shouldSkip(file)) continue;
    const rel = path.relative(srcRoot, file);
    const dest = path.join(destRoot, rel);
    if (fromVendor) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(WEBSITE_ONLY_IMPORT)) {
        console.warn(`skip (website-only import): ${path.join(relPath, rel)}`);
        continue;
      }
    }
    if (!fromVendor && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      let content = fs.readFileSync(file, 'utf8');
      if (CRM_ASSET_IMPORT_RE.test(content)) {
        CRM_ASSET_IMPORT_RE.lastIndex = 0;
        content = content.replace(CRM_ASSET_IMPORT_RE, WEBSITE_ASSET_IMPORT);
        if (dryRun) {
          console.log(`[dry-run] rewrite+copy ${path.join(relPath, rel)}`);
          continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, 'utf8');
        console.log(`copied (rewrote asset import) ${path.join(relPath, rel)}`);
        continue;
      }
    }
    copyFile(file, dest);
  }
}

function main() {
  if (!fs.existsSync(WEBSITE_ROOT)) {
    console.error(`Website root not found: ${WEBSITE_ROOT}`);
    console.error('Set DESIGN_EDITOR_WEBSITE_ROOT or place printcore-website next to CRM.');
    process.exit(1);
  }
  console.log(`${fromVendor ? 'vendor → CRM' : 'CRM → vendor'}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`CRM:     ${CRM_SRC}`);
  console.log(`Vendor:  ${VENDOR}`);
  for (const p of SYNC_PATHS) syncTree(p);
  console.log('done');
}

main();
