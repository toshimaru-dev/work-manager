import { AppData, emptyLine, MonthlyReport, ReportLine, WorkContent, WorkEntry } from '@shared/types';
import { useProjects } from './data';

type Projects = ReturnType<typeof useProjects>;

/** 別システム入力用の 案件コード×作業コード 1行 */
export interface ReportRow {
  key: string;
  projectId: string;
  workCodeId: string | null;
  /** 予定・稼働入力から集計した時間（分） */
  aggMinutes: number;
  line: ReportLine;
  /** 作業内訳（当月未設定なら過去月から引継） */
  breakdown: WorkContent | undefined;
  inherited: boolean;
  /** 集計 + 調整（丸め前） */
  rawMinutes: number;
  /** 別システムに入力する時間（丸め後） */
  finalMinutes: number;
}

export const reportKey = (projectId: string | null, workCodeId: string | null) => `${projectId ?? ''}:${workCodeId ?? ''}`;

export const emptyReport = (): MonthlyReport => ({ lines: {}, workingHours: null });

export function roundMinutes(minutes: number, unitHours: number): number {
  const m = Math.max(0, minutes);
  if (!unitHours) return m;
  const unit = unitHours * 60;
  return Math.round(m / unit) * unit;
}

/** 当月に作業内訳が未設定なら、直近の過去月の設定を返す */
function inheritedContent(data: AppData, month: string, key: string): ReportLine | undefined {
  const past = Object.keys(data.reports)
    .filter((m) => m < month && data.reports[m].lines[key]?.breakdownCode)
    .sort()
    .pop();
  return past ? data.reports[past].lines[key] : undefined;
}

export function buildReport(data: AppData, month: string, entries: WorkEntry[], projects: Projects) {
  const report = data.reports[month] ?? emptyReport();
  const agg = new Map<string, { projectId: string; workCodeId: string | null; minutes: number }>();
  let unassignedMinutes = 0;

  for (const e of entries) {
    if (!projects.get(e.projectId)) {
      unassignedMinutes += e.minutes;
      continue;
    }
    const workCodeId = projects.hasWorkCode(e.projectId, e.workCodeId) ? e.workCodeId : null;
    const key = reportKey(e.projectId, workCodeId);
    const row = agg.get(key) ?? { projectId: e.projectId!, workCodeId, minutes: 0 };
    row.minutes += e.minutes;
    agg.set(key, row);
  }

  // 手動追加行・調整のある行は、稼働がなくても表示する
  for (const [key, line] of Object.entries(report.lines)) {
    if (agg.has(key) || (!line.manual && !line.adjustMinutes)) continue;
    const [projectId, workCodeId] = key.split(':');
    if (!projects.get(projectId)) continue;
    agg.set(key, { projectId, workCodeId: workCodeId || null, minutes: 0 });
  }

  const breakdownOf = (l: ReportLine | undefined) =>
    l ? data.workContents.find((w) => w.contentCode === l.contentCode && w.breakdownCode === l.breakdownCode) : undefined;

  const rows: ReportRow[] = [...agg.entries()].map(([key, a]) => {
    const line = { ...emptyLine(), ...report.lines[key] };
    const past = line.breakdownCode ? undefined : inheritedContent(data, month, key);
    const rawMinutes = a.minutes + line.adjustMinutes;
    return {
      key,
      ...a,
      aggMinutes: a.minutes,
      line,
      breakdown: breakdownOf(line.breakdownCode ? line : past),
      inherited: !!past,
      rawMinutes,
      finalMinutes: roundMinutes(rawMinutes, data.settings.roundingUnit),
    };
  });

  const sortKey = (r: ReportRow) => `${projects.get(r.projectId)?.code ?? ''}\u0000${projects.workCode(r.workCodeId)?.code ?? '￿'}`;
  rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return { report, rows, unassignedMinutes };
}
