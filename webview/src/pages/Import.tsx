import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from '@tremor/react';
import { RiDownload2Line, RiErrorWarningLine, RiFolderOpenLine, RiQuestionLine } from '@remixicon/react';
import { CalendarEvent, MappingRule, Settings, WorkEntry } from '@shared/types';
import { CodeSelect } from '../components/codeSelect';
import { EmptyState, Field, NativeInput, PageHeader } from '../components/ui';
import { uid, useAppData } from '../lib/data';
import { currentMonth, fmtHours, formatDay, monthFirstDay, monthLastDay } from '../lib/date';
import { onMessage, postMessage } from '../lib/vscode';

type Status = 'new' | 'imported' | 'excluded';

interface Row extends CalendarEvent {
  status: Status;
  reason?: string;
}

function classify(e: CalendarEvent, importedKeys: Set<string>, settings: Settings): Row {
  if (importedKeys.has(e.key)) return { ...e, status: 'imported' };
  if (e.allDay) {
    if (!settings.includeAllDay) return { ...e, status: 'excluded', reason: '終日' };
    // 終日予定は所定労働時間分（9:00 開始）の稼働として扱う
    const minutes = Math.round(settings.standardHours * 60);
    const endMin = 9 * 60 + minutes;
    const end = `${String(Math.min(23, Math.floor(endMin / 60))).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    e = { ...e, start: '09:00', end, minutes };
  }
  const kw = settings.excludeKeywords.find((k) => k && e.title.includes(k));
  if (kw) return { ...e, status: 'excluded', reason: `除外: ${kw}` };
  if (e.minutes === 0) return { ...e, status: 'excluded', reason: '0分' };
  return { ...e, status: 'new' };
}

interface Assignment {
  projectId: string | null;
  workCodeId: string | null;
}

const NONE: Assignment = { projectId: null, workCodeId: null };

function matchRule(title: string, rules: MappingRule[]): Assignment {
  const lower = title.toLowerCase();
  const rule = rules.find((r) => r.keyword && lower.includes(r.keyword.toLowerCase()));
  return rule ? { projectId: rule.projectId, workCodeId: rule.workCodeId } : NONE;
}

export function Import() {
  const { data, save, notify } = useAppData();
  const [rangeStart, setRangeStart] = useState(monthFirstDay(currentMonth()));
  const [rangeEnd, setRangeEnd] = useState(monthLastDay(currentMonth()));
  const [file, setFile] = useState<{ name: string; events: CalendarEvent[] } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Record<string, Assignment>>({});
  const [bulk, setBulk] = useState<Assignment>(NONE);
  const [showExcluded, setShowExcluded] = useState(false);

  const importedKeys = useMemo(
    () => new Set(data.entries.map((e) => e.sourceKey).filter((k): k is string => !!k)),
    [data.entries],
  );

  const rows = useMemo(
    () => (file?.events ?? []).map((e) => classify(e, importedKeys, data.settings)),
    [file, importedKeys, data.settings],
  );
  const visibleRows = showExcluded ? rows : rows.filter((r) => r.status === 'new');

  useEffect(
    () =>
      onMessage((m) => {
        if (m.type === 'calendarEvents') {
          setError('');
          setFile({ name: m.fileName, events: m.events });
        } else if (m.type === 'calendarError') {
          setError(m.message);
        }
      }),
    [],
  );

  // ファイルを読み込んだら、新規の予定を選択し、ルールで案件を自動割当
  useEffect(() => {
    if (!file) return;
    const initial = file.events.map((e) => classify(e, importedKeys, data.settings));
    setSelected(new Set(initial.filter((r) => r.status === 'new').map((r) => r.key)));
    setAssign(Object.fromEntries(file.events.map((e) => [e.key, matchRule(e.title, data.rules)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const selectable = visibleRows.filter((r) => r.status !== 'imported');
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.key));
  const selectedRows = rows.filter((r) => selected.has(r.key) && r.status !== 'imported');
  const selectedMinutes = selectedRows.reduce((s, r) => s + r.minutes, 0);

  const bulkAssign = () => {
    const next = { ...assign };
    for (const r of selectedRows) next[r.key] = bulk;
    setAssign(next);
  };

  const runImport = () => {
    const source = file?.name.toLowerCase().endsWith('.csv') ? 'csv' : 'ics';
    const newEntries: WorkEntry[] = selectedRows.map((r) => ({
      id: uid(),
      date: r.date,
      start: r.start,
      end: r.end,
      minutes: r.minutes,
      projectId: assign[r.key]?.projectId ?? null,
      workCodeId: assign[r.key]?.workCodeId ?? null,
      title: r.title,
      note: r.location,
      source,
      sourceKey: r.key,
    }));
    save('entries', [...data.entries, ...newEntries]);
    setSelected(new Set());
    notify(`${newEntries.length}件の予定を稼働として取り込みました（${fmtHours(selectedMinutes)}）。`);
  };

  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    imported: rows.filter((r) => r.status === 'imported').length,
    excluded: rows.filter((r) => r.status === 'excluded').length,
  };

  return (
    <div>
      <PageHeader title="予定取込" description="予定表 (ICS / CSV / PST) を読み込み、選択した予定を稼働として登録します。" />

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="取込期間（開始）">
            <NativeInput type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </Field>
          <Field label="取込期間（終了）">
            <NativeInput type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </Field>
          <Button icon={RiFolderOpenLine} onClick={() => postMessage({ type: 'pickCalendarFile', rangeStart, rangeEnd })}>
            ファイルを選択して読み込む
          </Button>
        </div>
        {error && (
          <Callout title="読み込みに失敗しました" icon={RiErrorWarningLine} color="rose" className="mt-4">
            {error}
          </Callout>
        )}
        <details className="mt-4 text-tremor-default">
          <summary className="flex cursor-pointer items-center gap-1 text-tremor-brand">
            <RiQuestionLine className="h-4 w-4" /> 予定表ファイルの書き出し方法
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <b>Google カレンダー</b>: 設定 → インポート/エクスポート → エクスポート（ZIP 内の .ics を選択）
            </li>
            <li>
              <b>Outlook（クラシック）</b>: ファイル → 開く/エクスポート → インポート/エクスポート → ファイルにエクスポート →
              テキスト ファイル (CSV)。または予定表を「名前を付けて保存」で .ics
            </li>
            <li>
              <b>新しい Outlook</b>: PST ファイルにエクスポートし、その .pst を選択（メールも含まれますが、予定表だけを読み込みます）
            </li>
            <li>
              <b>独自 CSV</b>: 「日付, 開始, 終了, タイトル」の列名を持つ CSV（例: <code>2026/10/02,09:00,10:30,定例会議</code>）
            </li>
          </ul>
        </details>
      </Card>

      {file && (
        <Card className="mt-4">
          <Flex className="flex-wrap gap-4">
            <div>
              <Title>{file.name}</Title>
              <Text>
                新規 {counts.new}件 / 取込済 {counts.imported}件 / 除外 {counts.excluded}件
              </Text>
            </div>
            <label className="flex items-center gap-2 text-tremor-default">
              <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} className="rounded" />
              取込済・除外の予定も表示
            </label>
          </Flex>

          <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-tremor-default bg-tremor-brand-faint p-3 dark:bg-dark-tremor-brand-faint">
            <Text className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
              選択 {selectedRows.length}件（{fmtHours(selectedMinutes)}）
            </Text>
            <div className="flex flex-wrap items-center gap-2">
              <CodeSelect compact projectId={bulk.projectId} workCodeId={bulk.workCodeId} onChange={(projectId, workCodeId) => setBulk({ projectId, workCodeId })} />
              <Button size="xs" variant="secondary" onClick={bulkAssign} disabled={selectedRows.length === 0}>
                選択した予定に一括設定
              </Button>
            </div>
            <Button icon={RiDownload2Line} onClick={runImport} disabled={selectedRows.length === 0} className="ml-auto">
              選択した予定を取り込む
            </Button>
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState>指定期間に取り込める予定はありません</EmptyState>
          ) : (
            <Table className="mt-2 max-h-[60vh]">
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-8">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.key)))}
                    />
                  </TableHeaderCell>
                  <TableHeaderCell>日付</TableHeaderCell>
                  <TableHeaderCell>時間帯</TableHeaderCell>
                  <TableHeaderCell className="text-right">時間</TableHeaderCell>
                  <TableHeaderCell>件名</TableHeaderCell>
                  <TableHeaderCell>案件コード / 作業コード</TableHeaderCell>
                  <TableHeaderCell>状態</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((r) => (
                  <TableRow key={r.key} className={r.status === 'imported' ? 'opacity-50' : ''}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="rounded"
                        disabled={r.status === 'imported'}
                        checked={selected.has(r.key)}
                        onChange={() => toggle(r.key)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDay(r.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.allDay ? (r.minutes ? `終日 (${r.start}〜${r.end})` : '終日') : `${r.start}〜${r.end}`}</TableCell>
                    <TableCell className="text-right">{fmtHours(r.minutes)}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-tremor-content-strong dark:text-dark-tremor-content-strong">
                      {r.title}
                    </TableCell>
                    <TableCell>
                      <CodeSelect
                        compact
                        disabled={r.status === 'imported'}
                        projectId={assign[r.key]?.projectId ?? null}
                        workCodeId={assign[r.key]?.workCodeId ?? null}
                        onChange={(projectId, workCodeId) => setAssign({ ...assign, [r.key]: { projectId, workCodeId } })}
                      />
                    </TableCell>
                    <TableCell>
                      {r.status === 'new' && <Badge size="xs" color="emerald">新規</Badge>}
                      {r.status === 'imported' && <Badge size="xs" color="gray">取込済</Badge>}
                      {r.status === 'excluded' && <Badge size="xs" color="amber">{r.reason}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
