// 拡張機能本体と Webview の双方で共有する型定義

export const TREMOR_COLORS = [
  'blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'indigo', 'lime', 'fuchsia', 'orange', 'teal', 'slate',
] as const;
export type TremorColor = (typeof TREMOR_COLORS)[number];

/** 案件ごとの作業コード（例: 01 設計 / 02 製造） */
export interface WorkCode {
  id: string;
  code: string;
  name: string;
  archived: boolean;
}

/** 案件コード */
export interface Project {
  id: string;
  /** 案件コード（必須・一意） */
  code: string;
  name: string;
  color: TremorColor;
  archived: boolean;
  note: string;
  workCodes: WorkCode[];
}

export type EntrySource = 'manual' | 'ics' | 'csv';

export interface WorkEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  minutes: number;
  projectId: string | null;
  workCodeId: string | null;
  title: string;
  note: string;
  source: EntrySource;
  /** 取込元イベントの識別子（重複取込の防止に使用） */
  sourceKey?: string;
}

/** 予定タイトルに含まれるキーワードから案件・作業コードを自動判定するルール */
export interface MappingRule {
  id: string;
  keyword: string;
  projectId: string;
  workCodeId: string | null;
}

/** 作業内容マスタ（CSV: 作業内容コード, 作業内容名称, 作業内訳コード, 作業内訳名称） */
export interface WorkContent {
  contentCode: string;
  contentName: string;
  breakdownCode: string;
  breakdownName: string;
}

/** 月次報告（別システム入力用）の 案件×作業コード 1行分の設定 */
export interface ReportLine {
  /** 作業内容コード（作業内訳の親） */
  contentCode: string;
  /** 作業内訳コード */
  breakdownCode: string;
  /** 手動調整（分）。予定から集計した時間に加算する */
  adjustMinutes: number;
  /** 別システムへ入力済み */
  done: boolean;
  /** 稼働がなくても表示する手動追加行 */
  manual: boolean;
}

export interface MonthlyReport {
  /** キー: `${案件ID}:${作業コードID}` */
  lines: Record<string, ReportLine>;
  /** 勤怠上の月間総労働時間（時間）。入力合計との差の確認用 */
  workingHours: number | null;
}

export const emptyLine = (): ReportLine => ({ contentCode: '', breakdownCode: '', adjustMinutes: 0, done: false, manual: false });

export type GoalStatus = 'notStarted' | 'onTrack' | 'atRisk' | 'done';

export interface GoalUpdate {
  date: string;
  progress: number;
  note: string;
}

export interface Goal {
  id: string;
  title: string;
  category: string;
  /** 評価期間 例: 2026年度上期 */
  period: string;
  /** ウェイト(%) */
  weight: number;
  /** 達成基準 */
  criteria: string;
  dueDate: string;
  progress: number;
  status: GoalStatus;
  updates: GoalUpdate[];
}

export interface Settings {
  /** 1日の所定労働時間(時間) */
  standardHours: number;
  /** 取込時に除外する予定タイトルのキーワード */
  excludeKeywords: string[];
  /** 終日予定を所定労働時間分の稼働として取り込むか */
  includeAllDay: boolean;
  /** 月次報告の稼働時間の丸め単位（時間）。0 は丸めなし */
  roundingUnit: number;
}

export interface AppData {
  version: 3;
  projects: Project[];
  entries: WorkEntry[];
  rules: MappingRule[];
  workContents: WorkContent[];
  /** YYYY-MM → 月次報告 */
  reports: Record<string, MonthlyReport>;
  goals: Goal[];
  settings: Settings;
}

/** ICS / CSV から読み込んだ予定（まだ稼働として保存されていないもの） */
export interface CalendarEvent {
  key: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  title: string;
  allDay: boolean;
  location: string;
}

export const DEFAULT_DATA: AppData = {
  version: 3,
  projects: [],
  entries: [],
  rules: [],
  workContents: [],
  reports: {},
  goals: [],
  settings: {
    standardHours: 8,
    excludeKeywords: ['休暇', '昼休み', 'ランチ'],
    includeAllDay: false,
    roundingUnit: 0.1,
  },
};

/** 旧バージョンの保存データを現在の形式に揃える */
type LegacyData = Partial<AppData> & {
  /** v2: 月ごとの作業内容・内訳の選択 */
  monthlyAssignments?: Record<string, Record<string, { contentCode: string; breakdownCode: string }>>;
};

export function normalizeData(saved: LegacyData | undefined): AppData {
  const { monthlyAssignments, ...rest } = saved ?? {};
  const d = { ...DEFAULT_DATA, ...rest };
  const reports: Record<string, MonthlyReport> = { ...d.reports };
  for (const [month, lines] of Object.entries(monthlyAssignments ?? {})) {
    reports[month] ??= { lines: {}, workingHours: null };
    for (const [key, a] of Object.entries(lines)) reports[month].lines[key] ??= { ...emptyLine(), ...a };
  }
  return {
    ...d,
    version: 3,
    reports,
    projects: d.projects.map((p) => ({ ...p, code: p.code ?? '', note: p.note ?? '', workCodes: p.workCodes ?? [] })),
    entries: d.entries.map((e) => ({ ...e, workCodeId: e.workCodeId ?? null })),
    rules: d.rules.map((r) => ({ ...r, workCodeId: r.workCodeId ?? null })),
    settings: { ...DEFAULT_DATA.settings, ...saved?.settings },
  };
}

// ---- Webview <-> 拡張機能 メッセージ ----

export type DataKey = Exclude<keyof AppData, 'version'>;

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'save'; key: DataKey; value: AppData[DataKey] }
  | { type: 'pickCalendarFile'; rangeStart: string; rangeEnd: string }
  | { type: 'pickWorkContentCsv' }
  | { type: 'exportCsv'; fileName: string; content: string }
  | { type: 'copyText'; text: string; label: string }
  | { type: 'notify'; level: 'info' | 'warn' | 'error'; message: string };

export type ExtensionToWebview =
  | { type: 'data'; data: AppData }
  | { type: 'calendarEvents'; fileName: string; events: CalendarEvent[] }
  | { type: 'calendarError'; message: string }
  | { type: 'workContents'; fileName: string; rows: WorkContent[] }
  | { type: 'workContentsError'; message: string };
