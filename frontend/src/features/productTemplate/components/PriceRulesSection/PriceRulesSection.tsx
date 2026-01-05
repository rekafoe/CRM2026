import React, { useState } from 'react'

export interface PriceRule {
  min_qty: number;
  max_qty?: number;
  unit_price?: number;
  discount_percent?: number;
}

interface PriceRulesSectionProps {
  rules: PriceRule[];
  saving: boolean;
  onChangeRule: (index: number, patch: Partial<PriceRule>) => void;
  onRemoveRule: (index: number) => void;
  onSave: () => void;
}

const PriceRulesSection: React.FC<PriceRulesSectionProps> = ({
  rules,
  saving,
  onChangeRule,
  onRemoveRule,
  onSave
}) => {
  const [newRule, setNewRule] = useState<{ min_qty: number | ''; max_qty: number | ''; unit_price: number | ''; discount_percent: number | ''}>({ min_qty: '', max_qty: '', unit_price: '', discount_percent: '' })
  return (
    <div className="form-section">
      <h3>Диапазоны и правила цены</h3>
      <div className="parameters-list">
        {rules.length === 0 && <p>Пока правил нет.</p>}
        {rules.map((r, idx) => (
          <div key={idx} className="parameter-item">
            <div className="parameter-info"><h5>Правило #{idx+1}</h5></div>
            <div className="range-inputs">
              <input className="form-input" type="number" placeholder="Мин. тираж" value={r.min_qty} onChange={(e)=> onChangeRule(idx, { min_qty: Number(e.target.value)||0 })} />
              <input className="form-input" type="number" placeholder="Макс. тираж (опц.)" value={r.max_qty ?? ''} onChange={(e)=> onChangeRule(idx, { max_qty: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <input className="form-input" type="number" step="0.01" placeholder="Цена за ед. (опц.)" value={r.unit_price ?? ''} onChange={(e)=> onChangeRule(idx, { unit_price: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <input className="form-input" type="number" step="0.1" placeholder="Скидка % (опц.)" value={r.discount_percent ?? ''} onChange={(e)=> onChangeRule(idx, { discount_percent: e.target.value === '' ? undefined : Number(e.target.value) })} />
              <button className="btn-quick-action" onClick={()=> onRemoveRule(idx)}>Удалить</button>
            </div>
          </div>
        ))}

        <div className="parameter-item">
          <div className="parameter-info"><h5>Добавить правило</h5></div>
          <div className="range-inputs">
            <input className="form-input" type="number" placeholder="Мин. тираж" value={newRule.min_qty} onChange={(e)=> setNewRule(s=>({ ...s, min_qty: e.target.value === '' ? '' : Number(e.target.value) }))} />
            <input className="form-input" type="number" placeholder="Макс. тираж (опц.)" value={newRule.max_qty} onChange={(e)=> setNewRule(s=>({ ...s, max_qty: e.target.value === '' ? '' : Number(e.target.value) }))} />
            <input className="form-input" type="number" step="0.01" placeholder="Цена за ед. (опц.)" value={newRule.unit_price} onChange={(e)=> setNewRule(s=>({ ...s, unit_price: e.target.value === '' ? '' : Number(e.target.value) }))} />
            <input className="form-input" type="number" step="0.1" placeholder="Скидка % (опц.)" value={newRule.discount_percent} onChange={(e)=> setNewRule(s=>({ ...s, discount_percent: e.target.value === '' ? '' : Number(e.target.value) }))} />
            <button className="btn-primary" disabled={newRule.min_qty === ''} onClick={()=>{
              const r: PriceRule = {
                min_qty: Number(newRule.min_qty)||0,
                max_qty: newRule.max_qty === '' ? undefined : Number(newRule.max_qty),
                unit_price: newRule.unit_price === '' ? undefined : Number(newRule.unit_price),
                discount_percent: newRule.discount_percent === '' ? undefined : Number(newRule.discount_percent)
              }
              ;(onChangeRule as (index: number, patch: PriceRule)=>void)(-1, r)
              setNewRule({ min_qty: '', max_qty: '', unit_price: '', discount_percent: '' })
            }}>Добавить</button>
            <button className="btn-primary" disabled={saving} onClick={onSave}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PriceRulesSection


