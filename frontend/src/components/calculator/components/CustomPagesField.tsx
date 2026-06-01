import React, { useEffect, useState } from 'react';
import { ceilPagesToStep, inferMultipagePagesStep } from '../../../utils/multipageProduct';

type Props = {
  specsPages: number | undefined;
  validationErrors: Record<string, string>;
  minBound?: number;
  maxBound?: number;
  stepHint?: number;
  allowedOptions: number[];
  sublabel: string;
  updateSpecs: (updates: { pages?: number | undefined }, instant?: boolean) => void;
  /** Сброс черновика при смене пресета / размера */
  resetKey?: string;
};

export const CustomPagesField: React.FC<Props> = ({
  specsPages,
  validationErrors,
  minBound,
  maxBound,
  stepHint,
  allowedOptions,
  sublabel,
  updateSpecs,
  resetKey = '',
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [adjustHint, setAdjustHint] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
    setAdjustHint(null);
  }, [resetKey]);

  const step = inferMultipagePagesStep(stepHint, allowedOptions);

  const displayValue =
    draft !== null
      ? draft
      : specsPages != null && Number.isFinite(Number(specsPages))
        ? String(specsPages)
        : '';

  const applyPagesFromInput = (raw: string, instant: boolean) => {
    if (raw.trim() === '') {
      setAdjustHint(null);
      updateSpecs({ pages: undefined }, false);
      return;
    }
    const entered = parseInt(raw, 10);
    if (!Number.isFinite(entered) || entered < 1) {
      setAdjustHint(null);
      return;
    }
    const { billingPages, adjusted, cappedByMax } = ceilPagesToStep(entered, step, {
      min: minBound,
      max: maxBound,
    });
    if (minBound != null && entered < minBound) {
      setAdjustHint(`В расчёте: ${billingPages} стр. (не менее ${minBound} стр.)`);
    } else if (cappedByMax && billingPages !== entered) {
      setAdjustHint(`В расчёте: ${billingPages} стр. (не более ${maxBound} стр.)`);
    } else if (step > 1 && entered % step !== 0 && billingPages !== entered) {
      setAdjustHint(`В расчёте: ${billingPages} стр. (введено ${entered}, кратно ${step})`);
    } else {
      setAdjustHint(null);
    }
    updateSpecs({ pages: billingPages }, instant);
  };

  return (
    <div className="param-group param-group--pages-custom">
      <label className="param-group__sublabel">{sublabel}</label>
      <input
        type="number"
        className={`form-control${validationErrors.pages ? ' error' : ''}`}
        min={minBound}
        max={maxBound}
        step={step > 1 ? step : 1}
        value={displayValue}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          applyPagesFromInput(raw, true);
        }}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          setDraft(null);
          applyPagesFromInput(raw, true);
        }}
      />
      {adjustHint && !validationErrors.pages && (
        <p className="param-hint param-hint--pages-adjust">{adjustHint}</p>
      )}
    </div>
  );
};
