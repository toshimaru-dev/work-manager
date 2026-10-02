export interface MonthProps {
  month: string;
  onMonthChange: (month: string) => void;
}

/** タブのインデックス */
export const TAB = { dashboard: 0, entries: 1, import: 2, summary: 3, goals: 4, codes: 5, settings: 6 } as const;
