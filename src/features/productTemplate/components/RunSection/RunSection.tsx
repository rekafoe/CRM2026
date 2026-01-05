import React from 'react'

interface RunSectionProps {
  enabled: boolean;
  min: number | '';
  max: number | '';
  saving: boolean;
  onChange: (patch: { enabled?: boolean; min?: number | ''; max?: number | '' }) => void;
  onSave: () => Promise<void> | void;
}

const RunSection: React.FC<RunSectionProps> = ({ enabled, min, max, saving, onChange, onSave }) => {
  const [runValues, setRunValues] = React.useState<string>('');

  // Преобразуем min/max в строку для отображения
  React.useEffect(() => {
    if (enabled && (min !== '' || max !== '')) {
      const parts: string[] = [];
      if (min !== '') parts.push(String(min));
      if (max !== '') parts.push(String(max));
      setRunValues(parts.join(', '));
    } else {
      setRunValues('');
    }
  }, [enabled, min, max]);

  const handleValuesChange = (value: string) => {
    setRunValues(value);
    // Парсим значения из строки (например, "1, 100, 500" или "1-100")
    const parts = value.split(/[,\s-]+/).filter(p => p.trim() !== '').map(p => Number(p.trim())).filter(n => !isNaN(n));
    if (parts.length > 0) {
      onChange({ 
        enabled: true,
        min: parts[0] || '',
        max: parts.length > 1 ? parts[parts.length - 1] : ''
      });
    } else if (value.trim() === '') {
      onChange({ enabled: false, min: '', max: '' });
    }
  };

  return (
    <div className="form-section">
      <div className="parameter-item">
        <div className="parameter-info">
          <label htmlFor="run-values-input" style={{ fontSize: '14px', fontWeight: 500, color: '#0f172a' }}>
            Укажите значения
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            id="run-values-input"
            type="text"
            className="form-input"
            placeholder="1, 100, 500 или 1-100"
            value={runValues}
            onChange={(e) => handleValuesChange(e.target.value)}
            style={{ width: '100%', maxWidth: '400px' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={enabled} 
              onChange={(e) => {
                onChange({ enabled: e.target.checked });
                if (!e.target.checked) {
                  setRunValues('');
                }
              }} 
            />
            <span style={{ fontSize: '14px', color: '#0f172a' }}>Ограничить тираж</span>
          </label>
          {enabled && (min !== '' || max !== '') && (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '-8px' }}>
              Диапазон: {min !== '' ? `от ${min}` : ''} {max !== '' ? `до ${max}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RunSection


