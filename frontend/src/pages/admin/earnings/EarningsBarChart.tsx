import React from 'react';
import { MoneyAmount } from '../../../components/ui';
import './EarningsBarChart.css';

export type EarningsBarPoint = {
  month: string;
  total: number;
};

const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function monthLabel(month: string): string {
  const [yearText, monthText] = month.split('-');
  const monthIndex = Number(monthText) - 1;
  const name = MONTH_LABELS[monthIndex];
  if (!name || !yearText) return month;
  return `${name} ${yearText}`;
}

type EarningsBarChartProps = {
  items: EarningsBarPoint[];
  highlightMonth?: string;
};

/** Столбцы от нуля: высота пропорциональна сумме, а не разнице между месяцами. */
export const EarningsBarChart: React.FC<EarningsBarChartProps> = ({ items, highlightMonth }) => {
  const max = Math.max(0, ...items.map((item) => Number(item.total) || 0));

  return (
    <div className="earn-bars" role="img" aria-label="Динамика по месяцам">
      {items.map((item) => {
        const value = Number(item.total) || 0;
        const height = max > 0 ? (value / max) * 100 : 0;
        const current = item.month === highlightMonth;
        return (
          <div className={`earn-bars__col${current ? ' earn-bars__col--current' : ''}`} key={item.month}>
            <div className="earn-bars__value">
              <MoneyAmount value={value} decimals={0} />
            </div>
            <div className="earn-bars__track">
              <div className="earn-bars__bar" style={{ height: `${height}%` }} />
            </div>
            <div className="earn-bars__label">{monthLabel(item.month)}</div>
          </div>
        );
      })}
    </div>
  );
};
