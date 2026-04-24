import React, { useState } from 'react'
import { CampaignList } from './CampaignList'
import { CampaignRunLog } from './CampaignRunLog'
import { CampaignSegmentManager } from './CampaignSegmentManager'
import { CampaignTemplateManager } from './CampaignTemplateManager'
import './CampaignManagerPage.css'

type CampaignTab = 'campaigns' | 'templates' | 'segments' | 'runs'

export const CampaignManagerPage: React.FC = () => {
  const [tab, setTab] = useState<CampaignTab>('campaigns')

  return (
    <div className="campaign-manager">
      <div className="campaign-manager__hero">
        <h3>Менеджер рассылок</h3>
        <p>
          Единый центр кампаний для email, SMS и Telegram: шаблоны, сегменты, тестовые
          отправки, запуски и журнал доставки.
        </p>
      </div>

      <div className="campaign-manager__tabs">
        <button
          type="button"
          className={tab === 'campaigns' ? 'active' : ''}
          onClick={() => setTab('campaigns')}
        >
          Кампании
        </button>
        <button
          type="button"
          className={tab === 'templates' ? 'active' : ''}
          onClick={() => setTab('templates')}
        >
          Шаблоны
        </button>
        <button
          type="button"
          className={tab === 'segments' ? 'active' : ''}
          onClick={() => setTab('segments')}
        >
          Сегменты
        </button>
        <button
          type="button"
          className={tab === 'runs' ? 'active' : ''}
          onClick={() => setTab('runs')}
        >
          Журнал
        </button>
      </div>

      <div className="campaign-manager__content">
        {tab === 'campaigns' && <CampaignList />}
        {tab === 'templates' && <CampaignTemplateManager />}
        {tab === 'segments' && <CampaignSegmentManager />}
        {tab === 'runs' && <CampaignRunLog />}
      </div>
    </div>
  )
}
