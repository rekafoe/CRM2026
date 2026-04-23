import type { Express, Request, Response } from 'express';
import { renderMiniappIndexHtml } from '../utils/miniappIndexHtml';

function defaultApiBase(req: Request): string {
  const xf = (req.headers['x-forwarded-proto'] as string) || '';
  const proto = xf.split(',')[0]?.trim() || (req.protocol === 'https' ? 'https' : 'http');
  const host = (req.get('host') || 'localhost:3001').trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/**
 * Публичная витрина Mini App (без JWT CRM). Кладёт на сервер ДО app.use(authMiddleware).
 */
export function registerMiniappPublicPage(app: Express): void {
  const send = (req: Request, res: Response) => {
    const fromEnv = (process.env.MINIAPP_API_BASE_URL || '').trim().replace(/\/+$/, '');
    const apiBase = fromEnv || defaultApiBase(req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderMiniappIndexHtml(apiBase));
  };

  app.get('/miniapp', send);
  app.get('/miniapp/', send);
}
