export type AdminUserRow = {
  userId: number;
  name: string;
  role: string;
  isActive: boolean;
  totalCurrentMonth: number;
  totalPreviousMonth: number;
  /** К выплате за прошлый месяц: проценты + часы + премии − штрафы. */
  totalPreviousNet?: number;
  totalPenalties?: number;
  totalBonuses?: number;
  /** Сколько юрлиц закреплено за сотрудником сейчас. */
  salesClients?: number;
  /** Оборот оформленных заказов этих юрлиц за месяц. */
  salesTurnover?: number;
  /** 500 руб. за каждые 10 000 оборота. Уже входит в «к выплате». */
  salesBonus?: number;
  salesRemainder?: number;
  salesUntilNext?: number;
  /** Доля брака месяца. Вычитается из «к выплате», в проценты позиции не входит. */
  totalWaste?: number;
  hourlyRate?: number;
  hourlyPay?: number;
  totalNet?: number;
  hours: number;
  shifts: number;
  history: Array<{ month: string; total: number; net?: number }>;
  /** К выплате по месяцам календарного года выбранного месяца. */
  yearHistory?: Array<{ month: string; total: number; net?: number }>;
};
