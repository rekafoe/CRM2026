import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../../components/ui/AppIcon';
import '../../styles/admin-page-layout.css';

const TODOS = [
  { id: 'decide-channel-strategy', content: 'Выбрать стратегию: Путь A (бизнес-каналы) vs B (omnichannel-SaaS) vs гибрид' },
  { id: 'security-critical', content: 'Закрыть критические дыры: bcrypt, IDOR файлов, разделение API-ключей, webhook secrets' },
  { id: 'inbox-schema', content: 'Миграции: conversations, messages, attachments, events' },
  { id: 'telegram-ingest', content: 'Telegram webhook → ingest в inbox (вместо redirect на Mini App)' },
  { id: 'inbox-ui', content: 'CRM UI: список диалогов, чат, ответ, назначение, подпись оператора' },
  { id: 'website-forms', content: 'Endpoint заявок с сайта → conversation в inbox' },
  { id: 'viber-adapter', content: 'Viber Public Account + adapter + webhook' },
  { id: 'instagram-adapter', content: 'Meta App + Instagram Business + Messaging API adapter' },
  { id: 'client-migration', content: 'Коммуникация клиентам: перевод на новые точки входа' },
] as const;

export const InboxFunnelPlanPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="admin-page-layout preflight-page">
      <div className="admin-page-header">
        <button type="button" onClick={() => navigate('/adminpanel')} className="back-btn">
          ← Назад
        </button>
        <h1>
          <AppIcon name="bell" size="sm" /> Воронка чатов и безопасность
        </h1>
      </div>

      <div className="admin-page-content">
        <div className="preflight-card">
          <div className="preflight-status preflight-status--planned">
            Статус: Запланировано
          </div>
          <p className="preflight-category">Категория: Коммуникации + Security</p>

          <h2>Описание</h2>
          <p>
            Единый inbox в CRM для Telegram / Viber / Instagram / форм сайта с учётом ограничения
            официальных API для личных аккаунтов, поэтапной миграции на бизнес-каналы и параллельного
            закрытия критических дыр в безопасности.
          </p>
          <p>
            Полный текст плана также в репозитории:{' '}
            <code>docs/inbox-funnel-and-security-plan.md</code>
          </p>

          <h2>Чеклист задач</h2>
          <div className="preflight-plan">
            <ol>
              {TODOS.map((todo) => (
                <li key={todo.id}>
                  <strong>{todo.id}</strong> — {todo.content}
                </li>
              ))}
            </ol>
          </div>

          <h2>Критическое ограничение</h2>
          <div className="preflight-plan">
            <p>
              Сотрудники работают с <strong>общих личных аккаунтов</strong> TG/Viber/Inst.
              Прокси к личной переписке через официальные API <strong>невозможен</strong>.
            </p>
            <table className="preflight-plan-table">
              <thead>
                <tr>
                  <th>Канал</th>
                  <th>Реалистичный путь</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Telegram</td>
                  <td>Миграция на Bot API (userbot — риск бана / ToS)</td>
                </tr>
                <tr>
                  <td>Viber</td>
                  <td>Только Viber Public Account / Business Messages</td>
                </tr>
                <tr>
                  <td>Instagram</td>
                  <td>Instagram Business + Facebook Page (Meta Graph API)</td>
                </tr>
                <tr>
                  <td>Сайт (формы)</td>
                  <td>Свой API в CRM</td>
                </tr>
              </tbody>
            </table>

            <h3>Стратегии</h3>
            <ul>
              <li>
                <strong>Путь A (рекомендуемый):</strong> свой inbox + миграция клиентов на бизнес-каналы.
                Полный контроль данных, минус — 1–2 месяца коммуникации.
              </li>
              <li>
                <strong>Путь B:</strong> omnichannel-SaaS (Umnico / Wazzup / ChatApp / Jivo) как мост —
                быстрее старт (2–4 нед), но абонентка и данные у третьей стороны.
              </li>
              <li>
                <strong>Путь C (не рекомендуем):</strong> userbot / автоматизация личных аккаунтов —
                баны, нестабильность, юр. риски.
              </li>
            </ul>
            <p>
              <strong>Рекомендация:</strong> гибрид — свой inbox + бизнес-API; на переходный период
              при необходимости — SaaS только для старых личных аккаунтов.
            </p>
          </div>

          <h2>Целевая схема БД</h2>
          <div className="preflight-plan">
            <table className="preflight-plan-table">
              <thead>
                <tr>
                  <th>Таблица</th>
                  <th>Назначение</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>conversations</td>
                  <td>Диалог: channel, external_chat_id, customer_id, status, assigned_user_id, unread</td>
                </tr>
                <tr>
                  <td>conversation_messages</td>
                  <td>Иммутабельный лог: direction, body, operator_user_id, raw_payload, sent_at</td>
                </tr>
                <tr>
                  <td>conversation_attachments</td>
                  <td>Файлы: storage_path, mime, size, original_filename</td>
                </tr>
                <tr>
                  <td>conversation_events</td>
                  <td>Audit: назначение, смена статуса, пометки</td>
                </tr>
              </tbody>
            </table>
            <p>
              Связи: <code>customers.id</code>, <code>users.id</code>, опционально <code>orders.id</code>.
            </p>
          </div>

          <h2>Backend / Frontend</h2>
          <div className="preflight-plan">
            <h3>Backend</h3>
            <ul>
              <li>
                <code>backend/src/modules/inbox/</code> — services, controllers, routes, adapters
              </li>
              <li>
                Adapters: telegram (поверх текущего TelegramService), viber, instagram, website
              </li>
              <li>
                API: <code>/api/inbox/*</code> — список, детали, ответ, назначение, статусы
              </li>
              <li>
                Расширить <code>telegramWebhookController</code>: ingest сообщений/файлов вместо hint на Mini App
              </li>
            </ul>
            <h3>Frontend</h3>
            <ul>
              <li>Отдельная страница «Чаты» (не вкладка NotificationsManager)</li>
              <li>Список диалогов + панель переписки + composer с файлами (Flux)</li>
              <li>Бейджи канала / непрочитанных / оператора; привязка к customers</li>
            </ul>
          </div>

          <h2>Оценка сроков</h2>
          <div className="preflight-plan">
            <table className="preflight-plan-table">
              <thead>
                <tr>
                  <th>Этап</th>
                  <th>Содержание</th>
                  <th>Срок</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>0. Security</td>
                  <td>Пароли, IDOR, API-ключи, webhook secrets</td>
                  <td>1–2 нед</td>
                </tr>
                <tr>
                  <td>1. MVP Inbox</td>
                  <td>БД, Telegram ingest/outbound, UI список+чат</td>
                  <td>3–4 нед</td>
                </tr>
                <tr>
                  <td>2. Сайт</td>
                  <td>Формы → inbox</td>
                  <td>1 нед</td>
                </tr>
                <tr>
                  <td>3. Операторы</td>
                  <td>Назначение, подпись, статусы, уведомления</td>
                  <td>1–2 нед</td>
                </tr>
                <tr>
                  <td>4. Viber</td>
                  <td>PA + adapter</td>
                  <td>2–3 нед</td>
                </tr>
                <tr>
                  <td>5. Instagram</td>
                  <td>Meta App + review + adapter</td>
                  <td>3–5 нед</td>
                </tr>
                <tr>
                  <td>6. Миграция</td>
                  <td>QR/ссылки, перевод клиентов</td>
                  <td>4–8 нед пар.</td>
                </tr>
              </tbody>
            </table>
            <p>
              <strong>MVP (TG + формы + UI):</strong> ~6–8 недель.{' '}
              <strong>Полный omnichannel:</strong> ~12–16 недель + миграция.
            </p>
          </div>

          <h2>Security: закрыть до inbox</h2>
          <div className="preflight-plan">
            <h3>Критично</h3>
            <ol>
              <li>
                Пароли SHA-256 без salt → <strong>bcrypt/argon2</strong> (
                <code>backend/src/utils/password.ts</code>)
              </li>
              <li>
                Постоянные <code>api_token</code> → JWT + expiry / ротация (
                <code>authService.ts</code>)
              </li>
              <li>
                IDOR на файлы заказов → проверка роли/привязки (
                <code>orders.ts</code>)
              </li>
              <li>
                Один <code>WEBSITE_ORDER_API_KEY</code> на всё → ключи по scope
              </li>
              <li>
                Telegram webhook secret обязателен в prod; admin-only на управление webhook
              </li>
            </ol>
            <h3>Высокий приоритет</h3>
            <ul>
              <li>CORS: убрать «любой *.vercel.app»</li>
              <li>Swagger <code>/api-docs</code> не публиковать без auth</li>
              <li>bePaid webhook — верификация подписи</li>
              <li>Убрать демо-токены / fallback <code>admin-token-123</code></li>
              <li>MIME-check для order files; SVG XSS; SSRF после redirect</li>
            </ul>
            <h3>Для inbox сразу заложить</h3>
            <ul>
              <li>Шифрование PII / raw_payload, retention, лог доступа к переписке</li>
              <li>RBAC по чатам, скан вложений</li>
            </ul>
          </div>

          <h2>Решить до старта</h2>
          <div className="preflight-plan">
            <ol>
              <li>Путь A или B (или гибрид)?</li>
              <li>Готовы ли перевести клиентов на бота / PA / Business?</li>
              <li>MVP: только TG + формы, или сразу все каналы?</li>
              <li>Файлы переписки: <code>uploads/</code> или S3?</li>
            </ol>
          </div>

          <h2>Итог</h2>
          <div className="preflight-plan">
            <ul>
              <li>
                Технически реализуемо на текущей CRM (Telegram, customers, auth, uploads).
              </li>
              <li>
                Главный блокер — не код, а <strong>личные аккаунты мессенджеров</strong>.
              </li>
              <li>
                Security-фиксы критичны <strong>до</strong> запуска inbox: переписка ещё чувствительнее заказов.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
