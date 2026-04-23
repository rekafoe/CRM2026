import { apiClient } from './client';

export interface MailConfigResponse {
  configured: boolean;
  host?: string;
  port?: number;
}

export interface MailStatsResponse {
  pending: number;
  failed: number;
  sent24h: number;
}

export interface OrderEmailRuleRow {
  id: number;
  to_status_id: number;
  email_template_id: number;
  is_active: number;
  status_name: string | null;
  template_slug: string | null;
}

export interface EmailTemplateRow {
  id: number;
  slug: string;
  name: string;
  subject_template: string;
  body_html_template: string;
  body_text_template: string | null;
  is_active: number;
  created_at: string;
}

export interface MailJobListRow {
  id: number;
  to_email: string;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  job_type: string;
  created_at: string;
  updated_at: string;
  first_opened_at: string | null;
  bounce_noted_at: string | null;
}

export async function fetchMailConfig(): Promise<MailConfigResponse> {
  const { data } = await apiClient.get<MailConfigResponse>('/mail/config');
  return data;
}

export async function fetchMailStats(): Promise<MailStatsResponse> {
  const { data } = await apiClient.get<MailStatsResponse>('/mail/stats');
  return data;
}

export async function fetchOrderEmailRules(): Promise<{ rules: OrderEmailRuleRow[] }> {
  const { data } = await apiClient.get<{ rules: OrderEmailRuleRow[] }>('/mail/order-email-rules');
  return data;
}

export async function fetchOrderEmailTemplates(): Promise<{ templates: EmailTemplateRow[] }> {
  const { data } = await apiClient.get<{ templates: EmailTemplateRow[] }>('/mail/order-templates');
  return data;
}

export async function patchOrderEmailRule(
  id: number,
  isActive: boolean
): Promise<void> {
  await apiClient.patch(`/mail/order-email-rules/${id}`, { is_active: isActive });
}

export async function fetchMailJobsByOrder(
  orderId: number,
  limit = 30
): Promise<{ jobs: MailJobListRow[] }> {
  const { data } = await apiClient.get<{ jobs: MailJobListRow[] }>('/mail/jobs', {
    params: { orderId, limit },
  });
  return data;
}

export async function postMailJobBounce(jobId: number): Promise<{ ok: boolean; id: number }> {
  const { data } = await apiClient.post<{ ok: boolean; id: number }>(`/mail/jobs/${jobId}/bounce`);
  return data;
}

export async function postMailTest(to: string, subject?: string): Promise<unknown> {
  const { data } = await apiClient.post('/mail/test', { to, subject });
  return data;
}
