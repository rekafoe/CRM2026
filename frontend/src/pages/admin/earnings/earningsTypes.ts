export type AdminUserRow = {
  userId: number;
  name: string;
  role: string;
  isActive: boolean;
  totalCurrentMonth: number;
  totalPreviousMonth: number;
  totalPenalties?: number;
  totalBonuses?: number;
  totalNet?: number;
  hours: number;
  shifts: number;
  history: Array<{ month: string; total: number }>;
};
