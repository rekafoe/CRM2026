import { useState, useCallback } from 'react'
import { CostCalculationResult, CostCalculationParams } from '../types/costCalculation'

export const useCostCalculation = () => {
  const [result, setResult] = useState<CostCalculationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculateCost = useCallback(async (params: CostCalculationParams) => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('crmToken') || 'admin-token-123'

      const response = await fetch('/api/cost-calculation/calculate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      })

      if (!response.ok) {
        throw new Error('Ошибка расчета себестоимости')
      }

      const data = await response.json()
      console.log('Получены данные от сервера:', data)
      setResult(data.data)
      
      console.log('Себестоимость рассчитана', { 
        ...params,
        totalCost: data.data?.breakdown?.totalCost,
        profit: data.data?.breakdown?.profit
      })

      return data.data
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка расчета себестоимости', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const analyzeProfitability = useCallback(async (params: Omit<CostCalculationParams, 'specifications'>) => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('crmToken') || 'admin-token-123'

      const response = await fetch('/api/cost-calculation/profitability', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      })

      if (!response.ok) {
        throw new Error('Ошибка анализа прибыльности')
      }

      const data = await response.json()
      console.log('Анализ прибыльности завершен', data.data)
      
      return data.data
    } catch (err: any) {
      setError(err.message)
      console.error('Ошибка анализа прибыльности', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    result,
    loading,
    error,
    calculateCost,
    analyzeProfitability,
    reset
  }
}
