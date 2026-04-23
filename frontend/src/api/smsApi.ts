import { apiClient } from './client';

export interface SmsConfigResponse {
  enabled: boolean;
  debounceSeconds: number;
}

export interface OrderSmsRuleRow {
  id: number;
  to_status_id: number;
  sms_template_id: number;
  is_active: number;
  status_name: string | null;
  template_slug: string | null;
}

export interface SmsTemplateRow {
  id: number;
  slug: string;
  name: string;
  body_template: string;
  is_active: number;
  created_at: string;
}

export async function fetchSmsConfig(): Promise<SmsConfigResponse> {
  const { data } = await apiClient.get<SmsConfigResponse>('/sms/config');
  return data;
}

export async function fetchOrderSmsRules(): Promise<{ rules: OrderSmsRuleRow[] }> {
  const { data } = await apiClient.get<{ rules: OrderSmsRuleRow[] }>('/sms/order-rules');
  return data;
}

export async function fetchSmsTemplates(): Promise<{ templates: SmsTemplateRow[] }> {
  const { data } = await apiClient.get<{ templates: SmsTemplateRow[] }>('/sms/templates');
  return data;
}

export async function patchOrderSmsRule(id: number, isActive: boolean): Promise<void> {
  await apiClient.patch(`/sms/order-rules/${id}`, { is_active: isActive });
}

export async function postOrderManualSms(
  orderId: number,
  body: { templateId?: number; body?: string }
): Promise<{ ok: true; channel: string }> {
  const { data } = await apiClient.post<{ ok: true; channel: string }>(`/orders/${orderId}/sms`, body);
  return data;
}
