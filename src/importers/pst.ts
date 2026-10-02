import { PSTFile, PSTFolder } from 'pst-extractor';
// PSTAppointment はパッケージのエントリから export されていないため直接読み込む
import { PSTAppointment } from 'pst-extractor/dist/PSTAppointment.class';
import { CalendarEvent } from '../shared/types';
import { diffMinutes, toDateString, toTimeString } from './util';

/**
 * Outlook のデータファイル (PST / OST) から予定表フォルダの予定を取り出す。
 * 繰り返し予定は AppointmentRecurrencePattern ([MS-OXOCAL] 2.2.1.44) を自前で解析して
 * rangeStart〜rangeEnd の範囲で展開する（削除・変更された回にも対応）。
 */
export function parsePst(filePath: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const pst = new PSTFile(filePath);
  const events: CalendarEvent[] = [];
  try {
    const folders = findCalendarFolders(pst.getRootFolder());
    if (!folders.length) throw new Error('PST の中に予定表フォルダが見つかりませんでした。');
    for (const folder of folders) {
      for (let item = folder.getNextChild(); item; item = folder.getNextChild()) {
        if (item instanceof PSTAppointment && item.messageClass === 'IPM.Appointment') {
          collect(events, item, rangeStart, rangeEnd);
        }
      }
    }
  } finally {
    pst.close();
  }

  // 再エクスポートしても同じ予定は同じキーになるよう、日時+件名で識別（同一内容の重複には連番を付与）
  const seen = new Map<string, number>();
  for (const e of events) {
    const n = seen.get(e.key) ?? 0;
    seen.set(e.key, n + 1);
    if (n) e.key = `${e.key}#${n}`;
  }
  return events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function findCalendarFolders(folder: PSTFolder): PSTFolder[] {
  const found: PSTFolder[] = [];
  if (folder.containerClass.startsWith('IPF.Appointment')) found.push(folder);
  if (folder.hasSubfolders) for (const sub of folder.getSubFolders()) found.push(...findCalendarFolders(sub));
  return found;
}

/** PidLidAppointmentStateFlags: asfCanceled */
const STATE_CANCELED = 0x4;

function collect(out: CalendarEvent[], appt: PSTAppointment, rangeStart: Date, rangeEnd: Date) {
  if (appt.meetingStatus & STATE_CANCELED) return;
  const title = appt.subject || '(無題)';
  const location = appt.location || '';
  const allDay = appt.subType;

  const blob = appt.isRecurring ? appt.recurrenceStructure : null;
  if (!blob) {
    const start = appt.startTime;
    if (!start) return;
    pushEvent(out, start, appt.endTime ?? start, title, location, allDay, rangeStart, rangeEnd);
    return;
  }

  const rec = parseRecurrence(blob);
  const toUtc = wallClockToUtc(rec, appt.startTime, appt.timezone);
  const skip = new Set(rec.deletedDates);

  for (const day of occurrenceDates(rec, toWin(rangeEnd) + 2 * DAY)) {
    if (skip.has(day)) continue; // 削除された回、または変更された回（変更後は例外として追加）
    const start = toUtc(day + rec.startTimeOffset);
    const end = toUtc(day + rec.endTimeOffset);
    pushEvent(out, start, end, title, location, allDay, rangeStart, rangeEnd);
  }
  for (const ex of rec.exceptions) {
    pushEvent(
      out,
      toUtc(ex.start),
      toUtc(ex.end),
      ex.subject ?? title,
      ex.location ?? location,
      allDay,
      rangeStart,
      rangeEnd,
    );
  }
}

function pushEvent(
  out: CalendarEvent[],
  start: Date,
  end: Date,
  title: string,
  location: string,
  allDay: boolean,
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (start < rangeStart || start > rangeEnd) return;
  out.push({
    key: `pst:${toDateString(start)}T${toTimeString(start)}:${title}`,
    date: toDateString(start),
    start: allDay ? '00:00' : toTimeString(start),
    end: allDay ? '00:00' : toTimeString(end),
    minutes: allDay ? 0 : diffMinutes(start, end),
    title,
    allDay,
    location,
  });
}

// ---- 繰り返しパターンの解析 ----
// 繰り返しパターン内の日時は「1601-01-01 からの分数」で、予定のタイムゾーンでの現地時刻（壁時計）。
// 計算は Date の UTC 系メソッドを壁時計として使って行う。

const DAY = 1440;
const WIN_EPOCH_MS = Date.UTC(1601, 0, 1);
const toWin = (d: Date) => Math.floor((d.getTime() - WIN_EPOCH_MS) / 60000);
const wallDate = (min: number) => new Date(WIN_EPOCH_MS + min * 60000);
const fromWall = (y: number, m: number, d: number) => (Date.UTC(y, m, d) - WIN_EPOCH_MS) / 60000;

enum PatternType {
  Day = 0x0,
  Week = 0x1,
  Month = 0x2,
  MonthNth = 0x3,
  MonthEnd = 0x4,
  HjMonth = 0xa,
  HjMonthNth = 0xb,
  HjMonthEnd = 0xc,
}

interface Exception {
  start: number;
  end: number;
  subject?: string;
  location?: string;
}

interface Recurrence {
  patternType: PatternType;
  period: number;
  /** Week: 曜日ビット (bit0=日曜)、Month: 日、MonthNth: 曜日ビット */
  daysMask: number;
  dayOfMonth: number;
  /** MonthNth: 1〜4、5=最終 */
  nth: number;
  firstDow: number;
  deletedDates: number[];
  startDate: number;
  endDate: number;
  startTimeOffset: number;
  endTimeOffset: number;
  exceptions: Exception[];
}

const OVERRIDE_SUBJECT = 0x0001;
const OVERRIDE_LOCATION = 0x0010;
/** ExceptionInfo の OverrideFlags ごとの追加フィールド長（件名・場所は可変長なので別扱い） */
const OVERRIDE_FIXED_FIELDS: [flag: number, size: number][] = [
  [0x0002, 4], // MEETINGTYPE
  [0x0004, 4], // REMINDERDELTA
  [0x0008, 4], // REMINDER
];
const OVERRIDE_TRAILING_FIELDS: [flag: number, size: number][] = [
  [0x0020, 4], // BUSYSTATUS
  [0x0040, 4], // ATTACHMENT
  [0x0080, 4], // SUBTYPE
  [0x0100, 4], // APPTCOLOR
];

class Reader {
  constructor(
    private buf: Buffer,
    public pos = 0,
  ) {}
  u16() {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  bytes(n: number) {
    const v = this.buf.subarray(this.pos, this.pos + n);
    if (v.length < n) throw new RangeError('繰り返しパターンのデータが途中で切れています');
    this.pos += n;
    return v;
  }
  skip(n: number) {
    this.bytes(n);
  }
}

function parseRecurrence(buf: Buffer): Recurrence {
  const r = new Reader(buf);
  r.skip(4); // ReaderVersion, WriterVersion
  r.u16(); // RecurFrequency（PatternType と Period で判定できるので不要）
  const patternType = r.u16() as PatternType;
  r.u16(); // CalendarType
  r.u32(); // FirstDateTime
  const period = r.u32();
  r.u32(); // SlidingFlag

  let daysMask = 0;
  let dayOfMonth = 0;
  let nth = 0;
  switch (patternType) {
    case PatternType.Week:
      daysMask = r.u32();
      break;
    case PatternType.Month:
    case PatternType.MonthEnd:
    case PatternType.HjMonth:
    case PatternType.HjMonthEnd:
      dayOfMonth = r.u32();
      break;
    case PatternType.MonthNth:
    case PatternType.HjMonthNth:
      daysMask = r.u32();
      nth = r.u32();
      break;
  }

  r.u32(); // EndType
  r.u32(); // OccurrenceCount（EndDate に反映済み）
  const firstDow = r.u32();
  const deletedDates = Array.from({ length: r.u32() }, () => r.u32());
  const modifiedCount = r.u32();
  r.skip(modifiedCount * 4);
  const startDate = r.u32();
  const endDate = r.u32();

  r.skip(4); // ReaderVersion2
  const writerVersion2 = r.u32();
  const startTimeOffset = r.u32();
  const endTimeOffset = r.u32();

  const exceptions: (Exception & { flags: number })[] = [];
  const exceptionCount = r.u16();
  for (let i = 0; i < exceptionCount; i++) {
    const ex: Exception & { flags: number } = { start: r.u32(), end: r.u32(), flags: 0 };
    r.u32(); // OriginalStartDate
    ex.flags = r.u16();
    if (ex.flags & OVERRIDE_SUBJECT) {
      r.u16();
      ex.subject = decodeAnsi(r.bytes(r.u16()));
    }
    for (const [flag, size] of OVERRIDE_FIXED_FIELDS) if (ex.flags & flag) r.skip(size);
    if (ex.flags & OVERRIDE_LOCATION) {
      r.u16();
      ex.location = decodeAnsi(r.bytes(r.u16()));
    }
    for (const [flag, size] of OVERRIDE_TRAILING_FIELDS) if (ex.flags & flag) r.skip(size);
    exceptions.push(ex);
  }

  // ExtendedException の Unicode 件名・場所で上書き（ANSI 版は文字コード依存で化けることがあるため）
  try {
    r.skip(r.u32()); // ReservedBlock1
    for (const ex of exceptions) {
      if (writerVersion2 >= 0x3009) r.skip(r.u32()); // ChangeHighlight
      r.skip(r.u32()); // ReservedBlockEE1
      if (ex.flags & (OVERRIDE_SUBJECT | OVERRIDE_LOCATION)) r.skip(12); // StartDateTime, EndDateTime, OriginalStartDate
      if (ex.flags & OVERRIDE_SUBJECT) ex.subject = r.bytes(r.u16() * 2).toString('utf16le');
      if (ex.flags & OVERRIDE_LOCATION) ex.location = r.bytes(r.u16() * 2).toString('utf16le');
      r.skip(r.u32()); // ReservedBlockEE2
    }
  } catch {
    // ExtendedException が無い/壊れている場合は ANSI 版をそのまま使う
  }

  return {
    patternType,
    period,
    daysMask,
    dayOfMonth,
    nth,
    firstDow,
    deletedDates,
    startDate,
    endDate,
    startTimeOffset,
    endTimeOffset,
    exceptions,
  };
}

function decodeAnsi(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** 繰り返しの各回の日付（その日の 0:00、壁時計の分数）を順に返す */
function* occurrenceDates(rec: Recurrence, limit: number): Generator<number> {
  const last = Math.min(rec.endDate, limit);
  const inRange = (d: number) => d >= rec.startDate && d <= last;

  switch (rec.patternType) {
    case PatternType.Day: {
      const step = Math.max(rec.period, DAY);
      for (let d = rec.startDate; d <= last; d += step) yield d;
      return;
    }
    case PatternType.Week: {
      // FirstDOW を週の始まりとして、startDate を含む週から period 週ごと
      const dow = wallDate(rec.startDate).getUTCDay();
      const weekStart = rec.startDate - ((dow - rec.firstDow + 7) % 7) * DAY;
      const step = Math.max(rec.period, 1) * 7 * DAY;
      for (let w = weekStart; w <= last; w += step) {
        for (let i = 0; i < 7; i++) {
          const d = w + i * DAY;
          if (rec.daysMask & (1 << wallDate(d).getUTCDay()) && inRange(d)) yield d;
        }
      }
      return;
    }
    default: {
      // 月単位（毎年は period=12 の月単位として格納される）
      const first = wallDate(rec.startDate);
      const step = Math.max(rec.period, 1);
      for (let m = 0; ; m += step) {
        const y = first.getUTCFullYear();
        const month = first.getUTCMonth() + m;
        if (fromWall(y, month, 1) > last) return;
        const d = dayInMonth(rec, y, month);
        if (d !== null && inRange(d)) yield d;
      }
    }
  }
}

function dayInMonth(rec: Recurrence, y: number, month: number): number | null {
  const daysInMonth = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  switch (rec.patternType) {
    case PatternType.Month:
    case PatternType.HjMonth:
      return fromWall(y, month, Math.min(rec.dayOfMonth, daysInMonth));
    case PatternType.MonthEnd:
    case PatternType.HjMonthEnd:
      return fromWall(y, month, daysInMonth);
    case PatternType.MonthNth:
    case PatternType.HjMonthNth: {
      const matches: number[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        if (rec.daysMask & (1 << new Date(Date.UTC(y, month, day)).getUTCDay())) matches.push(day);
      }
      const day = rec.nth >= 5 ? matches[matches.length - 1] : matches[rec.nth - 1];
      return day === undefined ? null : fromWall(y, month, day);
    }
    default:
      return null;
  }
}

// ---- タイムゾーン ----

/** 壁時計（分数）→ 実際の日時 への変換関数を作る */
function wallClockToUtc(rec: Recurrence, masterStart: Date | null, tzStruct: Buffer | null): (min: number) => Date {
  const firstWall = rec.startDate + rec.startTimeOffset;
  const tz = tzStruct && tzStruct.length >= 48 ? parseTimeZone(tzStruct) : null;
  const viaTz = tz ? (min: number) => wallDate(min + tz.biasAt(min)) : null;

  // タイムゾーン情報が予定の開始日時と整合する場合だけ使い、それ以外は固定の時差で変換する
  if (viaTz && (!masterStart || viaTz(firstWall).getTime() === masterStart.getTime())) return viaTz;
  const offset = masterStart ? toWin(masterStart) - firstWall : new Date().getTimezoneOffset();
  return (min: number) => wallDate(min + offset);
}

interface TransitionRule {
  month: number;
  dayOfWeek: number;
  /** 1〜4、5=最終 */
  week: number;
  hour: number;
  minute: number;
}

/** PidLidTimeZoneStruct ([MS-OXOCAL] 2.2.1.39) */
function parseTimeZone(buf: Buffer) {
  const bias = buf.readInt32LE(0);
  const standardBias = buf.readInt32LE(4);
  const daylightBias = buf.readInt32LE(8);
  const rule = (o: number): TransitionRule => ({
    month: buf.readUInt16LE(o + 2),
    dayOfWeek: buf.readUInt16LE(o + 4),
    week: buf.readUInt16LE(o + 6),
    hour: buf.readUInt16LE(o + 8),
    minute: buf.readUInt16LE(o + 10),
  });
  const toStandard = rule(14);
  const toDaylight = rule(32);

  const transition = (y: number, t: TransitionRule) => {
    const daysInMonth = new Date(Date.UTC(y, t.month, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(y, t.month - 1, 1)).getUTCDay();
    let day = 1 + ((t.dayOfWeek - firstDow + 7) % 7) + (t.week - 1) * 7;
    while (day > daysInMonth) day -= 7;
    return fromWall(y, t.month - 1, day) + t.hour * 60 + t.minute;
  };

  return {
    /** 壁時計に足すと UTC になる分数 */
    biasAt(min: number): number {
      if (!toDaylight.month || !toStandard.month) return bias + standardBias;
      const y = wallDate(min).getUTCFullYear();
      const dstStart = transition(y, toDaylight);
      const dstEnd = transition(y, toStandard);
      const isDst = dstStart < dstEnd ? min >= dstStart && min < dstEnd : min >= dstStart || min < dstEnd;
      return bias + (isDst ? daylightBias : standardBias);
    },
  };
}
