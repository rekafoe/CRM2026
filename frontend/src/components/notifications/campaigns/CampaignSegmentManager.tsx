import React, { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../Toast'
import {
  createCampaignSegment,
  estimateSegment,
  fetchCampaignSegments,
  type CampaignChannel,
  type CampaignSegmentRow,
  updateCampaignSegment,
} from '../../../api/campaignApi'

export const CampaignSegmentManager: React.FC = () => {
  const { addToast } = useToast()
  const [segments, setSegments] = useState<CampaignSegmentRow[]>([])
  const [selected, setSelected] = useState<CampaignSegmentRow | null>(null)
  const [form, setForm] = useState({
    name: '',
    channel_scope: 'email' as CampaignChannel | 'all',
    filters_json: JSON.stringify({ requireMarketingOptIn: true, hasEmail: true, customerType: 'any' }, null, 2),
  })

  const load = useCallback(async () => {
    const result = await fetchCampaignSegments()
    setSegments(result.segments || [])
  }, [])

  useEffect(() => {
    void load().catch((e) => {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось загрузить сегменты' })
    })
  }, [addToast, load])

  useEffect(() => {
    if (!selected) {
      setForm({
        name: '',
        channel_scope: 'email',
        filters_json: JSON.stringify({ requireMarketingOptIn: true, hasEmail: true, customerType: 'any' }, null, 2),
      })
      return
    }
    setForm({
      name: selected.name,
      channel_scope: selected.channel_scope,
      filters_json: selected.filters_json,
    })
  }, [selected])

  const save = async () => {
    try {
      const payload = {
        name: form.name,
        channel_scope: form.channel_scope,
        filters_json: form.filters_json,
      }
      if (selected) await updateCampaignSegment(selected.id, payload)
      else await createCampaignSegment(payload)
      await load()
      addToast({ type: 'success', title: 'Сегмент сохранён' })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось сохранить сегмент' })
    }
  }

  const estimate = async () => {
    if (!selected) {
      addToast({ type: 'warning', title: 'Выберите сохранённый сегмент' })
      return
    }
    try {
      const result = await estimateSegment(selected.id, (selected.channel_scope === 'all' ? 'email' : selected.channel_scope) as CampaignChannel)
      addToast({ type: 'info', title: 'Оценка сегмента', message: `Получателей: ${result.count}` })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось оценить сегмент' })
    }
  }

  return (
    <div className="campaign-layout">
      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>Сегменты</h4>
          <button type="button" className="btn btn-primary" onClick={() => setSelected(null)}>
            Новый сегмент
          </button>
        </div>
        <div className="campaign-list">
          {segments.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`campaign-list__item ${selected?.id === item.id ? 'active' : ''}`}
              onClick={() => setSelected(item)}
            >
              <strong>{item.name}</strong>
              <span>{item.channel_scope}</span>
              <small>cache: {item.estimated_count_cache ?? '—'}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>{selected ? `Сегмент #${selected.id}` : 'Новый сегмент'}</h4>
        </div>
        <div className="campaign-form-grid">
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Область канала
            <select value={form.channel_scope} onChange={(e) => setForm((prev) => ({ ...prev, channel_scope: e.target.value as CampaignChannel | 'all' }))}>
              <option value="all">all</option>
              <option value="email">email</option>
              <option value="sms">sms</option>
              <option value="telegram">telegram</option>
            </select>
          </label>
        </div>
        <textarea
          className="campaign-textarea"
          rows={14}
          value={form.filters_json}
          onChange={(e) => setForm((prev) => ({ ...prev, filters_json: e.target.value }))}
        />
        <div className="campaign-actions">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Сохранить сегмент
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void estimate()}>
            Оценить
          </button>
        </div>
      </div>
    </div>
  )
}
