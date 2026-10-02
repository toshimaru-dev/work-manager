import ICAL from 'ical.js';
import { CalendarEvent } from '../shared/types';
import { diffMinutes, toDateString, toTimeString } from './util';

/** 繰り返し予定の展開上限（1予定あたり） */
const MAX_OCCURRENCES = 2000;

/**
 * ICS (iCalendar) を解析し、ローカル時刻の予定一覧を返す。
 * 繰り返し予定(RRULE)は rangeStart〜rangeEnd の範囲で展開する。
 */
export function parseIcs(text: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const comp = new ICAL.Component(ICAL.parse(text));

  // Outlook 等が埋め込む VTIMEZONE を登録しておく
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  }

  const events: CalendarEvent[] = [];
  const recurring = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];

  for (const v of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.isRecurring()) recurring.set(ev.uid, ev);
    else if (!isCancelled(ev)) pushEvent(events, ev.uid, ev.startDate, ev.endDate, ev, rangeStart, rangeEnd);
  }

  for (const ex of exceptions) recurring.get(ex.uid)?.relateException(ex);

  for (const ev of recurring.values()) {
    const it = ev.iterator();
    let count = 0;
    for (let next = it.next(); next && count < MAX_OCCURRENCES; next = it.next(), count++) {
      if (next.toJSDate() > rangeEnd) break;
      const occ = ev.getOccurrenceDetails(next);
      if (isCancelled(occ.item)) continue;
      pushEvent(events, `${ev.uid}#${next.toString()}`, occ.startDate, occ.endDate, occ.item, rangeStart, rangeEnd);
    }
  }

  return events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function isCancelled(ev: ICAL.Event): boolean {
  return ev.component.getFirstPropertyValue('status') === 'CANCELLED';
}

function pushEvent(
  out: CalendarEvent[],
  key: string,
  startTime: ICAL.Time,
  endTime: ICAL.Time | null,
  item: ICAL.Event,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = startTime.toJSDate();
  if (start < rangeStart || start > rangeEnd) return;
  const end = endTime ? endTime.toJSDate() : start;
  const allDay = startTime.isDate;
  out.push({
    key,
    date: toDateString(start),
    start: allDay ? '00:00' : toTimeString(start),
    end: allDay ? '00:00' : toTimeString(end),
    minutes: allDay ? 0 : diffMinutes(start, end),
    title: item.summary || '(無題)',
    allDay,
    location: item.location || '',
  });
}
