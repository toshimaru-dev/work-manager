import Papa from 'papaparse';
import { CalendarEvent } from '../shared/types';
import { diffMinutes, toDateString, toTimeString } from './util';

// Outlook (日本語/英語) のエクスポート形式と、シンプルな独自形式の列名に対応
const COLUMN_ALIASES = {
  title: ['件名', 'subject', 'title', 'タイトル', '予定'],
  startDate: ['開始日', 'start date', 'date', '日付'],
  startTime: ['開始時刻', 'start time', 'start', '開始'],
  endDate: ['終了日', 'end date'],
  endTime: ['終了時刻', 'end time', 'end', '終了'],
  allDay: ['終日イベント', 'all day event', 'all day', '終日'],
  location: ['場所', 'location'],
};

type Column = keyof typeof COLUMN_ALIASES;

/**
 * 予定表の CSV を解析する。
 * 例: Outlook の「エクスポート」CSV、または `日付,開始,終了,タイトル` 形式。
 */
export function parseCsv(text: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const col = resolveColumns(headers);
  if (!col.title || !col.startDate) {
    throw new Error(
      `CSV の列を判別できませんでした。「件名/Subject」と「開始日/Start Date」の列が必要です。検出された列: ${headers.join(', ')}`,
    );
  }

  const events: CalendarEvent[] = [];
  const seen = new Map<string, number>();
  parsed.data.forEach((row) => {
    const get = (c: Column) => {
      const name = col[c];
      return name ? (row[name] ?? '').trim() : '';
    };
    const allDay = /^(true|yes|はい|1|on)$/i.test(get('allDay')) || !get('startTime');
    const start = parseDateTime(get('startDate'), allDay ? '' : get('startTime'));
    if (!start || start < rangeStart || start > rangeEnd) return;
    const end = parseDateTime(get('endDate') || get('startDate'), allDay ? '' : get('endTime')) ?? start;
    // 再エクスポートしても同じ予定は同じキーになるよう、日時+件名で識別（同一内容の重複には連番を付与）
    const base = `csv:${toDateString(start)}T${toTimeString(start)}:${get('title')}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    events.push({
      key: n ? `${base}#${n}` : base,
      date: toDateString(start),
      start: allDay ? '00:00' : toTimeString(start),
      end: allDay ? '00:00' : toTimeString(end),
      minutes: allDay ? 0 : diffMinutes(start, end),
      title: get('title') || '(無題)',
      allDay,
      location: get('location'),
    });
  });
  return events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function resolveColumns(headers: string[]): Partial<Record<Column, string>> {
  const result: Partial<Record<Column, string>> = {};
  for (const [c, aliases] of Object.entries(COLUMN_ALIASES) as [Column, string[]][]) {
    result[c] = headers.find((h) => aliases.includes(h.trim().toLowerCase()));
  }
  return result;
}

/** 2026/10/2, 2026-10-02, 10/2/2026 等の日付と 9:00, 9:00:00, 午後 1:30:00, 1:30 PM 等の時刻を解釈 */
export function parseDateTime(date: string, time: string): Date | null {
  let y: number, m: number, d: number;
  let match = date.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }

  let hh = 0;
  let mm = 0;
  const t = time.match(/(\d{1,2}):(\d{2})/);
  if (t) {
    hh = Number(t[1]);
    mm = Number(t[2]);
    if (/午後|pm/i.test(time) && hh < 12) hh += 12;
    if (/午前|am/i.test(time) && hh === 12) hh = 0;
  }
  return new Date(y, m - 1, d, hh, mm);
}
