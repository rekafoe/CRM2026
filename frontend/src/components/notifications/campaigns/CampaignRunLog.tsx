import React, { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../Toast'
import {
  cancelCampaignRun,
  fetchCampaignRunRecipients,
  fetchCampaignRuns,
  type CampaignRecipientRow,
  type CampaignRunRow,
} from '../../../api/campaignApi'

export const CampaignRunLog: React.FC = () => {
  const { addToast } = useToast()
  const [runs, setRuns] = useState<CampaignRunRow[]>([])
  const [selectedRun, setSelectedRun] = useState<number | null>(null)
  const [recipients, setRecipients] = useState<CampaignRecipientRow[]>([])

  const loadRuns = useCallback(async () => {
    const result = await fetchCampaignRuns()
    setRuns(result.runs || [])
    setSelectedRun((prev) => (prev && result.runs.some((item) => item.id === prev) ? prev : result.runs[0]?.id ?? null))
  }, [])

  const loadRecipients = useCallback(async (runId: number) => {
    const result = await fetchCampaignRunRecipients(runId)
    setRecipients(result.recipients || [])
  }, [])

  useEffect(() => {
    void loadRuns().catch((e) => {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось загрузить журнал' })
    })
  }, [addToast, loadRuns])

  useEffect(() => {
    if (!selectedRun) return
    void loadRecipients(selectedRun).catch((e) => {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось загрузить получателей' })
    })
  }, [addToast, loadRecipients, selectedRun])

  const handleCancel = async () => {
    if (!selectedRun) return
    try {
      await cancelCampaignRun(selectedRun)
      await loadRuns()
      await loadRecipients(selectedRun)
      addToast({ type: 'success', title: 'Запуск отменён' })
    } catch (e) {
      addToast({ type: 'error', title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось отменить запуск' })
    }
  }

  return (
    <div className="campaign-layout">
      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>Запуски кампаний</h4>
          <button type="button" className="btn btn-secondary" onClick={() => void loadRuns()}>
            Обновить
          </button>
        </div>
        <div className="campaign-list">
          {runs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`campaign-list__item ${selectedRun === item.id ? 'active' : ''}`}
              onClick={() => setSelectedRun(item.id)}
            >
              <strong>{item.campaign_name}</strong>
              <span>{item.channel} · {item.mode} · {item.status}</span>
              <small>
                total: {item.stats?.total ?? 0} · sent: {item.stats?.sent ?? 0} · failed: {item.stats?.failed ?? 0}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="campaign-card">
        <div className="campaign-card__header">
          <h4>Получатели запуска</h4>
          <button type="button" className="btn btn-secondary" onClick={() => void handleCancel()} disabled={!selectedRun}>
            Отменить запуск
          </button>
        </div>
        <div className="campaign-table-wrap">
          <table className="campaign-table">
            <thead>
              <tr>
                <th>Назначение</th>
                <th>Статус</th>
                <th>Провайдер</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {recipients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="campaign-muted">Нет данных</td>
                </tr>
              ) : (
                recipients.map((item) => (
                  <tr key={item.id}>
                    <td>{item.destination}</td>
                    <td>{item.effective_status}</td>
                    <td>{item.provider_message_id || '—'}</td>
                    <td>{item.error_text || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
