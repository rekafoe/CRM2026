/**
 * Стили оболочки Telegram Mini App (inline в HTML).
 * Визуально согласованы с ProductManagement.css (/adminpanel/products).
 */
import { getMiniappMapAndBynShellCss } from './miniappShellStylesMap';

const MINIAPP_SHELL_CSS_BASE = `
    :root {
      --ipc-radius: 16px;
      --ipc-border: #e2e8f0;
      --ipc-sep: var(--tg-theme-section-separator-color, rgba(120, 120, 120, 0.28));
      --ipc-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      --ipc-slate-900: #0f172a;
      --ipc-slate-500: #64748b;
      --ipc-slate-600: #475569;
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      margin: 0;
      /* Запас под плавающую навигацию + safe area + iPhone home indicator */
      padding: 16px 16px calc(128px + env(safe-area-inset-bottom, 0px) + 12px);
      min-height: 100vh;
      background: var(--tg-theme-bg-color, #f8fafc);
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      -webkit-tap-highlight-color: transparent;
      animation: ipcFadeIn 0.35s ease-out;
    }
    @keyframes ipcFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .miniapp-wrap { max-width: 1680px; margin: 0 auto; }
    .ipc-pm-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      padding: 16px 20px;
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid var(--ipc-sep, var(--ipc-border));
      border-radius: var(--ipc-radius);
      box-shadow: var(--ipc-shadow);
    }
    .ipc-pm-header__left { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .ipc-pm-header__icon {
      width: 48px; height: 48px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      background: var(--tg-theme-bg-color, #f1f5f9);
      border: 2px solid var(--ipc-sep, var(--ipc-border));
      border-radius: 12px;
    }
    .ipc-pm-header__title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .ipc-pm-header__sub {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--tg-theme-hint-color, var(--ipc-slate-500));
      line-height: 1.35;
    }
    #miniapp-main { min-height: 40vh; }
    .miniapp-nav {
      position: fixed; left: 0; right: 0; bottom: 0;
      z-index: 5;
      display: flex; gap: 8px;
      /* Поднять панель над home indicator: safe area + запас 14px */
      padding: 10px 12px calc(16px + env(safe-area-inset-bottom, 0px) + 14px);
      background: var(--tg-theme-secondary-bg-color, rgba(255, 255, 255, 0.98));
      border-top: 1px solid var(--ipc-sep, var(--ipc-border));
      box-shadow: 0 -4px 28px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .tab {
      flex: 1;
      padding: 10px 6px;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.02em;
      border-radius: 999px;
      cursor: pointer;
      border: 1px solid var(--ipc-sep, rgba(120, 120, 120, 0.3));
      background: var(--tg-theme-bg-color, rgba(128, 128, 128, 0.1));
      color: var(--tg-theme-text-color, #1f2937);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      transition: all 0.2s ease;
    }
    .tab:hover { filter: brightness(1.05); }
    .tab-on {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.55);
      color: var(--tg-theme-link-color, #60a5fa);
      font-weight: 600;
    }
    .section { margin-bottom: 8px; }
    .section-head {
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0 0 14px;
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      letter-spacing: -0.02em;
    }
    .hint { color: var(--tg-theme-hint-color, var(--ipc-slate-500)); font-size: 13px; line-height: 1.45; }
    .line { font-size: 15px; margin: 6px 0; color: var(--tg-theme-text-color, #334155); }
    .card, .ipc-card {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border-radius: var(--ipc-radius);
      border: 1px solid var(--ipc-sep, var(--ipc-border));
      box-shadow: var(--ipc-shadow);
    }
    .card { padding: 14px 16px; margin-bottom: 12px; }
    .ipc-card { padding: 14px 16px; }
    .card-title { font-weight: 600; margin-bottom: 6px; line-height: 1.35; color: var(--tg-theme-text-color, #1e293b); }
    .card-price, .muted { font-size: 14px; font-weight: 600; color: var(--tg-theme-text-color, var(--ipc-slate-500)); }
    .catalog-grid { display: flex; flex-direction: column; gap: 12px; }
    .ipc-total { font-weight: 700; font-size: 1.05rem; padding: 14px 0 6px; color: var(--tg-theme-text-color, var(--ipc-slate-900)); }
    .ipc-result { margin-top: 14px; padding: 14px 16px; border-radius: var(--ipc-radius); }
    .row { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .primary {
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      border-radius: 999px;
      cursor: pointer;
      border: 1px solid rgba(59, 130, 246, 0.5);
      background: rgba(59, 130, 246, 0.28);
      color: var(--tg-theme-button-text-color, var(--tg-theme-link-color, #1d4ed8));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
    }
    .primary:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.4);
      border-color: rgba(59, 130, 246, 0.65);
    }
    .primary:disabled { opacity: 0.65; cursor: not-allowed; }
    .small {
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.02em;
      border-radius: 999px;
      cursor: pointer;
      border: 1px solid var(--ipc-sep, rgba(120, 120, 120, 0.3));
      background: var(--tg-theme-bg-color, rgba(128, 128, 128, 0.12));
      color: var(--tg-theme-text-color, #1f2937);
      transition: all 0.2s ease;
    }
    .small:hover:not(:disabled) { filter: brightness(1.05); }
    .danger {
      border-color: rgba(239, 68, 68, 0.45) !important;
      background: rgba(239, 68, 68, 0.18) !important;
      color: #b91c1c !important;
    }
    .danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.28) !important;
      border-color: rgba(239, 68, 68, 0.55) !important;
    }
    .total { font-weight: 600; margin: 10px 0; color: var(--tg-theme-text-color, var(--ipc-slate-900)); }
    .okmsg { color: #15803d; font-size: 14px; }
    .form .field { margin-bottom: 12px; }
    .form label { display: block; font-size: 13px; font-weight: 500; color: var(--tg-theme-hint-color, var(--ipc-slate-600)); }
    .form input, .form textarea, .form select {
      width: 100%;
      margin-top: 6px;
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--ipc-sep, var(--ipc-border));
      font: inherit;
      background: var(--tg-theme-bg-color, #f8fafc);
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    }
    .form input:focus, .form textarea:focus, .form select:focus {
      outline: none;
      border-color: #64748b;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
      background: var(--tg-theme-secondary-bg-color, #fff);
    }
    .form input[type="file"] {
      border: 1px dashed var(--ipc-sep, #cbd5e1);
      padding: 10px;
      font-size: 13px;
      background: var(--tg-theme-bg-color, #fff);
    }
    .ipc-panel {
      background: var(--tg-theme-secondary-bg-color, #fff);
      border: 1px solid var(--ipc-sep, var(--ipc-border));
      border-radius: var(--ipc-radius);
      box-shadow: var(--ipc-shadow);
      overflow: hidden;
      margin-bottom: 4px;
    }
    .ipc-list { display: flex; flex-direction: column; }
    .ipc-list__row {
      padding: 14px 16px;
      border-bottom: 1px solid var(--ipc-sep, #f1f5f9);
      transition: background 0.15s ease;
    }
    .ipc-list__row:last-child { border-bottom: none; }
    .ipc-list__row:hover { background: var(--tg-theme-bg-color, #f8fafc); }
    .ipc-list__row-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .ipc-list__title {
      font-size: 15px;
      font-weight: 600;
      color: var(--tg-theme-text-color, var(--ipc-slate-900));
      line-height: 1.3;
    }
    .ipc-list__meta { font-size: 13px; color: var(--tg-theme-hint-color, var(--ipc-slate-500)); margin-top: 4px; }
    .ipc-list__actions { margin-top: 12px; display: flex; justify-content: flex-end; }
    .ipc-list__actions--wide .primary { width: 100%; justify-content: center; }
    .ipc-list__row-summary { font-size: 14px; color: var(--tg-theme-text-color, #334155); line-height: 1.4; flex: 1; min-width: 0; }
    .ipc-chip {
      display: inline-flex;
      align-items: center;
      max-width: 60%;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--ipc-sep, #e2e8f0);
      background: var(--tg-theme-bg-color, #f8fafc);
      color: var(--tg-theme-text-color, #334155);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ipc-chip--slate {
      background: #475569;
      color: #fff;
      border-color: transparent;
      box-shadow: 0 2px 6px rgba(71, 85, 105, 0.2);
    }
    .ipc-empty {
      text-align: center;
      padding: 36px 20px;
      color: var(--tg-theme-hint-color, #94a3b8);
      font-size: 14px;
      line-height: 1.5;
    }
`;

export const MINIAPP_SHELL_CSS = MINIAPP_SHELL_CSS_BASE + getMiniappMapAndBynShellCss();