import { apiClient } from '../utils/api';

export type ChatFilter = 'unassigned' | 'mine' | 'open' | 'closed';

export interface OperatorConversation {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  topic: string;
  topicLabel: string;
  channel: 'website' | 'staff';
  orderRef: string | null;
  crmOrderId: number | null;
  crmOrderNumber: string | null;
  peerUserId?: number | null;
  status: 'open' | 'closed';
  assignedUserId: number | null;
  assignedUserName: string | null;
  mine: boolean;
  lastMessagePreview: string;
  lastMessageAt: string;
  operatorUnread: number;
  awaitingReply: boolean;
}

export interface OperatorMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  operatorName: string | null;
  createdAt: string;
}

export interface ReplyScript {
  id: number;
  title: string;
  body: string;
}

export interface ChatOperator {
  id: number;
  name: string;
}

export interface CurrentStaff {
  id: number;
  name: string;
  role: string;
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Не удалось выполнить запрос';
}

async function get<T>(url: string): Promise<T> {
  try {
    const response = await apiClient.get<T>(url);
    return response.data;
  } catch (error) {
    throw new Error(messageOf(error));
  }
}

async function send<T>(url: string, body?: unknown, method: 'post' | 'patch' | 'delete' = 'post'): Promise<T> {
  try {
    const response = await apiClient.request<T>({ url, method, data: body });
    return response.data;
  } catch (error) {
    throw new Error(messageOf(error));
  }
}

export const supportChatsApi = {
  me: () => get<CurrentStaff>('/auth/me'),
  attention: () => get<{ count: number }>('/chats/attention'),
  list: (filter: ChatFilter) =>
    get<{ conversations: OperatorConversation[]; unassignedCount: number }>(
      `/chats/conversations?filter=${filter}`,
    ),
  listStaff: () => get<{ conversations: OperatorConversation[] }>('/chats/staff'),
  openStaff: (userId: number) =>
    send<{ conversation: OperatorConversation }>('/chats/staff', { userId }),
  detail: (id: string) =>
    get<{ conversation: OperatorConversation; messages: OperatorMessage[] }>(
      `/chats/conversations/${encodeURIComponent(id)}`,
    ),
  claim: (id: string) =>
    send<{ conversation: OperatorConversation }>(`/chats/conversations/${encodeURIComponent(id)}/claim`),
  transfer: (id: string, userId: number) =>
    send<{ conversation: OperatorConversation }>(`/chats/conversations/${encodeURIComponent(id)}/transfer`, { userId }),
  release: (id: string) =>
    send<{ conversation: OperatorConversation }>(`/chats/conversations/${encodeURIComponent(id)}/release`),
  close: (id: string) =>
    send<{ conversation: OperatorConversation }>(`/chats/conversations/${encodeURIComponent(id)}/close`),
  reply: (id: string, text: string) =>
    send<{ conversation: OperatorConversation; message: OperatorMessage }>(
      `/chats/conversations/${encodeURIComponent(id)}/messages`,
      { text },
    ),
  operators: () => get<{ operators: ChatOperator[] }>('/chats/operators'),
  scripts: () => get<{ scripts: ReplyScript[] }>('/chats/scripts'),
  createScript: (title: string, body: string) =>
    send<{ script: ReplyScript }>('/chats/scripts', { title, body }),
  updateScript: (id: number, title: string, body: string) =>
    send<{ script: ReplyScript }>(`/chats/scripts/${id}`, { title, body }, 'patch'),
  hideScript: (id: number) => send<{ ok: boolean }>(`/chats/scripts/${id}`, undefined, 'delete'),
};
