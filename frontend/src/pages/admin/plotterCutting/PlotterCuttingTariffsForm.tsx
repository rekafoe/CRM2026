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
          <p className="plotter-tariffs-form__kicker">
            Тарифы рулона и листа, диапазоны по объёму и дополнительные строки для выборки и накатки.
          </p>
          <p className="plotter-tariffs-form__lead">
            Два фиксированных режима — рулон и лист. Листовой плоттер в типовом сценарии режет носитель{' '}
            <strong>SRA3 (320×450 мм)</strong>; расчёт использует размеры листа материала или эти значения как
            запасной вариант. Режим задаётся в шаблоне подтипа.
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
            onClick={() => setActiveTab('sheet')}
          >
            Листовая
          </button>
        </div>
        <div className="plotter-tariffs-form__modes">
          {activeTab === 'roll' ? (
            <>
              <PlotterTariffModeBlock
                title="Рулонный плоттер"
                value={bundle.roll}
                materials={materials}
                showRollCutLevels
                onChange={(roll) => setBundle({ ...bundle, roll })}
              />
              <PlotterRollFinishingRanges
                rollTariff={bundle.roll}
                onChangeRollTariff={(roll) => setBundle({ ...bundle, roll })}
              />
            </>
          ) : (
            <PlotterTariffModeBlock
              title="Листовой плоттер (SRA3 320×450 мм)"
              value={bundle.sheet}
              materials={materials}
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
