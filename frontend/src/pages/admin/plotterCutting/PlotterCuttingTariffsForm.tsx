import React, { useState } from 'react';
import { Button, Alert } from '../../../components/common';
import { PlotterTariffModeBlock, type PlotterTariffPart } from './PlotterTariffModeBlock';
import { PlotterRollFinishingRanges, type PlotterFinishingPart } from './PlotterRollFinishingRanges';
import { usePlotterCuttingTariffsFormState } from './usePlotterCuttingTariffsForm';
import './PlotterCuttingTariffsForm.css';

type TariffPane = PlotterTariffPart | PlotterFinishingPart;

const ROLL_PANES: Array<{ id: TariffPane; label: string }> = [
  { id: 'cut', label: 'Резка' },
  { id: 'levels', label: 'Уровни' },
  { id: 'weeding', label: 'Выборка' },
  { id: 'mounting', label: 'Накатка' },
  { id: 'proof', label: 'Проверка' },
  { id: 'extra', label: 'Списание и зарплата' },
];

const SHEET_PANES = ROLL_PANES.filter((item) => item.id === 'cut' || item.id === 'levels' || item.id === 'extra');

function isFinishingPane(pane: TariffPane): pane is PlotterFinishingPart {
  return pane === 'weeding' || pane === 'mounting' || pane === 'proof';
}

export const PlotterCuttingTariffsForm: React.FC = () => {
  const { bundle, setBundle, materials, loading, saving, error, success, save } =
    usePlotterCuttingTariffsFormState();
  const [activeTab, setActiveTab] = useState<'roll' | 'sheet'>('roll');
  const [pane, setPane] = useState<TariffPane>('cut');

  if (loading || !bundle) {
    return (
      <div className="plotter-tariffs-loading">
        <p>Загрузка тарифов…</p>
      </div>
    );
  }

  return (
    <div className="plotter-tariffs-form">
      {error && (
        <Alert type="error" className="plotter-tariffs-form__alert">
          {error}
        </Alert>
      )}
      {success && (
        <Alert type="success" className="plotter-tariffs-form__alert">
          {success}
        </Alert>
      )}
      <section className="plotter-tariffs-form__panel" aria-label="Тарифы плоттера и режимы резки">
        <header className="plotter-tariffs-form__header">
          <p className="plotter-tariffs-form__lead">
            Рулон и лист считаются отдельно. Режим выбирается в подтипе продукта. У листа, если у материала не задан
            свой формат, в расчёт берётся SRA3, 320×450 мм.
          </p>
        </header>
        <div className="plotter-tariffs-form__tabs" role="tablist" aria-label="Режимы плоттерной резки">
          <button
            type="button"
            role="tab"
            className={`orders-list-tab ${activeTab === 'roll' ? 'active' : ''}`}
            aria-selected={activeTab === 'roll'}
            onClick={() => setActiveTab('roll')}
          >
            Рулонная резка
          </button>
          <button
            type="button"
            role="tab"
            className={`orders-list-tab ${activeTab === 'sheet' ? 'active' : ''}`}
            aria-selected={activeTab === 'sheet'}
            onClick={() => {
              setActiveTab('sheet');
              if (isFinishingPane(pane)) setPane('cut');
            }}
          >
            Листовая
          </button>
        </div>
        <div className="plotter-tariffs-form__tabs plotter-tariffs-form__subtabs" role="tablist" aria-label="Раздел тарифа">
          {(activeTab === 'roll' ? ROLL_PANES : SHEET_PANES).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`orders-list-tab ${pane === item.id ? 'active' : ''}`}
              aria-selected={pane === item.id}
              onClick={() => setPane(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="plotter-tariffs-form__modes">
          {activeTab === 'roll' && isFinishingPane(pane) ? (
            <PlotterRollFinishingRanges
              part={pane}
              rollTariff={bundle.roll}
              onChangeRollTariff={(roll) => setBundle({ ...bundle, roll })}
            />
          ) : (
            <PlotterTariffModeBlock
              title={activeTab === 'roll' ? 'Рулонный плоттер' : 'Листовой плоттер'}
              carrier={activeTab}
              part={isFinishingPane(pane) ? 'cut' : pane}
              value={activeTab === 'roll' ? bundle.roll : bundle.sheet}
              materials={materials}
              showCutLevels
              onChange={(next) =>
                setBundle(activeTab === 'roll' ? { ...bundle, roll: next } : { ...bundle, sheet: next })
              }
            />
          )}
        </div>
        <footer className="plotter-tariffs-form__footer">
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Сохранить
          </Button>
        </footer>
      </section>
    </div>
  );
};

export default PlotterCuttingTariffsForm;
