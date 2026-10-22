import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import {
  ChatFilter,
  ChatOperator,
  OperatorConversation,
  OperatorMessage,
  ReplyScript,
  supportChatsApi,
} from '../../services/supportChats';
import './ChatsPage.css';

const FILTERS: Array<{ id: ChatFilter; label: string }> = [
  { id: 'unassigned', label: 'Не взятые' },
  { id: 'mine', label: 'Мои' },
  { id: 'open', label: 'Открытые' },
  { id: 'closed', label: 'Закрытые' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] || '').join('');
  return (letters || name.slice(0, 2) || 'К').toUpperCase();
}

function avatarTone(name: string): string {
  const code = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ['', 'warm', 'green'][code % 3];
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatListTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'вчера';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}

function assignment(chat: OperatorConversation): { text: string; tone: string } {
  if (chat.channel === 'staff') {
    if (chat.operatorUnread > 0) return { text: 'Новое', tone: '' };
    return { text: 'Личный диалог', tone: 'mine' };
  }
  if (chat.status === 'closed') return { text: 'Закрыт', tone: 'closed' };
  if (chat.awaitingReply && !chat.assignedUserId) return { text: 'Ждёт ответ', tone: '' };
  if (chat.awaitingReply && chat.mine) return { text: 'Ждёт ответ', tone: '' };
  if (!chat.assignedUserId) return { text: 'Не взят', tone: '' };
  if (chat.mine) return { text: 'Взяли вы', tone: 'mine' };
  return { text: `Взял: ${chat.assignedUserName || 'сотрудник'}`, tone: 'held' };
}

function applyScript(body: string, chat: OperatorConversation): string {
  const name = chat.customerName || 'клиент';
  const phone = chat.customerPhone || 'без телефона';
  const order = chat.orderRef || chat.crmOrderNumber || 'без номера';
  const topic = chat.topicLabel || 'обращение';
  return body
    .replace(/\{имя\}/g, name)
    .replace(/\{телефон\}/g, phone)
    .replace(/\{номер_заказа\}/g, order)
    .replace(/\{заказ\}/g, order)
    .replace(/\{тема\}/g, topic);
}

function scriptPreview(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim();
  return line || 'Пустой ответ';
}

