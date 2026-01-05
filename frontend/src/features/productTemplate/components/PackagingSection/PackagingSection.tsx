import React, { useState } from 'react'

interface PackagingSectionProps {
  items: Array<{ name: string }>
  saving: boolean
  onChange: (items: Array<{ name: string }>) => void
  onSave: () => Promise<void> | void
}

const PackagingSection: React.FC<PackagingSectionProps> = ({ items, saving, onChange, onSave }) => {
  const [newName, setNewName] = useState('')

  return (
    <div className="form-section">
      <h3>Упаковка</h3>
      <div className="parameters-list">
        {items.map((p, idx) => (
          <div key={idx} className="parameter-item">
            <div className="parameter-info"><h5>{p.name}</h5></div>
            <div style={{ display:'flex', gap: 10 }}>
              <button className="btn-quick-action" onClick={()=> onChange(items.filter((_,i)=>i!==idx))}>Удалить</button>
            </div>
          </div>
        ))}
        <div className="parameter-item">
          <div className="parameter-info"><h5>Добавить упаковку</h5></div>
          <div className="range-inputs">
            <input className="form-input" placeholder="Название упаковки" value={newName} onChange={(e)=>setNewName(e.target.value)} />
            <button className="btn-primary" disabled={!newName.trim()} onClick={()=>{ onChange([...items, { name: newName.trim() }]); setNewName(''); }}>Добавить</button>
            <button className="btn-primary" disabled={saving} onClick={()=>void onSave()}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PackagingSection


