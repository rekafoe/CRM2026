import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../../Toast'
import type { CampaignRow, CampaignSegmentRow, CampaignTemplateRow } from '../../../api/campaignApi'
import { estimateCampaign, runCampaign, testCampaign } from '../../../api/campaignApi'

interface CampaignEditorProps {
  campaign: CampaignRow | null
  templates: CampaignTemplateRow[]
  segments: CampaignSegmentRow[]
  onSave: (payload: Record<string, unknown>, id?: number) => Promise<void>
}

export const CampaignEditor: React.FC<CampaignEditorProps> = ({ campaign, templates, segments, onSave }) => {
  const { addToast } = useToast()
  const [form, setForm] = useState({
    name: '',
    channel: 'email',
    kind: 'marketing',
    template_id: '',
    segment_id: '',
    scheduled_at: '',
    subject: '',
    message: '',
  })
  const [testDestinations, setTestDestinations] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setForm({
      name: campaign?.name || '',
      channel: campaign?.channel || 'email',
      kind: campaign?.kind || 'marketing',
      template_id: campaign?.template_id ? String(campaign.template_id) : '',
      segment_id: campaign?.segment_id ? String(campaign.segment_id) : '',
      scheduled_at: campaign?.scheduled_at ? String(campaign.scheduled_at).slice(0, 16) : '',
      subject: String(campaign?.settings?.subject || ''),
      message: String(campaign?.settings?.message || ''),
    })
  }, [campaign])

  const filteredTemplates = useMemo(
    () => templates.filter((item) => item.channel === form.channel),
    [templates, form.channel]
  )
  const filteredSegments = useMemo(
    () => segments.filter((item) => item.channel_scope === 'all' || item.channel_scope === form.channel),
    [segments, form.channel]
  )

  const save = async () => {
    setBusy('save')
    try {
      await onSave({
        name: form.name.trim(),
        channel: form.channel,
        kind: form.kind,
        template_id: Number(form.template_id),
        segment_id: Number(form.segment_id),
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 19).replace('T', ' ') : null,
        settings_json: JSON.stringify({
          subject: form.subject,
          message: form.message,
        }),
      }, campaign?.id)
      addToast({ type: 'success', title: 'Кампания сохранена' })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось сохранить кампанию' })
    } finally {
      setBusy(null)
    }
  }

  const estimate = async () => {
    if (!campaign?.id) {
      addToast({ type: 'warning', title: 'Сначала сохраните кампанию' })
      return
    }
    setBusy('estimate')
    try {
      const result = await estimateCampaign(campaign.id)
      addToast({ type: 'info', title: 'Оценка сегмента', message: `Получателей: ${result.count}` })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось оценить сегмент' })
    } finally {
      setBusy(null)
    }
  }

  const run = async () => {
    if (!campaign?.id) return
    setBusy('run')
    try {
      const result = await runCampaign(campaign.id)
      addToast({
        type: 'success',
        title: campaign.scheduled_at ? 'Кампания запланирована' : 'Запуск создан',
        message: result.runId ? `Run #${result.runId}` : result.status || 'ok',
      })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось запустить кампанию' })
    } finally {
      setBusy(null)
    }
  }

  const sendTest = async () => {
    if (!campaign?.id) {
      addToast({ type: 'warning', title: 'Сначала сохраните кампанию' })
      return
    }
    const destinations = testDestinations
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (destinations.length === 0) {
      addToast({ type: 'warning', title: 'Укажите тестовые адреса / номера / chat_id' })
      return
    }
    setBusy('test')
    try {
      const result = await testCampaign(campaign.id, { destinations, message: testMessage.trim() || undefined })
      addToast({ type: 'success', title: 'Тестовая отправка создана', message: `Run #${result.runId}` })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось создать тестовый запуск' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="campaign-card">
      <div className="campaign-card__header">
        <h4>{campaign ? `Кампания #${campaign.id}` : 'Новая кампания'}</h4>
      </div>
      <div className="campaign-form-grid">
        <label>
          Название
          <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
        </label>
        <label>
          Канал
          <select value={form.channel} onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value, template_id: '', segment_id: '' }))}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="telegram">Telegram</option>
          </select>
        </label>
        <label>
          Тип
          <select value={form.kind} onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}>
            <option value="marketing">Marketing</option>
            <option value="transactional_manual">Transactional manual</option>
          </select>
        </label>
        <label>
          Шаблон
          <select value={form.template_id} onChange={(e) => setForm((prev) => ({ ...prev, template_id: e.target.value }))}>
            <option value="">Выберите шаблон</option>
            {filteredTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Сегмент
          <select value={form.segment_id} onChange={(e) => setForm((prev) => ({ ...prev, segment_id: e.target.value }))}>
            <option value="">Выберите сегмент</option>
            {filteredSegments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Запланировать на
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm((prev) => ({ ...prev, scheduled_at: e.target.value }))}
          />
        </label>
      </div>
      <textarea
        className="campaign-textarea"
        rows={2}
        value={form.subject}
        onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
        placeholder="Тема / заголовок кампании"
      />
      <textarea
        className="campaign-textarea"
        rows={6}
        value={form.message}
        onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
        placeholder="Основной текст кампании (доступен как {{message}})"
      />

      <div className="campaign-actions">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy === 'save'}>
          {busy === 'save' ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void estimate()} disabled={!campaign?.id || busy === 'estimate'}>
          Оценить сегмент
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void run()} disabled={!campaign?.id || busy === 'run'}>
          Запуск / планирование
        </button>
      </div>

      <div className="campaign-test-box">
        <h5>Тестовая отправка</h5>
        <textarea
          value={testDestinations}
          onChange={(e) => setTestDestinations(e.target.value)}
          placeholder="Email, телефон или Telegram chat_id. Можно списком."
          rows={3}
        />
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          placeholder="Необязательная тестовая подмена текста"
          rows={3}
        />
        <button type="button" className="btn btn-primary" onClick={() => void sendTest()} disabled={!campaign?.id || busy === 'test'}>
          {busy === 'test' ? 'Отправка...' : 'Тестовый запуск'}
        </button>
      </div>
    </div>
  )
}