export const ChatsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get('chat');
  const [mode, setMode] = useState<'site' | 'team'>(searchParams.get('mode') === 'team' ? 'team' : 'site');
  const [filter, setFilter] = useState<ChatFilter>('open');
  const [writeTo, setWriteTo] = useState<number | ''>('');
  const [conversations, setConversations] = useState<OperatorConversation[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [operators, setOperators] = useState<ChatOperator[]>([]);
  const [scripts, setScripts] = useState<ReplyScript[]>([]);
  const [me, setMe] = useState<{ id: number; name: string; role: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [inserted, setInserted] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((item) => item.id === selectedId) || null;

  const loadList = useCallback(async (silent = false) => {
    try {
      const conversations = mode === 'team'
        ? (await supportChatsApi.listStaff()).conversations
        : await supportChatsApi.list(filter).then((data) => {
          setUnassignedCount(data.unassignedCount);
          return data.conversations;
        });
      setConversations(conversations);
      setError(null);
      if (!silent) {
        setSelectedId((current) => (
          current && conversations.some((item) => item.id === current)
            ? current
            : conversations[0]?.id || null
        ));
      }
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить чаты');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, mode]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await supportChatsApi.detail(id);
      setMessages(data.messages);
      setConversations((current) => {
        const exists = current.some((item) => item.id === data.conversation.id);
        if (!exists) return [data.conversation, ...current];
        return current.map((item) => (
          item.id === data.conversation.id ? { ...item, ...data.conversation } : item
        ));
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось открыть чат');
    }
  }, []);

  useEffect(() => {
    void supportChatsApi.me().then(setMe).catch(() => setMe(null));
    void supportChatsApi.operators().then((data) => {
      setOperators(data.operators);
      setTransferTo(data.operators[0]?.id ?? '');
    }).catch(() => setOperators([]));
    void supportChatsApi.scripts().then((data) => setScripts(data.scripts)).catch(() => setScripts([]));
  }, []);

  useEffect(() => {
    if (searchParams.get('mode') === 'team') setMode('team');
  }, [searchParams]);

  useEffect(() => {
    const colleague = operators.find((operator) => operator.id !== me?.id);
    setWriteTo(colleague?.id ?? '');
  }, [me?.id, operators]);

  useEffect(() => {
    if (!requestedId) return;
    setSelectedId(requestedId);
    setMobileThread(true);
  }, [requestedId]);

  useEffect(() => {
    setLoading(true);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setDraft('');
    setInserted(null);
    setCloseArmed(false);
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadList(true);
      if (selectedId) void loadDetail(selectedId);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadDetail, loadList, selectedId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  };

  const choose = (id: string) => {
    setSelectedId(id);
    setMobileThread(true);
    setScriptsOpen(false);
  };

  const onSend = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!selectedId || !text || busy) return;
    void run(async () => {
      const result = await supportChatsApi.reply(selectedId, text);
      setDraft('');
      setInserted(null);
      setMessages((current) => [...current.filter((item) => item.id !== result.message.id), result.message]);
      setConversations((current) => current.map((item) => (
        item.id === result.conversation.id ? result.conversation : item
      )));
    });
  };

  const saveScript = async (id: number, title: string, body: string) => {
    await run(async () => {
      const result = await supportChatsApi.updateScript(id, title, body);
      setScripts((current) => current.map((item) => (item.id === id ? { ...item, ...result.script } : item)));
    });
  };

  const hint = useMemo(() => {
    if (!selected) return '';
    if (selected.channel === 'staff') return `Сообщение увидит ${selected.customerName}`;
    if (selected.status === 'closed') return 'Чат закрыт';
    if (!selected.assignedUserId) return 'Отправка заберёт чат на вас';
    if (selected.mine) return 'Сообщение уйдёт клиенту от вашего имени';
    return `Чат ведёт ${selected.assignedUserName || 'другой сотрудник'}`;
  }, [selected]);

  const canSend = selected?.channel === 'staff'
    ? Boolean(draft.trim())
    : Boolean(selected && selected.status !== 'closed' && (selected.mine || !selected.assignedUserId) && draft.trim());

  const colleagues = operators.filter((operator) => operator.id !== me?.id);

  const startStaffChat = () => {
    if (writeTo === '' || busy) return;
    void run(async () => {
      const result = await supportChatsApi.openStaff(Number(writeTo));
      setConversations((current) => [
        result.conversation,
        ...current.filter((item) => item.id !== result.conversation.id),
      ]);
      setSelectedId(result.conversation.id);
      setMobileThread(true);
    });
  };

  return (
    <AdminPageLayout
      className="chats-page"
      title="Чаты"
      description={mode === 'team' ? 'Связь · переписка команды' : 'Связь · канал «Сайт»'}
      icon={<AppIcon name="bell" size="sm" />}
      onBack={() => navigate(me?.role === 'admin' ? '/adminpanel' : '/')}
      headerExtra={(
        <>
          {mode === 'site' && <span className="chats-count">{unassignedCount} не взят</span>}
          {mode === 'site' && (
            <button type="button" className="chats-btn ghost" onClick={() => setScriptsOpen((value) => !value)}>
              {scriptsOpen ? 'К переписке' : 'Скрипты'}
            </button>
          )}
        </>
      )}
    >
      <div className={`chats-shell${mobileThread ? ' is-thread' : ''}`}>
        <section className="chats-list">
          <div className="chats-modes" role="tablist" aria-label="Канал чатов">
            <button type="button" className={`chats-mode${mode === 'site' ? ' is-on' : ''}`} onClick={() => { setMode('site'); setScriptsOpen(false); setMobileThread(false); }}>Сайт</button>
            <button type="button" className={`chats-mode${mode === 'team' ? ' is-on' : ''}`} onClick={() => { setMode('team'); setScriptsOpen(false); setMobileThread(false); }}>Команда</button>
          </div>
          {mode === 'team' ? (
            <div className="chats-compose">
              {colleagues.length === 0 ? (
                <p className="chats-empty">В команде пока больше никого нет.</p>
              ) : (
                <>
                  <select aria-label="Кому написать" value={writeTo} onChange={(event) => setWriteTo(Number(event.target.value))}>
                    {colleagues.map((operator) => (
                      <option key={operator.id} value={operator.id}>{operator.name}</option>
                    ))}
                  </select>
                  <button type="button" className="chats-btn go" disabled={busy || writeTo === ''} onClick={startStaffChat}>Написать</button>
                </>
              )}
            </div>
          ) : (
          <div className="chats-tabs" role="tablist" aria-label="Фильтр чатов">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chats-tab${filter === item.id ? ' is-on' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          )}
          <div className="chats-rows">
            {loading && <p className="chats-empty">Загрузка чатов</p>}
            {!loading && conversations.length === 0 && (
              <p className="chats-empty">В этом списке чатов пока нет.</p>
            )}
            {conversations.map((chat) => {
              const label = assignment(chat);
              const open = chat.id === selectedId;
              return (
                <article key={chat.id} className={`chats-row${open ? ' is-on' : ''}${chat.awaitingReply ? ' is-waiting' : ''}`}>
                  <button type="button" className="chats-who" onClick={() => choose(chat.id)}>
                    <span className={`chats-ava ${avatarTone(chat.customerName)}`}>{initials(chat.customerName)}</span>
                    <span className="chats-meta">
                      <span className="chats-line">
                        <span className="chats-name">{chat.customerName}</span>
                        <span className="chats-time">{formatListTime(chat.lastMessageAt)}</span>
                      </span>
                      <span className="chats-sub">{chat.channel === 'staff' ? 'Команда' : `${chat.topicLabel}${chat.orderRef ? ` · ${chat.orderRef}` : ''}`}</span>
                      <span className="chats-preview">{chat.lastMessagePreview || (chat.channel === 'staff' ? 'Диалог открыт' : 'Новое обращение')}</span>
                      <span className="chats-foot">
                        <span className={`chats-state ${label.tone}`}>{label.text}</span>
                        {chat.operatorUnread > 0 && <span className="chats-badge">{chat.operatorUnread}</span>}
                      </span>
                    </span>
                  </button>
                  {open && chat.channel !== 'staff' && chat.status !== 'closed' && (
                    <div className="chats-acts">
                      {!chat.assignedUserId && (
                        <button type="button" className="chats-btn go" disabled={busy} onClick={() => void run(async () => {
                          const result = await supportChatsApi.claim(chat.id);
                          setConversations((current) => current.map((item) => item.id === chat.id ? result.conversation : item));
                        })}
                        >
                          Взять
                        </button>
                      )}
                      <select
                        className="chats-btn"
                        aria-label="Кому передать"
                        value={transferTo}
                        onChange={(event) => setTransferTo(Number(event.target.value))}
                      >
                        {operators.map((operator) => (
                          <option key={operator.id} value={operator.id}>{operator.name}</option>
                        ))}
                      </select>
                      <button type="button" className="chats-btn" disabled={busy || transferTo === ''} onClick={() => void run(async () => {
                        const result = await supportChatsApi.transfer(chat.id, Number(transferTo));
                        setConversations((current) => current.map((item) => item.id === chat.id ? result.conversation : item));
                      })}
                      >
                        Передать
                      </button>
                      {(chat.mine || me?.role === 'admin') && chat.assignedUserId && (
                        <button type="button" className="chats-btn warn" disabled={busy} onClick={() => void run(async () => {
                          const result = await supportChatsApi.release(chat.id);
                          setConversations((current) => current.map((item) => item.id === chat.id ? result.conversation : item));
                        })}
                        >
                          Снять
                        </button>
                      )}
                      <button type="button" className="chats-btn stop" disabled={busy} onClick={() => {
                        if (!closeArmed) {
                          setCloseArmed(true);
                          return;
                        }
                        void run(async () => {
                          const result = await supportChatsApi.close(chat.id);
                          setCloseArmed(false);
                          setConversations((current) => current.map((item) => item.id === chat.id ? result.conversation : item));
                        });
                      }}
                      >
                        {closeArmed ? 'Точно закрыть' : 'Закрыть'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="chats-stage">
          <button type="button" className="chats-btn chats-back" onClick={() => setMobileThread(false)}>К списку</button>
          {error && <p className="chats-error">{error}</p>}
          {scriptsOpen ? (
            <div className="chats-editor">
              <h2>Скрипты ответа</h2>
              <p className="chats-note">{'{имя}'}, {'{телефон}'}, {'{номер_заказа}'} и {'{тема}'} подставятся в текст, когда скрипт вставляют в ответ.</p>
              {scripts.map((script) => (
                <ScriptCard key={script.id} script={script} disabled={busy} onSave={saveScript} onHide={(id) => void run(async () => {
                  await supportChatsApi.hideScript(id);
                  setScripts((current) => current.filter((item) => item.id !== id));
                })}
                />
              ))}
              <form className="chats-script-form" onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = await supportChatsApi.createScript(newTitle, newBody);
                  setScripts((current) => [...current, result.script]);
                  setNewTitle('');
                  setNewBody('');
                });
              }}
              >
                <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Название" aria-label="Название скрипта" />
                <textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} placeholder="Текст. Можно использовать {имя}, {телефон}, {номер_заказа} и {тема}" aria-label="Текст скрипта" />
                <div className="chats-script-actions">
                  <button type="submit" className="chats-btn go" disabled={busy || !newTitle.trim()}>Добавить</button>
                </div>
              </form>
            </div>
          ) : !selected ? (
            <p className="chats-empty">Выберите чат слева.</p>
          ) : (
            <>
              <header className="chats-head">
                <div>
                  <h2>{selected.customerName}</h2>
                  <div className="chats-chips">
                    <span className="chats-chip"><span className="chats-dot" />{selected.channel === 'staff' ? 'Команда' : 'Сайт'}</span>
                    {selected.channel !== 'staff' && selected.orderRef && <span className="chats-chip">Заказ {selected.orderRef}</span>}
                    {selected.crmOrderId && (
                      <Link className="chats-chip chats-chip-link" to={`/?orderId=${selected.crmOrderId}`}>
                        В CRM {selected.crmOrderNumber || selected.crmOrderId}
                      </Link>
                    )}
                    {selected.channel !== 'staff' && <span className="chats-chip">{selected.topicLabel}</span>}
                  </div>
                </div>
                <div className="chats-owner">{selected.channel === 'staff' ? 'Пишете' : 'Ведёт'}<strong>{selected.channel === 'staff' ? selected.customerName : (selected.assignedUserId ? (selected.assignedUserName || 'вы') : 'ещё никто')}</strong></div>
              </header>
              <div className="chats-log" ref={logRef}>
                {messages.map((message) => (
                  <article key={message.id} className={`chats-msg ${message.direction === 'out' ? 'out' : 'in'}`}>
                    <p className="chats-who-line">{
                      selected.channel === 'staff'
                        ? (message.direction === 'out' ? (me?.name || 'Вы') : (message.operatorName || selected.customerName))
                        : (message.direction === 'out' ? (message.operatorName || 'Сотрудник') : 'Клиент')
                    }</p>
                    <div className="chats-bubble"><p>{message.text}</p></div>
                    <p className="chats-stamp">{formatStamp(message.createdAt)}</p>
                  </article>
                ))}
                {messages.length === 0 && <p className="chats-empty">Сообщений пока нет.</p>}
              </div>
              {selected.status === 'closed' ? (
                <div className="chats-closed">Чат закрыт. Если клиент напишет снова, он вернётся в открытые.</div>
              ) : (
                <form className="chats-dock" onSubmit={onSend}>
                  <span className="chats-crop tl" /><span className="chats-crop tr" />
                  <span className="chats-crop bl" /><span className="chats-crop br" />
                  {selected.channel !== 'staff' && <div className="chats-scripts">
                    {scripts.map((script) => (
                      <button
                        key={script.id}
                        type="button"
                        className={`chats-script${inserted === script.title ? ' is-on' : ''}`}
                        onClick={() => {
                          const text = applyScript(script.body, selected);
                          setDraft(text);
                          setInserted(script.body.trim() ? script.title : null);
                        }}
                      >
                        <b>{script.title}</b>
                        <span>{scriptPreview(script.body)}</span>
                      </button>
                    ))}
                  </div>}
                  <div className="chats-sheet">
                    {inserted && <div className="chats-inserted">Вставлено из скрипта «{inserted}»</div>}
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          onSend();
                        }
                      }}
                      placeholder={selected.channel === 'staff' ? 'Напишите коллеге' : 'Напишите ответ или вставьте скрипт'}
                      aria-label={selected.channel === 'staff' ? 'Сообщение коллеге' : 'Ответ клиенту'}
                    />
                    <div className="chats-bar">
                      <div className="chats-as"><span className="chats-mini">{initials(me?.name || 'Я')}</span>{hint}</div>
                      <div className="chats-as">
                        <span className="chats-key">Enter</span>
                        <button type="submit" className="chats-send" disabled={!canSend || busy}>Отправить</button>
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
};

const ScriptCard: React.FC<{
  script: ReplyScript;
  disabled: boolean;
  onSave: (id: number, title: string, body: string) => Promise<void>;
  onHide: (id: number) => void;
}> = ({ script, disabled, onSave, onHide }) => {
  const [title, setTitle] = useState(script.title);
  const [body, setBody] = useState(script.body);
  return (
    <form className="chats-script-card" onSubmit={(event) => {
      event.preventDefault();
      void onSave(script.id, title, body);
    }}
    >
      <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Название скрипта" />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label="Текст скрипта" />
      <div className="chats-script-actions">
        <button type="submit" className="chats-btn go" disabled={disabled || !title.trim()}>Сохранить</button>
        <button type="button" className="chats-btn stop" disabled={disabled} onClick={() => onHide(script.id)}>Скрыть</button>
      </div>
    </form>
  );
};
