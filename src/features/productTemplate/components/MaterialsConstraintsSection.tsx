import React from 'react'

const MaterialsConstraintsSection: React.FC<{
  allowedCategoriesCsv: string
  densityMin: string
  densityMax: string
  finishesCsv: string
  onlyPaper: boolean
  saving: boolean
  onChange: (patch: Partial<{ allowedCategoriesCsv: string; densityMin: string; densityMax: string; finishesCsv: string; onlyPaper: boolean }>) => void
  onSave: () => Promise<void> | void
}> = ({ allowedCategoriesCsv, densityMin, densityMax, finishesCsv, onlyPaper, saving, onChange, onSave }) => {
  return (
    <div className="form-section">
      <h3>Ограничения материалов</h3>
      <div className="parameters-list">
        <div className="parameter-item">
          <div className="parameter-info"><h5>Только бумага</h5></div>
          <input type="checkbox" checked={onlyPaper} onChange={(e)=> onChange({ onlyPaper: e.target.checked })} />
        </div>
        <div className="parameter-item">
          <div className="parameter-info"><h5>Категории</h5><div className="parameter-description">CSV, например: Бумага,Картон,Пленка</div></div>
          <input className="form-input" value={allowedCategoriesCsv} onChange={(e)=> onChange({ allowedCategoriesCsv: e.target.value })} placeholder="категория1,категория2" disabled={onlyPaper} />
        </div>
        <div className="parameter-item">
          <div className="parameter-info"><h5>Плотность (г/м²)</h5></div>
          <div className="flex gap-2">
            <input className="form-input" style={{ width: 140 }} type="number" value={densityMin} onChange={(e)=> onChange({ densityMin: e.target.value })} placeholder="мин" />
            <input className="form-input" style={{ width: 140 }} type="number" value={densityMax} onChange={(e)=> onChange({ densityMax: e.target.value })} placeholder="макс" />
          </div>
        </div>
        <div className="parameter-item">
          <div className="parameter-info"><h5>Финиши</h5><div className="parameter-description">CSV, например: Матовая,Глянцевая</div></div>
          <input className="form-input" value={finishesCsv} onChange={(e)=> onChange({ finishesCsv: e.target.value })} placeholder="финиш1,финиш2" />
        </div>
        <div>
          <button className="btn-primary" disabled={saving} onClick={()=> onSave()}>Сохранить ограничения</button>
        </div>
      </div>
    </div>
  )
}

export default MaterialsConstraintsSection


