export const pad = (n: number) => String(n).padStart(2, '0');

export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toTimeString = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const diffMinutes = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
