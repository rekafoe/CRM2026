import type { AdminUserRow } from './earningsTypes';

export type EarningsRoleStat = {
  role: string;
  users: number;
  gross: number;
  net: number;
  hours: number;
  avgNet: number;
  avgHourly: number;
};

export type EarningsAttentionItem = {
  key: string;
  tone: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
};

export type EarningsAnalytics = {
  activeUsers: number;
  totalUsers: number;
  gross: number;
  previousGross: number;
  grossDelta: number;
  grossDeltaPercent: number | null;
  bonuses: number;
  penalties: number;
  net: number;
  hours: number;
  shifts: number;
  avgNet: number;
  avgHourly: number;
  forecastGross: number;
  forecastNet: number;
  monthProgressPercent: number;
  topByNet: AdminUserRow[];
  topByHourly: AdminUserRow[];
  roleStats: EarningsRoleStat[];
  historyTotals: Array<{ month: string; total: number }>;
  attention: EarningsAttentionItem[];
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const percentDelta = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
};

const getMonthProgress = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return 1;

  const now = new Date();
  const selectedStart = new Date(year, monthIndex - 1, 1);
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();

  if (selectedStart < currentStart) return 1;
  if (selectedStart > currentStart) return 0;

  return Math.max(1 / daysInMonth, Math.min(1, now.getDate() / daysInMonth));
};

export function buildEarningsAnalytics(rows: AdminUserRow[], month: string): EarningsAnalytics {
  const activeRows = rows.filter((row) => row.isActive);
  const sourceRows = activeRows.length > 0 ? activeRows : rows;

  const gross = rows.reduce((sum, row) => sum + toNumber(row.totalCurrentMonth), 0);
  const previousGross = rows.reduce((sum, row) => sum + toNumber(row.totalPreviousMonth), 0);
  const bonuses = rows.reduce((sum, row) => sum + toNumber(row.totalBonuses), 0);
  const penalties = rows.reduce((sum, row) => sum + toNumber(row.totalPenalties), 0);
  const net = rows.reduce((sum, row) => sum + toNumber(row.totalNet ?? row.totalCurrentMonth), 0);
  const sourceNet = sourceRows.reduce((sum, row) => sum + toNumber(row.totalNet ?? row.totalCurrentMonth), 0);
  const hours = rows.reduce((sum, row) => sum + toNumber(row.hours), 0);
  const shifts = rows.reduce((sum, row) => sum + toNumber(row.shifts), 0);
  const monthProgress = getMonthProgress(month);
  const forecastRatio = monthProgress > 0 ? 1 / monthProgress : 1;

  const roleMap = new Map<string, EarningsRoleStat>();
  rows.forEach((row) => {
    const role = row.role || 'Без роли';
    const current = roleMap.get(role) ?? {
      role,
      users: 0,
      gross: 0,
      net: 0,
      hours: 0,
      avgNet: 0,
      avgHourly: 0,
    };
    current.users += 1;
    current.gross += toNumber(row.totalCurrentMonth);
    current.net += toNumber(row.totalNet ?? row.totalCurrentMonth);
    current.hours += toNumber(row.hours);
    roleMap.set(role, current);
  });

  const roleStats = Array.from(roleMap.values())
    .map((stat) => ({
      ...stat,
      avgNet: stat.users > 0 ? stat.net / stat.users : 0,
      avgHourly: stat.hours > 0 ? stat.net / stat.hours : 0,
    }))
    .sort((a, b) => b.net - a.net);

  const historyMonths = Array.from(new Set(rows.flatMap((row) => row.history.map((item) => item.month)))).sort();
  const historyTotals = historyMonths.map((historyMonth) => ({
    month: historyMonth,
    total: rows.reduce((sum, row) => {
      const item = row.history.find((entry) => entry.month === historyMonth);
      return sum + toNumber(item?.total);
    }, 0),
  }));

  const attention: EarningsAttentionItem[] = [];
  const activeWithoutEarnings = activeRows.filter((row) => toNumber(row.totalCurrentMonth) === 0);
  if (activeWithoutEarnings.length > 0) {
    attention.push({
      key: 'active-without-earnings',
      tone: 'warning',
      title: 'Активные без начислений',
      description: `${activeWithoutEarnings.length} сотрудн. без начислений за выбранный месяц.`,
    });
  }

  const earnedWithoutHours = rows.filter((row) => toNumber(row.totalCurrentMonth) > 0 && toNumber(row.hours) === 0);
  if (earnedWithoutHours.length > 0) {
    attention.push({
      key: 'earned-without-hours',
      tone: 'danger',
      title: 'Есть начисления без часов',
      description: `${earnedWithoutHours.length} сотрудн. имеют начисления, но часы не заполнены.`,
    });
  }

  if (gross > 0 && penalties / gross > 0.1) {
    attention.push({
      key: 'high-penalties',
      tone: 'danger',
      title: 'Высокая доля штрафов',
      description: `Штрафы составляют ${(penalties / gross * 100).toFixed(1)}% от начислений.`,
    });
  }

  if (attention.length === 0) {
    attention.push({
      key: 'no-issues',
      tone: 'info',
      title: 'Критичных отклонений нет',
      description: 'По текущему месяцу не найдено явных проблем в начислениях и часах.',
    });
  }

  return {
    activeUsers: activeRows.length,
    totalUsers: rows.length,
    gross,
    previousGross,
    grossDelta: gross - previousGross,
    grossDeltaPercent: percentDelta(gross, previousGross),
    bonuses,
    penalties,
    net,
    hours,
    shifts,
    avgNet: sourceRows.length > 0 ? sourceNet / sourceRows.length : 0,
    avgHourly: hours > 0 ? net / hours : 0,
    forecastGross: gross * forecastRatio,
    forecastNet: net * forecastRatio,
    monthProgressPercent: monthProgress * 100,
    topByNet: [...rows].sort((a, b) => toNumber(b.totalNet ?? b.totalCurrentMonth) - toNumber(a.totalNet ?? a.totalCurrentMonth)).slice(0, 5),
    topByHourly: [...rows].filter((row) => toNumber(row.hours) > 0).sort((a, b) => {
      const bRate = toNumber(b.totalNet ?? b.totalCurrentMonth) / toNumber(b.hours);
      const aRate = toNumber(a.totalNet ?? a.totalCurrentMonth) / toNumber(a.hours);
      return bRate - aRate;
    }).slice(0, 5),
    roleStats,
    historyTotals,
    attention,
  };
}
