import React, { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../Toast'
import {
  createCampaignTemplate,
  fetchCampaignTemplates,
  type CampaignChannel,
  type CampaignTemplateRow,
  updateCampaignTemplate,
} from '../../../api/campaignApi'

export const CampaignTemplateManager: React.FC = () => {
  const { addToast } = useToast()
  const [templates, setTemplates] = useState<CampaignTemplateRow[]>([])
  const [selected, setSelected] = useState<CampaignTemplateRow | null>(null)
  const [form, setForm] = useState({
    channel: 'email' as CampaignChannel,
    slug: '',
    name: '',
    subject_template: '',
    body_template: '',
    body_html_template: '',
    variables_json: '["message","customerName"]',
    is_active: true,
  })

  const load = useCallback(async () => {
    const result = await fetchCampaignTemplates()
    setTemplates(result.templates || [])
  }, [])

  useEffect(() => {
    void load().catch((e) => {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось загрузить шаблоны' })
    })
  }, [addToast, load])

  useEffect(() => {
    if (!selected) {
      setForm({
        channel: 'email',
        slug: '',
        name: '',
        subject_template: '',
        body_template: '',
        body_html_template: '',
        variables_json: '["message","customerName"]',
        is_active: true,
      })
      return
    }
    setForm({
      channel: selected.channel,
      slug: selected.slug,
      name: selected.name,
      subject_template: selected.subject_template || '',
      body_template: selected.body_template || '',
      body_html_template: selected.body_html_template || '',
      variables_json: selected.variables_json || '[]',
      is_active: Boolean(selected.is_active),
    })
  }, [selected])

  const save = async () => {
    try {
      const payload = {
        ...form,
        subject_template: form.subject_template || null,
        body_html_template: form.body_html_template || null,
        variables_json: form.variables_json || null,
      }
      if (selected) await updateCampaignTemplate(selected.id, payload)
      else await createCampaignTemplate(payload)
      await load()
      addToast({ type: 'success', title: 'Шаблон сохранён' })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось сохранить шаблон' })
    }
  }

  return (
    <div className="campaign-layout">
      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>Шаблоны кампаний</h4>
          <button type="button" className="btn btn-primary" onClick={() => setSelected(null)}>
            Новый шаблон
          </button>
        </div>
        <div className="campaign-list">
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`campaign-list__item ${selected?.id === item.id ? 'active' : ''}`}
              onClick={() => setSelected(item)}
            >
              <strong>{item.name}</strong>
              <span>{item.channel} · {item.slug}</span>
              <small>{item.is_active ? 'Активен' : 'Выключен'}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>{selected ? `Шаблон #${selected.id}` : 'Новый шаблон'}</h4>
        </div>
        <div className="campaign-form-grid">
          <label>
            Канал
            <select value={form.channel} onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value as CampaignChannel }))}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="telegram">Telegram</option>
            </select>
          </label>
          <label>
            Slug
            <input value={form.slug} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} />
          </label>
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Тема (email)
            <input value={form.subject_template} onChange={(e) => setForm((prev) => ({ ...prev, subject_template: e.target.value }))} />
          </label>
        </div>
        <textarea className="campaign-textarea" rows={6} value={form.body_template} onChange={(e) => setForm((prev) => ({ ...prev, body_template: e.target.value }))} placeholder="Текст шаблона" />
        <textarea className="campaign-textarea" rows={6} value={form.body_html_template} onChange={(e) => setForm((prev) => ({ ...prev, body_html_template: e.target.value }))} placeholder="HTML шаблон (для email)" />
        <textarea className="campaign-textarea" rows={3} value={form.variables_json} onChange={(e) => setForm((prev) => ({ ...prev, variables_json: e.target.value }))} placeholder='["message","customerName"]' />
        <label className="campaign-checkbox">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
          Шаблон активен
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          Сохранить шаблон
        </button>
      </div>
    </div>
  )
}
