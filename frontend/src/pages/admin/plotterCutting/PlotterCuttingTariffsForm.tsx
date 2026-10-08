import React, { useState } from 'react';
import { Button, Alert } from '../../../components/common';
import { PlotterTariffModeBlock } from './PlotterTariffModeBlock';
import { PlotterRollFinishingRanges } from './PlotterRollFinishingRanges';
import { usePlotterCuttingTariffsFormState } from './usePlotterCuttingTariffsForm';
import './PlotterCuttingTariffsForm.css';

export const PlotterCuttingTariffsForm: React.FC = () => {
  const { bundle, setBundle, materials, loading, saving, error, success, save } =
    usePlotterCuttingTariffsFormState();
  const [activeTab, setActiveTab] = useState<'roll' | 'sheet'>('roll');

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
            onClick={() =>setActiveTab('roll')}
          >
            Рулонная резка
          </button>
          <button
            type="button"
            role="tab"
            className={`orders-list-tab ${activeTab === 'sheet' ? 'active' : ''}`}
            aria-selected={activeTab === 'sheet'}
            onClick={() =>setActiveTab('sheet')}
          >
            Листовая
          </button>
        </div>
        <div className="plotter-tariffs-form__modes">
          {activeTab === 'roll' ? (
            <>
              <PlotterTariffModeBlock
                title="Рулонный плоттер"
                carrier="roll"
                value={bundle.roll}
                materials={materials}
                showCutLevels
                onChange={(roll) => setBundle({ ...bundle, roll })}
              />
              <PlotterRollFinishingRanges
                rollTariff={bundle.roll}
                onChangeRollTariff={(roll) => setBundle({ ...bundle, roll })}
              />
            </>
          ) : (
            <PlotterTariffModeBlock
              title="Листовой плоттер"
              carrier="sheet"
              value={bundle.sheet}
              materials={materials}
              showCutLevels
              onChange={(sheet) => setBundle({ ...bundle, sheet })}
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
