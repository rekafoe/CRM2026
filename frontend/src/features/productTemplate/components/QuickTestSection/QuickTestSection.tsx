import React, { useState } from 'react'
import { MoneyAmount } from '../../../../components/ui'

interface ParamDef { name?: string; label?: string; type?: string; options?: any[]; min_value?: number }

interface QuickTestSectionProps {
  parameters: ParamDef[];
  qty: number;
  params: Record<string, any>;
  paramsJson: string;
  onChangeQty: (qty: number) => void;
  onChangeParams: (params: Record<string, any>) => void;
  onChangeJson: (json: string) => void;
  onCalculate: (payload: { qty: number; params: Record<string, any> }) => Promise<any> | any;
}

const QuickTestSection: React.FC<QuickTestSectionProps> = ({ parameters, qty, params, paramsJson, onChangeQty, onChangeParams, onChangeJson, onCalculate }) => {
  const [result, setResult] = useState<any | null>(null)
  
  return (
    <div className="form-section">
      <h3>Быстрый тест цены</h3>
      <div className="parameters-list">
        {parameters && parameters.length > 0 && (
          <div className="parameter-item">
            <div className="parameter-info"><h5>Параметры продукта</h5></div>
            <div className="parameters-list">
              {parameters.map((par, idx) => {
                const key = par.name || par.label || `p${idx}`
                const val = params[key as string]
                return (
                  <div key={key} className="parameter-item">
                    <div className="parameter-info"><h5>{par.label || par.name}</h5></div>
                    {par.type === 'select' && Array.isArray(par.options) ? (
                      <select className="form-select form-select--compact" value={val ?? ''} onChange={(e)=>{ const v=e.target.value; const next={...params,[key as string]:v}; onChangeParams(next) }}>
                        {(() => {
                          // 🆕 Для material_id группируем по типам бумаги
                          const isMaterialId = key === 'material_id';
                          
                          if (isMaterialId && par.options.length > 0 && typeof par.options[0] === 'object') {
                            // Группируем материалы по типу бумаги
                            const grouped = new Map<string, any[]>();
                            
                            par.options.forEach((opt: any) => {
                              // Извлекаем тип бумаги из label (например, "matt 300" → "matt", "gloss 250" → "gloss")
                              const label = opt.label || String(opt.value);
                              let groupName = 'Другие';
                              
                              if (label.includes('matt') || label.toLowerCase().includes('полумат')) {
                                groupName = 'Полуматовая';
                              } else if (label.includes('gloss') || label.toLowerCase().includes('мелованн')) {
                                groupName = 'Мелованная';
                              } else if (label.toLowerCase().includes('дизайнерск')) {
                                groupName = 'Дизайнерская';
                              } else if (label.toLowerCase().includes('офсет')) {
                                groupName = 'Офсетная';
                              }
                              
                              if (!grouped.has(groupName)) {
                                grouped.set(groupName, []);
                              }
                              grouped.get(groupName)!.push(opt);
                            });
                            
                            // Рендерим с группировкой
                            return (
                              <>
                                <option value="">-- Выберите материал --</option>
                                {Array.from(grouped.entries()).map(([groupName, opts]) => (
                                  <optgroup key={groupName} label={groupName}>
                                    {opts.map((opt: any, i: number) => (
                                      <option key={i} value={opt.value ?? opt}>
                                        {opt.label ?? opt.value}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </>
                            );
                          }
                          
                          // Обычный рендеринг для других параметров
                          return par.options.map((opt:any,i:number)=> (
                            <option key={i} value={typeof opt==='object'?(opt.value ?? opt):opt}>
                              {typeof opt==='object'?(opt.label ?? opt.value):String(opt)}
                            </option>
                          ));
                        })()}
                      </select>
                    ) : par.type === 'checkbox' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={!!val} 
                          onChange={(e)=>{ const v=e.target.checked; const next={...params,[key as string]:v}; onChangeParams(next) }}
                          style={{ width: 20, height: 20, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, color: '#64748b' }}>
                          {val ? 'Включено' : 'Выключено'}
                        </span>
                      </label>
                    ) : (par.type === 'number' || par.type === 'range') ? (
                      <input className="form-input form-input--compact" type="number" value={val ?? ''} onChange={(e)=>{ const v=e.target.value===''?'':Number(e.target.value); const next={...params,[key as string]:v}; onChangeParams(next) }} />
                    ) : (
                      <input className="form-input" value={val ?? ''} onChange={(e)=>{ const v=e.target.value; const next={...params,[key as string]:v}; onChangeParams(next) }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div className="parameter-item">
          <div className="parameter-info"><h5>Тираж</h5></div>
          <input className="form-input form-input--compact" type="number" value={qty} onChange={(e)=>onChangeQty(parseInt(e.target.value)||0)} />
        </div>
        <div className="parameter-item">
          <div className="parameter-info"><h5>Параметры (JSON)</h5></div>
          <textarea className="form-textarea" value={paramsJson} onChange={(e)=>onChangeJson(e.target.value)} rows={4} />
        </div>
        <div>
          <button className="btn-primary" onClick={async()=>{ const r = await onCalculate({ qty, params }); setResult(r); }}>Рассчитать</button>
        </div>
        {result && (
          <div className="parameter-item">
            <div className="parameter-info"><h5>Результат</h5></div>
            <div>
              {(() => { const d:any = (result as any)?.data ?? result; return (
                <>
                  <div><strong>Итого:</strong> <MoneyAmount value={d.price_total ?? d.finalPrice ?? d.total} /></div>
                  {d.pricePerUnit !== undefined && (<div><strong>Цена за шт.:</strong> <MoneyAmount value={d.pricePerUnit} /></div>)}
                  {(d.sheetsNeeded !== undefined || d.itemsPerSheet !== undefined || d.cutsPerSheet !== undefined || d.numberOfStacks !== undefined) && (
                    <div style={{marginTop:8, padding:8, backgroundColor:'#f0f0f0', borderRadius:4}}>
                      {d.sheetsNeeded !== undefined && (<div><strong>📄 Листов печати:</strong> {d.sheetsNeeded}</div>)}
                      {d.itemsPerSheet !== undefined && (<div><strong>📐 Укладка:</strong> {d.itemsPerSheet} шт/лист</div>)}
                      {d.cutsPerSheet !== undefined && (<div><strong>🔪 Резов на лист:</strong> {d.cutsPerSheet}</div>)}
                      {d.numberOfStacks !== undefined && d.numberOfStacks > 1 && (<div style={{color:'#d97706'}}><strong>📚 Стоп для резки:</strong> {d.numberOfStacks} (режем {d.cutsPerSheet}×{d.numberOfStacks}={d.cutsPerSheet * d.numberOfStacks} резов)</div>)}
                    </div>
                  )}
                </>
              )})()}
              {((result as any)?.data ?? result)?.materialPicked && (
                <div style={{marginTop:8}}>
                  {(() => { const d:any = (result as any).data ?? result; const mp=d.materialPicked; return (
                    <>
                      <div><strong>Материал:</strong> {mp.name} (#{mp.id})</div>
                      <div><strong>Листов:</strong> {mp.sheetsNeeded}, <strong>Укладка:</strong> {mp.itemsPerSheet}/лист</div>
                      <div><strong>Цена листа:</strong> {mp.price_per_sheet}</div>
                    </>
                  )})()}
                </div>
              )}
              {(() => { const d:any = (result as any).data ?? result; return Array.isArray(d?.breakdown?.materials) && d.breakdown.materials.length > 0 })() && (
                <div style={{marginTop:8}}>
                  <div><strong>Материалы (детализация):</strong></div>
                  <ul>
                    {(() => { const d:any = (result as any).data ?? result; return d.breakdown.materials })().map((m:any,i:number)=>(
                      <li key={i}>{m.name}: {m.quantity}×{m.rate} = {m.total}</li>
                    ))}
                  </ul>
                </div>
              )}
              {((result as any)?.data ?? result)?.resolverDetails && (
                <div style={{marginTop:8}}>
                  <div><strong>Кандидаты:</strong></div>
                  <ul>
                    {(() => { const d:any = (result as any).data ?? result; return d.resolverDetails.candidates || [] })().map((c:any)=> (
                      <li key={c.id}>#{c.id} {c.name} — {c.itemsPerSheet}/лист, листов: {c.sheetsNeeded}, {c.price_per_sheet}/лист</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickTestSection


