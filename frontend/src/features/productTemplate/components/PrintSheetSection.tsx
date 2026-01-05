import React, { useMemo } from 'react'

type Preset = '' | 'SRA3' | 'A3' | 'А4'

export function getPresetSize(preset: Preset): { width: number; height: number } | null {
  switch (preset) {
    case 'SRA3': return { width: 320, height: 450 }
    case 'A3': return { width: 297, height: 420 }
    case 'А4': return { width: 210, height: 297 }
    default: return null
  }
}

export function computeItemsPerSheet(item: { width: number; height: number }, sheet: { width: number; height: number }): number {
  // Технические поля согласно layoutCalculationService
  const MARGINS = {
    bleed: 2,      // 2мм на подрезку (bleed)
    gap: 2,        // 2мм между элементами
    gripper: 5     // 5мм на захват (только по ширине)
  }

  // Доступная область с учетом gripper margin (только по ширине)
  // Не используем edge margins, так как они слишком строгие для некоторых размеров
  const availableWidth = sheet.width - MARGINS.gripper
  const availableHeight = sheet.height

  // Функция расчета для одной ориентации
  const calculateSingleLayout = (itemW: number, itemH: number): number => {
    // Шаг размещения: размер изделия + gap между элементами
    // Bleed уже учтен в размере изделия (trim size), поэтому не добавляем его к шагу
    const stepW = itemW + MARGINS.gap
    const stepH = itemH + MARGINS.gap

    const cols = Math.floor(availableWidth / stepW)
    const rows = Math.floor(availableHeight / stepH)

    // Проверяем, действительно ли помещается раскладка с учетом bleed для крайних элементов
    // Общая ширина: cols элементов + bleed слева (между gripper и первым элементом) и справа + небольшой запас
    // Общая высота: rows элементов + bleed сверху и снизу + небольшой запас
    const SAFETY_MARGIN = 3 // 3мм запас для надежности
    const totalWidth = cols * stepW - MARGINS.gap + 2 * MARGINS.bleed + SAFETY_MARGIN
    const totalHeight = rows * stepH - MARGINS.gap + 2 * MARGINS.bleed + SAFETY_MARGIN

    // Если раскладка не помещается с учетом bleed и запаса, уменьшаем количество
    if (totalWidth > availableWidth) {
      // Пробуем уменьшить количество столбцов
      const newCols = Math.floor((availableWidth - 2 * MARGINS.bleed - SAFETY_MARGIN) / stepW)
      if (newCols < cols && newCols > 0) {
        return newCols * rows
      }
      return 0
    }
    if (totalHeight > availableHeight) {
      // Пробуем уменьшить количество строк
      const newRows = Math.floor((availableHeight - 2 * MARGINS.bleed - SAFETY_MARGIN) / stepH)
      if (newRows < rows && newRows > 0) {
        return cols * newRows
      }
      return 0
    }

    return cols * rows
  }

  // Проверяем оба варианта: обычный и с поворотом на 90°
  const variant1 = calculateSingleLayout(item.width, item.height)
  const variant2 = calculateSingleLayout(item.height, item.width)

  // Если вариант без поворота дает больше элементов, но разница небольшая (<= 4),
  // и вариант с поворотом более надежен, выбираем вариант с поворотом
  // Это обеспечивает более консервативный и надежный расчет
  if (variant1 > variant2 && variant1 - variant2 <= 4 && variant2 > 0) {
    // Проверяем, насколько близок вариант без поворота к границе
    const stepW1 = item.width + MARGINS.gap
    const stepH1 = item.height + MARGINS.gap
    const cols1 = Math.floor(availableWidth / stepW1)
    const rows1 = Math.floor(availableHeight / stepH1)
    const totalWidth1 = cols1 * stepW1 - MARGINS.gap + 2 * MARGINS.bleed
    const totalHeight1 = rows1 * stepH1 - MARGINS.gap + 2 * MARGINS.bleed
    
    // Если вариант без поворота близок к границе (остается менее 15мм запаса), выбираем вариант с поворотом
    // Это обеспечивает более надежный расчет для случаев, когда раскладка близка к границе
    const widthMargin = availableWidth - totalWidth1
    const heightMargin = availableHeight - totalHeight1
    if (widthMargin < 15 || heightMargin < 15) {
      return variant2
    }
  }

  // Возвращаем вариант с большим количеством изделий
  return Math.max(variant1, variant2)
}

const presets: Preset[] = ['', 'SRA3', 'A3', 'А4']

const PrintSheetSection: React.FC<{
  preset: Preset
  width: string
  height: string
  trimWidth: string
  trimHeight: string
  saving: boolean
  onChange: (patch: Partial<{ preset: Preset; width: string; height: string }>) => void
  onSave: () => Promise<void> | void
}> = ({ preset, width, height, trimWidth, trimHeight, saving, onChange, onSave }) => {
  const sheet = useMemo(() => {
    const presetSize = getPresetSize(preset)
    const w = (presetSize?.width ?? Number(width)) || 0
    const h = (presetSize?.height ?? Number(height)) || 0
    return { width: w, height: h }
  }, [preset, width, height])

  const item = useMemo(() => ({ width: Number(trimWidth) || 0, height: Number(trimHeight) || 0 }), [trimWidth, trimHeight])
  const itemsPerSheet = useMemo(() => (sheet.width > 0 && sheet.height > 0 && item.width > 0 && item.height > 0) ? computeItemsPerSheet(item, sheet) : 0, [item, sheet])

  const errors = useMemo(() => {
    const e: string[] = []
    if ((item.width <= 0) || (item.height <= 0)) e.push('Обрезной формат должен быть > 0')
    if (preset === '' && ((Number(width) || 0) <= 0 || (Number(height) || 0) <= 0)) e.push('Размер листа (кастом) должен быть > 0')
    if (sheet.width > 0 && sheet.height > 0 && item.width > 0 && item.height > 0) {
      if (itemsPerSheet === 0) e.push('Изделие не помещается на выбранный лист')
    }
    return e
  }, [item, sheet, preset, width, height, itemsPerSheet])

  const usingPreset = preset !== ''

  return (
    <div className="form-section">
      <h3>Печатный лист</h3>
      <div className="parameters-list">
        <div className="parameter-item">
          <div className="parameter-info"><h5>Режим</h5></div>
          <div className="template-toggle-group">
            <button
              type="button"
              className={`template-toggle ${usingPreset ? 'template-toggle--active' : ''}`}
              onClick={() => onChange({ preset: preset || 'SRA3' })}
            >
              типовых листов
            </button>
            <button
              type="button"
              className={`template-toggle ${!usingPreset ? 'template-toggle--active' : ''}`}
              onClick={() => onChange({ preset: '' as Preset })}
            >
              индивидуальных листов
            </button>
          </div>
        </div>
        <div className="parameter-item">
          <div className="parameter-info"><h5>Пресет</h5></div>
          <select className="form-select" value={preset} onChange={(e)=> onChange({ preset: e.target.value as Preset })}>
            {presets.map((p, i) => <option key={i} value={p}>{p || '— кастом —'}</option>)}
          </select>
        </div>
        {preset === '' && (
          <>
            <div className="parameter-item">
              <div className="parameter-info"><h5>Ширина</h5></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="form-input" placeholder="Ширина" type="number" value={width} onChange={(e)=> onChange({ width: e.target.value })} />
                <span className="badge">мм</span>
              </div>
            </div>
            <div className="parameter-item">
              <div className="parameter-info"><h5>Высота</h5></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="form-input" placeholder="Высота" type="number" value={height} onChange={(e)=> onChange({ height: e.target.value })} />
                <span className="badge">мм</span>
              </div>
            </div>
            <div className="parameter-item">
              <div className="parameter-info" />
              <div style={{ color: '#c62828' }}>{(Number(width)||0)===0 || (Number(height)||0)===0 ? 'Укажите формат' : ''}</div>
            </div>
          </>
        )}
        
        <div className="parameter-item">
          <div className="parameter-info"><h5>Превью укладки</h5></div>
          <div>
            <div>Изделие: {item.width}×{item.height} мм</div>
            <div>Лист: {sheet.width}×{sheet.height} мм {preset ? `(preset: ${preset})` : ''}</div>
            <div><strong>Укладка:</strong> {itemsPerSheet > 0 ? `${itemsPerSheet} шт/лист` : '—'}</div>
            {errors.length > 0 && (
              <ul style={{ color: '#c62828', marginTop: 6 }}>
                {errors.map((msg, i) => (<li key={i}>{msg}</li>))}
              </ul>
            )}
          </div>
        </div>
        <div>
          <button className="btn-primary" disabled={saving || errors.length>0} onClick={()=> onSave()}>Сохранить лист</button>
        </div>
      </div>
    </div>
  )
}

export default PrintSheetSection


