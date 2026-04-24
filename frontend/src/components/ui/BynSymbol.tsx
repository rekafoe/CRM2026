import React from 'react';
import './BynSymbol.css';

type BynSymbolProps = {
  className?: string;
  title?: string;
};

/** Официальный графический знак белорусского рубля (не «Br»/«BYN»). */
export const BynSymbol: React.FC<BynSymbolProps> = ({
  className = '',
  title = 'Белорусский рубль',
}) => (
  <span
    className={['byn-sign', className].filter(Boolean).join(' ')}
    role="img"
    title={title}
    aria-label={title}
  >
    <svg className="byn-sign__svg" viewBox="0 0 20 24" focusable="false" aria-hidden>
      <text x="0" y="16.4" className="byn-sign__b">
        Б
      </text>
      <line x1="0" y1="10.1" x2="8" y2="10.1" className="byn-sign__line" />
    </svg>
  </span>
);
