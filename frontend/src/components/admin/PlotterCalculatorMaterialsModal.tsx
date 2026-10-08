import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common';
import { BynSymbol } from '../ui/BynSymbol';
import {
  getPlotterCalculatorMaterials,
  putPlotterCalculatorMaterials,
  type PlotterCalculatorMaterial,
} from '../../services/pricing';
import { useUIStore } from '../../stores/uiStore';
import { getAxiosErrorMessage } from '../../utils/errorUtils';
import './PlotterCalculatorMaterialsModal.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

function formatWidth(width: number | null): string | null {
  const value = Number(width);
  if (!(value > 0)) return null;
  return `${value} мм`;
}

export const PlotterCalculatorMaterialsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const showToast = useUIStore((state) => state.showToast);
  const [rolls, setRolls] = useState<PlotterCalculatorMaterial[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuery('');
    getPlotterCalculatorMaterials()
      .then((payload) => {
        if (cancelled) return;
        setRolls(payload.rolls ?? []);
        setSelected(new Set(payload.material_ids ?? []));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getAxiosErrorMessage(err) || 'Не удалось загрузить рулоны');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rolls;
    return rolls.filter((row) => row.name.toLowerCase().includes(needle));
  }, [query, rolls]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = await putPlotterCalculatorMaterials([...selected]);
      setRolls(payload.rolls ?? []);
      setSelected(new Set(payload.material_ids ?? []));
      showToast('Материалы плоттерной резки сохранены', 'success');
      onClose();
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err) || 'Не удалось сохранить список');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Материалы плоттера" size="md">
      <div className="plotter-mat">
        <p className="plotter-mat__lead">
          Отмеченные рулоны появляются в калькуляторе «Плоттерная резка». Этот список не связан с материалами
          продуктов. В калькуляторе можно выбрать «Без материала» — тогда считается только резка.
        </p>
        <input
          className="plotter-mat__search"
          placeholder="Поиск по названию рулона"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        {error ? <p className="plotter-mat__error">{error}</p> : null}
        {loading ? <p className="plotter-mat__status">Загружаем рулоны…</p> : null}
        {!loading && rolls.length === 0 ? (
          <p className="plotter-mat__status">Активных рулонов на складе нет. Добавьте материал с видом «рулон».</p>
        ) : null}
        {!loading && rolls.length > 0 && visible.length === 0 ? (
          <p className="plotter-mat__status">По этому запросу рулонов нет.</p>
        ) : null}
        <ul className="plotter-mat__list">
          {visible.map((row) => {
            const width = formatWidth(row.sheet_width);
            const price = Number(row.sheet_price_single);
            return (
              <li key={row.id}>
                <label className="plotter-mat__row">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                  <span className="plotter-mat__name">{row.name}</span>
                  <span className="plotter-mat__meta">
                    {width ? <span>{width}</span> : <span>ширина не задана</span>}
                    {price > 0 ? (
                      <span>
                        {price.toFixed(2)} <BynSymbol />/м
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="plotter-mat__footer">
          <span className="plotter-mat__count">Отмечено {selected.size}</span>
          <div className="plotter-mat__actions">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Закрыть
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={loading || saving}>
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
