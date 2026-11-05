import React from 'react';
import './pool-loader.css';

interface PoolLoaderProps {
  label: string;
  compact?: boolean;
}

export const PoolLoader: React.FC<PoolLoaderProps> = ({ label, compact = false }) => (
  <div className={`pool-loader${compact ? ' pool-loader--compact' : ''}`} role="status" aria-live="polite">
    <span className="pool-loader__spin" aria-hidden="true" />
    <span className="pool-loader__label">{label}</span>
  </div>
);
