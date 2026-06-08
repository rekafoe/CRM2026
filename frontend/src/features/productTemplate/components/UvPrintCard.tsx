import React, { useState } from 'react'
import { Button, FormField } from '../../../components/common'
import { useToastNotifications } from '../../../components/Toast'
import { api } from '../../../api'
import type { SimplifiedUvPrintConfig } from '../hooks/useProductTemplate'

const ALL_LAYERS = ['color', 'white', 'varnish'] as const
type LayerKey = (typeof ALL_LAYERS)[number]

const LAYER_LABELS: Record<LayerKey, string> = {
  color: 'Цвет',
  white: 'Белый',
  varnish: 'Лак',
}

interface UvPrintCardProps {
  config?: SimplifiedUvPrintConfig
  onChange: (next: SimplifiedUvPrintConfig | undefined) => void
}

export const UvPrintCard: React.FC<UvPrintCardProps> = ({ config, onChange }) => {
  const toast = useToastNotifications()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<{
    unit_price: number
    total_price: number
    min_charge_applied: boolean
    layers: Array<{ layer: string; cost: number }>
  } | null>(null)

  const enabled = config?.mode === 'flatbed_m2'
  const layers = config?.layers ?? ['color', 'white', 'varnish']

  const toggleEnabled = (on: boolean) => {
    if (!on) {
      onChange(undefined)
      setPreview(null)
      return
    }
    onChange({
      mode: 'flatbed_m2',
      layers: ['color', 'white', 'varnish'],
      default_passes: { color: 1, white: 1, varnish: 1 },
      dimensions_mode: 'custom_only',
    })
  }

  const update = (patch: Partial<SimplifiedUvPrintConfig>) => {
    if (!config) return
    onChange({ ...config, ...patch })
  }

  const toggleLayer = (layer: LayerKey, checked: boolean) => {
    const next = checked
      ? [...layers, layer].filter((v, i, a) => a.indexOf(v) === i)
      : layers.filter((l) => l !== layer)
    update({ layers: next as LayerKey[] })
  }

  const fetchCentralRates = async () => {
    setPreviewLoading(true)
    try {
      const res = await api.get('/pricing/print-prices/derive-m2', {
        params: {
          technology_code: 'uv',
          width_mm: 100,
          height_mm: 100,
          quantity: 1,
          uv_print: JSON.stringify({ color: { enabled: true, passes: 1 } }),
        },
      })
      setPreview({
        unit_price: res.data.unit_price,
        total_price: res.data.total_price,
        min_charge_applied: res.data.min_charge_applied,
        layers: res.data.layers ?? [],
      })
      toast.success('Ставки из центра загружены (превью 100×100 мм, цвет 1 проход)')
    } catch {
      toast.error('Не найдены центральные ставки УФ (counter_unit=m2). Настройте в разделе «Принтеры».')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="simplified-card">
      <div className="simplified-card__header">
        <div>
          <strong>УФ-планшет (цена за м²)</strong>
          <p className="text-muted text-sm">
            Произвольный размер, слои цвет / белый / лак. Ставки — из центра цен, не дублируются в шаблоне.
          </p>
        </div>
      </div>
      <div className="simplified-card__content simplified-form-grid">
        <FormField label="Режим УФ-планшета">
          <label className="checkbox-label">
            <input type="checkbox" checked={enabled} onChange={(e) => toggleEnabled(e.target.checked)} />
            Включить расчёт по м² (flatbed_m2)
          </label>
        </FormField>

        {enabled && config && (
          <>
            <FormField label="Режим размеров">
              <select
                className="form-input"
                value={config.dimensions_mode ?? 'custom_only'}
                onChange={(e) =>
                  update({
                    dimensions_mode: e.target.value as 'custom_only' | 'presets_and_custom',
                  })
                }
              >
                <option value="custom_only">Только произвольный W×H</option>
                <option value="presets_and_custom">Пресеты + произвольный размер</option>
              </select>
            </FormField>

            <FormField label="Слои для клиента">
              <div className="uv-template-layers">
                {ALL_LAYERS.map((layer) => (
                  <label key={layer} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={layers.includes(layer)}
                      onChange={(e) => toggleLayer(layer, e.target.checked)}
                    />
                    {LAYER_LABELS[layer]}
                  </label>
                ))}
              </div>
            </FormField>

            <FormField label="Проходов по умолчанию">
              <div className="uv-template-default-passes">
                {layers.map((layer) => (
                  <div key={layer} className="uv-template-pass-row">
                    <span>{LAYER_LABELS[layer as LayerKey]}</span>
                    <input
                      type="number"
                      className="form-input form-input--compact"
                      min={1}
                      max={5}
                      value={config.default_passes?.[layer as LayerKey] ?? 1}
                      onChange={(e) =>
                        update({
                          default_passes: {
                            ...config.default_passes,
                            [layer]: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </FormField>

            <div className="uv-template-actions">
              <Button variant="secondary" size="sm" onClick={fetchCentralRates} loading={previewLoading}>
                Подтянуть ставки из центра
              </Button>
            </div>

            {preview && (
              <div className="uv-template-preview text-sm">
                <div>Превью: {preview.unit_price} руб/шт (100×100, qty 1)</div>
                {preview.min_charge_applied && <div className="text-muted">Применён min_charge</div>}
                {preview.layers.map((l) => (
                  <div key={l.layer}>
                    {LAYER_LABELS[l.layer as LayerKey] ?? l.layer}: {l.cost} руб
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
