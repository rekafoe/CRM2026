import { currentMonthKey, getMonthProgress, shiftMonthKey } from '../../utils/monthProgress';

export type RevenueMonthPoint = {
  month: string;
  revenue: number;
};

export type RevenueMonthForecast = {
  currentMonth: string;
  revenueSoFar: number;
  forecast: number;
  monthProgressPercent: number;
  chart: Array<{ month: string; total: number }>;
};

/** Прогноз выручки текущего месяца тем же способом, что и прогноз фонда зарплаты. */
export function buildRevenueMonthForecast(
  byMonth: RevenueMonthPoint[],
  now = new Date(),
): RevenueMonthForecast {
  const currentMonth = currentMonthKey(now);
  const revenueByMonth = new Map(byMonth.map((row) => [row.month, Number(row.revenue) || 0]));
  const chart = Array.from({ length: 12 }, (_, index) => {
    const month = shiftMonthKey(currentMonth, index - 11);
    return { month, total: revenueByMonth.get(month) ?? 0 };
  });
  const revenueSoFar = revenueByMonth.get(currentMonth) ?? 0;
  const progress = getMonthProgress(currentMonth, now);
  const ratio = progress > 0 ? 1 / progress : 1;

  return {
    currentMonth,
    revenueSoFar,
    forecast: revenueSoFar * ratio,
    monthProgressPercent: progress * 100,
    chart,
  };
}
