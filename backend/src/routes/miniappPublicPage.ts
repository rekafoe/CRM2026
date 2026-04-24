import type { Express, NextFunction, Request, Response } from 'express';
import { getDb } from '../config/database';
import { renderMiniappIndexHtml } from '../utils/miniappIndexHtml';

function defaultApiBase(req: Request): string {
  const xf = (req.headers['x-forwarded-proto'] as string) || '';
  const proto = xf.split(',')[0]?.trim() || (req.protocol === 'https' ? 'https' : 'http');
  const host = (req.get('host') || 'localhost:3001').trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function getDefaultOrganizationLogoUrl(): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.get<{ logo_url: string }>(
      `SELECT logo_url FROM organizations
       WHERE TRIM(COALESCE(logo_url, '')) != ''
       ORDER BY is_default DESC, sort_order ASC, id ASC
       LIMIT 1`
    );
    return row?.logo_url != null && String(row.logo_url).trim() ? String(row.logo_url).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Публичная витрина Mini App (без JWT CRM). Кладёт на сервер ДО app.use(authMiddleware).
 */
export function registerMiniappPublicPage(app: Express): void {
  const send = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fromEnv = (process.env.MINIAPP_API_BASE_URL || '').trim().replace(/\/+$/, '');
      const apiBase = fromEnv || defaultApiBase(req);
      const rawCat = String(process.env.MINIAPP_CATALOG_CATEGORY_ID || '').trim();
      const n = parseInt(rawCat, 10);
      const catalogCategoryId =
        rawCat && Number.isFinite(n) && n > 0 ? n : null;
      const organizationLogoUrl = await getDefaultOrganizationLogoUrl();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(
        renderMiniappIndexHtml(apiBase, {
          catalogCategoryId,
          organizationLogoUrl,
        })
      );
    } catch (e) {
      next(e);
    }
  };

  app.get('/miniapp', send);
  app.get('/miniapp/', send);
}
