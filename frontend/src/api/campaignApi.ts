import { apiClient } from './client'

export type CampaignChannel = 'email' | 'sms' | 'telegram'
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface CampaignTemplateRow {
  id: number
  channel: CampaignChannel
  slug: string
  name: string
  subject_template: string | null
  body_template: string
  body_html_template: string | null
  variables_json: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface CampaignSegmentRow {
  id: number
  name: string
  channel_scope: CampaignChannel | 'all'
  filters_json: string
  estimated_count_cache: number | null
  created_at: string
  updated_at: string
}

export interface CampaignRow {
  id: number
  name: string
  channel: CampaignChannel
  kind: 'marketing' | 'transactional_manual'
  status: CampaignStatus
  template_id: number
  segment_id: number
  created_by: number | null
  scheduled_at: string | null
  settings_json: string | null
  settings?: Record<string, unknown>
  created_at: string
  updated_at: string
  template_name?: string
  template_slug?: string
  segment_name?: string
}

export interface CampaignRunRow {
  id: number
  campaign_id: number
  campaign_name: string
  channel: CampaignChannel
  mode: 'test' | 'live'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string | null
  finished_at: string | null
  stats?: Record<string, number>
  error_text?: string | null
  created_at: string
}

export interface CampaignRecipientRow {
  id: number
  destination: string
  delivery_status: string
  effective_status: string
  provider_message_id: string | null
  error_text: string | null
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function fetchCampaigns(params?: { channel?: string; status?: string }): Promise<{ campaigns: CampaignRow[] }> {
  const { data } = await apiClient.get('/campaigns', { params })
  return data
}

export async function fetchCampaign(id: number): Promise<CampaignRow & { runs: CampaignRunRow[] }> {
  const { data } = await apiClient.get(`/campaigns/${id}`)
  return data
}

export async function createCampaign(payload: Record<string, unknown>): Promise<CampaignRow> {
  const { data } = await apiClient.post('/campaigns', payload)
  return data
}

export async function updateCampaign(id: number, payload: Record<string, unknown>): Promise<CampaignRow> {
  const { data } = await apiClient.patch(`/campaigns/${id}`, payload)
  return data
}

export async function estimateCampaign(id: number): Promise<{ count: number }> {
  const { data } = await apiClient.post(`/campaigns/${id}/estimate`)
  return data
}

export async function runCampaign(id: number): Promise<{ ok: boolean; runId?: number; status?: string }> {
  const { data } = await apiClient.post(`/campaigns/${id}/run`)
  return data
}

export async function testCampaign(
  id: number,
  payload: { destinations: string[]; message?: string }
): Promise<{ ok: boolean; runId: number }> {
  const { data } = await apiClient.post(`/campaigns/${id}/test`, payload)
  return data
}

export async function fetchCampaignTemplates(channel?: string): Promise<{ templates: CampaignTemplateRow[] }> {
  const { data } = await apiClient.get('/campaigns/templates', { params: channel ? { channel } : undefined })
  return data
}

export async function createCampaignTemplate(payload: Record<string, unknown>): Promise<CampaignTemplateRow> {
  const { data } = await apiClient.post('/campaigns/templates', payload)
  return data
}

export async function updateCampaignTemplate(id: number, payload: Record<string, unknown>): Promise<CampaignTemplateRow> {
  const { data } = await apiClient.patch(`/campaigns/templates/${id}`, payload)
  return data
}

export async function fetchCampaignSegments(): Promise<{ segments: CampaignSegmentRow[] }> {
  const { data } = await apiClient.get('/campaigns/segments')
  return data
}

export async function createCampaignSegment(payload: Record<string, unknown>): Promise<CampaignSegmentRow> {
  const { data } = await apiClient.post('/campaigns/segments', payload)
  return data
}

export async function updateCampaignSegment(id: number, payload: Record<string, unknown>): Promise<CampaignSegmentRow> {
  const { data } = await apiClient.patch(`/campaigns/segments/${id}`, payload)
  return data
}

export async function estimateSegment(id: number, channel: CampaignChannel): Promise<{ count: number }> {
  const { data } = await apiClient.post(`/campaigns/segments/${id}/estimate`, { channel })
  return data
}

export async function fetchCampaignRuns(campaignId?: number): Promise<{ runs: CampaignRunRow[] }> {
  const { data } = await apiClient.get('/campaigns/runs', {
    params: campaignId ? { campaignId } : undefined,
  })
  return data
}

export async function fetchCampaignRun(id: number): Promise<CampaignRunRow & { stats: Record<string, number> }> {
  const { data } = await apiClient.get(`/campaigns/runs/${id}`)
  return data
}

export async function fetchCampaignRunRecipients(id: number): Promise<{ recipients: CampaignRecipientRow[] }> {
  const { data } = await apiClient.get(`/campaigns/runs/${id}/recipients`)
  return data
}

export async function cancelCampaignRun(id: number): Promise<{ ok: boolean }> {
  const { data } = await apiClient.post(`/campaigns/runs/${id}/cancel`)
  return data
}
