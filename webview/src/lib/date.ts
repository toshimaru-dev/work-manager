const pad = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** Date → YYYY-MM-DD (ローカル時刻) */
export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = () => toDateKey(new Date());

/** YYYY-MM */
export const currentMonth = () => todayKey().slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 月の全日付 (YYYY-MM-DD) */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

export const monthFirstDay = (month: string) => `${month}-01`;
export const monthLastDay = (month: string) => monthDays(month).at(-1)!;

export const weekday = (dateKey: string) => WEEKDAYS[parseDateKey(dateKey).getDay()];

export const isWeekend = (dateKey: string) => [0, 6].includes(parseDateKey(dateKey).getDay());

/** 月の平日数（祝日は考慮しない） */
export const businessDays = (month: string) => monthDays(month).filter((d) => !isWeekend(d)).length;

/** 指定日を含む週 (月曜始まり) の [開始日, 終了日] */
export function weekRange(dateKey: string): [string, string] {
  const d = parseDateKey(dateKey);
  const offset = (d.getDay() + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return [toDateKey(start), toDateKey(end)];
}

/** "M/D(曜)" 形式 */
export function formatDay(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}(${weekday(dateKey)})`;
}

/** HH:mm 2つの差（分）。終了が開始以前なら 0 */
export function minutesBetween(start: string, end: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return Math.max(0, toMin(end) - toMin(start));
}

export function daysUntil(dateKey: string): number {
  return Math.round((parseDateKey(dateKey).getTime() - parseDateKey(todayKey()).getTime()) / 86400000);
}

/** 分 → 時間表記 (例: 7.5h) */
export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;

/** 分 → 時間の数値 (小数第2位まで) */
export const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
