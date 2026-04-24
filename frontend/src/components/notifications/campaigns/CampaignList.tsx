import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../../Toast'
import {
  createCampaign,
  fetchCampaigns,
  fetchCampaignSegments,
  fetchCampaignTemplates,
  type CampaignRow,
  type CampaignSegmentRow,
  type CampaignTemplateRow,
  updateCampaign,
} from '../../../api/campaignApi'
import { CampaignEditor } from './CampaignEditor'

export const CampaignList: React.FC = () => {
  const { addToast } = useToast()
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [templates, setTemplates] = useState<CampaignTemplateRow[]>([])
  const [segments, setSegments] = useState<CampaignSegmentRow[]>([])
  const [selectedId, setSelectedId] = useState<number | 'new'>('new')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [campaignsRes, templatesRes, segmentsRes] = await Promise.all([
        fetchCampaigns({ channel: filterChannel || undefined, status: filterStatus || undefined }),
        fetchCampaignTemplates(),
        fetchCampaignSegments(),
      ])
      setCampaigns(campaignsRes.campaigns || [])
      setTemplates(templatesRes.templates || [])
      setSegments(segmentsRes.segments || [])
      setSelectedId((prev) => (prev === 'new' ? 'new' : campaignsRes.campaigns.some((x) => x.id === prev) ? prev : 'new'))
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось загрузить кампании' })
    } finally {
      setLoading(false)
    }
  }, [addToast, filterChannel, filterStatus])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => campaigns.find((item) => item.id === selectedId) || null,
    [campaigns, selectedId]
  )

  const saveCampaign = async (payload: Record<string, unknown>, id?: number) => {
    const saved = id ? await updateCampaign(id, payload) : await createCampaign(payload)
    await load()
    setSelectedId(saved.id)
  }

  return (
    <div className="campaign-layout">
      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>Кампании</h4>
          <button type="button" className="btn btn-primary" onClick={() => setSelectedId('new')}>
            Новая кампания
          </button>
        </div>
        <div className="campaign-filters">
          <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
            <option value="">Все каналы</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="telegram">Telegram</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {loading ? (
          <p className="campaign-muted">Загрузка...</p>
        ) : (
          <div className="campaign-list">
            {campaigns.length === 0 ? (
              <p className="campaign-muted">Пока нет кампаний</p>
            ) : (
              campaigns.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`campaign-list__item ${selectedId === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.channel} · {item.status}</span>
                  <small>{item.template_name || item.template_slug || 'Без шаблона'}</small>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <CampaignEditor
        campaign={selected}
        templates={templates}
        segments={segments}
        onSave={saveCampaign}
      />
    </div>
  )
}
