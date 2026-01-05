import React, { useMemo, useState } from 'react'
import QuickTestSection from '../../productTemplate/components/QuickTestSection/QuickTestSection'
import { calculatePrice } from '../../../services/pricing'

const PricingQuickTest: React.FC = () => {
  const [productId, setProductId] = useState<string>('')
  const [qty, setQty] = useState<number>(100)
  const [params, setParams] = useState<Record<string, any>>({})
  const [paramsJson, setParamsJson] = useState<string>('{}')

  const parameters = useMemo(()=>[], [])

  const onCalculate = async ({ qty, params }: { qty: number; params: Record<string, any> }) => {
    try {
      const pid = Number(productId)
      const parsed = safeParse(paramsJson)
      const merged = { ...parsed, ...params }
      return await calculatePrice({ product_id: pid, quantity: qty, params: merged, channel: 'online' })
    } catch (e:any) {
      console.error(e)
      alert(e?.response?.data?.message || e?.message || 'Ошибка расчёта')
      return null
    }
  }

  return (
    <div className="form-section">
      <h3>QuickTest (PricingService)</h3>
      <div className="parameters-list">
        <div className="parameter-item">
          <div className="parameter-info"><h5>Product ID</h5></div>
          <input className="form-input" value={productId} onChange={(e)=> setProductId(e.target.value)} placeholder="Напр. 18" />
        </div>
      </div>
      <QuickTestSection
        parameters={parameters}
        qty={qty}
        params={params}
        paramsJson={paramsJson}
        onChangeQty={setQty}
        onChangeParams={setParams}
        onChangeJson={setParamsJson}
        onCalculate={onCalculate}
      />
    </div>
  )
}

function safeParse(s: string): Record<string, any> {
  try { const o = JSON.parse(s || '{}'); return typeof o === 'object' && o ? o : {} } catch { return {} }
}

export default PricingQuickTest


