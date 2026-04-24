export type CampaignChannel = 'email' | 'sms' | 'telegram'
export type CampaignKind = 'marketing' | 'transactional_manual'
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type CampaignRunMode = 'test' | 'live'
export type CampaignRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type CampaignDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'failed'
  | 'skipped'
  | 'unsubscribed'
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
  kind: CampaignKind
  status: CampaignStatus
  template_id: number
  segment_id: number
  created_by: number | null
  scheduled_at: string | null
  settings_json: string | null
  created_at: string
  updated_at: string
}

export interface CampaignRunRow {
  id: number
  campaign_id: number
  mode: CampaignRunMode
  status: CampaignRunStatus
  started_at: string | null
  finished_at: string | null
  stats_json: string | null
  error_text: string | null
  created_by: number | null
  created_at: string
}

export interface CampaignRunRecipientRow {
  id: number
  run_id: number
  customer_id: number | null
  telegram_user_id: number | null
  destination: string
  payload_json: string | null
  delivery_status: CampaignDeliveryStatus
  provider_message_id: string | null
  mail_job_id: number | null
  sms_log_id: number | null
  opened_at: string | null
  clicked_at: string | null
  error_text: string | null
  created_at: string
  updated_at: string
}

export interface CampaignSegmentFilters {
  requireMarketingOptIn?: boolean
  customerType?: 'individual' | 'legal' | 'any'
  hasEmail?: boolean
  hasPhone?: boolean
  telegramRole?: string
  customerIds?: number[]
  telegramUserIds?: number[]
  includeInactiveTelegramUsers?: boolean
  query?: string
}

export interface CampaignRecipientCandidate {
  channel: CampaignChannel
  customerId?: number | null
  telegramUserId?: number | null
  destination: string
  displayName: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  phone?: string
  telegramRole?: string
  unsubscribeToken?: string
}

export interface CampaignTemplateInput {
  channel: CampaignChannel
  slug: string
  name: string
  subject_template?: string | null
  body_template: string
  body_html_template?: string | null
  variables_json?: string | null
  is_active?: boolean
}

export interface CampaignSegmentInput {
  name: string
  channel_scope: CampaignChannel | 'all'
  filters_json: string
}

export interface CampaignInput {
  name: string
  channel: CampaignChannel
  kind: CampaignKind
  template_id: number
  segment_id: number
  scheduled_at?: string | null
  settings_json?: string | null
}
