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

      <div className="campaign-manager__tabs" role="tablist">
        {([
          ['campaigns', 'Кампании'],
          ['templates', 'Шаблоны'],
          ['segments', 'Сегменты'],
          ['runs', 'Журнал'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`lg-btn${tab === id ? ' lg-btn--primary' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
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
