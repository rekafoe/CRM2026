import { Request, Response, NextFunction } from 'express';
import * as path from 'path';

/**
 * Запрещает отдачу через express.static путей, похожих на БД, бэкапы, обход каталога.
 * Не заменяет настройку UPLOADS_DIR: файлы вне каталога uploads не должны попадать в volume.
 */
const DANGEROUS_EXT = /\.(db|sqlite3?|sql|dump|sqlitedb|backup)$/i;
const SQLITE_SIDECAR = /(\.db|\.sqlite3?)(-wal|-shm|-journal)$/i;
const EMBEDDED_DB_NAME = /(^|[/\\])(data|database)\.(db|sqlite3?|sql)$/i;

export function blockSensitiveStaticPath(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const urlPath = (() => {
    const u = _req.path || _req.url?.split('?')[0] || '';
    return decodeURIComponent(u);
  })();

  if (/\.\.|\%2e\%2e/i.test(urlPath) || /%2f|%5c/i.test(_req.path || '')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const base = path.posix.basename(urlPath.replace(/\\/g, '/'));
  if (EMBEDDED_DB_NAME.test(urlPath) || DANGEROUS_EXT.test(urlPath) || SQLITE_SIDECAR.test(urlPath)) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  if (DANGEROUS_EXT.test(base)) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  next();
}
