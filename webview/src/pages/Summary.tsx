import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Metric,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableFooterCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  Title,
} from '@tremor/react';
import {
  RiAddLine,
  RiArrowGoBackLine,
  RiCheckLine,
  RiClipboardLine,
  RiErrorWarningLine,
  RiFileDownloadLine,
  RiInformationLine,
} from '@remixicon/react';
import { emptyLine, ReportLine, WorkContent, WorkEntry } from '@shared/types';
import { CodeSelect } from '../components/codeSelect';
import { MonthCalendar } from '../components/MonthCalendar';
import { ColorDot, ConfirmButton, EmptyState, Field, MonthPicker, NativeInput, NativeSelect, PageHeader } from '../components/ui';
import { useAppData, useProjects } from '../lib/data';
import { businessDays, fmtHours, toHours } from '../lib/date';
import { MonthProps, TAB } from '../lib/nav';
import { buildReport, emptyReport, reportKey, ReportRow } from '../lib/report';
import { postMessage } from '../lib/vscode';

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

const ROUNDING_OPTIONS = [
  { value: 0, label: '丸めなし' },
  { value: 0.1, label: '0.1h 単位' },
  { value: 0.25, label: '0.25h 単位' },
  { value: 0.5, label: '0.5h 単位' },
  { value: 1, label: '1h 単位' },
];

/** 調整（分）の表示: +1.5 / -0.5 */
const fmtAdjust = (m: number) => (m > 0 ? `+${toHours(m)}` : `${toHours(m)}`);

export function Summary({ month, onMonthChange, onNavigate }: MonthProps & { onNavigate: (tab: number) => void }) {
  const { data } = useAppData();
  const entries = useMemo(
    () => data.entries.filter((e) => e.date.startsWith(month)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [data.entries, month],
  );

  return (
    <div>
      <PageHeader
        title="月次集計"
        description="別システムに入力する「案件コード・作業コード・作業内訳名称・稼働時間」を月ごとにまとめます。"
        actions={<MonthPicker month={month} onChange={onMonthChange} />}
      />
      <MonthlyReportView month={month} entries={entries} onNavigate={onNavigate} />
      <div className="mt-4">
        <MonthCalendar month={month} entries={entries} />
      </div>
    </div>
  );
}

// ---------------- 別システム入力用の一覧 ----------------

function MonthlyReportView({ month, entries, onNavigate }: { month: string; entries: WorkEntry[]; onNavigate: (tab: number) => void }) {
  const { data, save, notify } = useAppData();
  const projects = useProjects();
  const [addProject, setAddProject] = useState<string | null>(null);
  const [addWork, setAddWork] = useState<string | null>(null);

  const { report, rows, unassignedMinutes } = useMemo(() => buildReport(data, month, entries, projects), [data, month, entries, projects]);

  // 作業内容ごとにまとめた作業内訳（select の optgroup 用）
  const contentGroups = useMemo(() => {
    const map = new Map<string, { code: string; name: string; items: WorkContent[] }>();
    for (const w of data.workContents) {
      const g = map.get(w.contentCode) ?? { code: w.contentCode, name: w.contentName, items: [] };
      g.items.push(w);
      map.set(w.contentCode, g);
    }
    return [...map.values()];
  }, [data.workContents]);

  const saveReport = (lines: Record<string, ReportLine>, workingHours = report.workingHours) =>
    save('reports', { ...data.reports, [month]: { lines, workingHours } });

  const updateLine = (row: ReportRow, patch: Partial<ReportLine>) => {
    // 引継中の作業内訳は、この月の設定として確定させる
    const inherited = row.inherited && row.breakdown ? { contentCode: row.breakdown.contentCode, breakdownCode: row.breakdown.breakdownCode } : {};
    saveReport({ ...report.lines, [row.key]: { ...emptyLine(), ...report.lines[row.key], ...inherited, ...patch } });
  };

  const removeLine = (key: string) => {
    const { [key]: _removed, ...lines } = report.lines;
    saveReport(lines);
  };

  const addRow = () => {
    if (!addProject) return;
    const key = reportKey(addProject, addWork);
    if (rows.some((r) => r.key === key)) return notify('その案件コード・作業コードの行は既にあります。', 'warn');
    saveReport({ ...report.lines, [key]: { ...emptyLine(), ...report.lines[key], manual: true } });
    setAddProject(null);
    setAddWork(null);
  };

  // 集計値
  const aggTotal = rows.reduce((s, r) => s + r.aggMinutes, 0);
  const finalTotal = rows.reduce((s, r) => s + r.finalMinutes, 0);
  const adjustTotal = finalTotal - aggTotal;
  const expectedHours = businessDays(month) * data.settings.standardHours;
  const workingMinutes = (report.workingHours ?? expectedHours) * 60;
  const diff = workingMinutes - finalTotal;
  const outputRows = rows.filter((r) => r.finalMinutes > 0);
  const doneCount = outputRows.filter((r) => r.line.done).length;
  const needsWorkCode = (r: ReportRow) => !r.workCodeId && !!projects.get(r.projectId)?.workCodes.some((w) => !w.archived);
  const missingBreakdown = outputRows.filter((r) => !r.breakdown).length;
  const missingWorkCode = outputRows.filter(needsWorkCode).length;

  const HEADER = ['案件コード', '作業コード', '作業内訳名称', '稼働時間'];
  const exportValues = (r: ReportRow) => [
    projects.get(r.projectId)?.code ?? '',
    projects.workCode(r.workCodeId)?.code ?? '',
    r.breakdown?.breakdownName ?? '',
    toHours(r.finalMinutes),
  ];

  const copyTable = () => {
    const text = [HEADER, ...outputRows.map(exportValues)].map((r) => r.join('\t')).join('\n');
    postMessage({ type: 'copyText', text, label: `${outputRows.length}行（Excel に貼り付けできます）` });
  };

  const exportCsv = () =>
    postMessage({ type: 'exportCsv', fileName: `稼働報告_${month}.csv`, content: toCsv([HEADER, ...outputRows.map(exportValues)]) });

  const exportDetail = () => {
    const header = ['日付', '開始', '終了', '時間(h)', '案件コード', '案件名', '作業コード', '作業名', '件名', 'メモ'];
    const body = entries.map((e) => [
      e.date,
      e.start,
      e.end,
      toHours(e.minutes),
      projects.get(e.projectId)?.code ?? '',
      projects.name(e.projectId),
      projects.workCode(e.workCodeId)?.code ?? '',
      projects.workCode(e.workCodeId)?.name ?? '',
      e.title,
      e.note,
    ]);
    postMessage({ type: 'exportCsv', fileName: `稼働明細_${month}.csv`, content: toCsv([header, ...body]) });
  };

  return (
    <>
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <Card decoration="top" decorationColor="blue">
          <Text>入力合計（別システムへ）</Text>
          <Metric>{fmtHours(finalTotal)}</Metric>
          <Text className="mt-2">
            予定からの集計 {fmtHours(aggTotal)}
            {adjustTotal !== 0 && <span className={adjustTotal > 0 ? 'text-blue-500' : 'text-amber-500'}>（調整 {fmtAdjust(adjustTotal)}h）</span>}
          </Text>
        </Card>
        <Card decoration="top" decorationColor={Math.abs(diff) < 1 ? 'emerald' : 'amber'}>
          <Field label="勤怠の総労働時間（h）">
            <NativeInput
              key={`${month}-${report.workingHours}`}
              type="number"
              step={0.1}
              min={0}
              defaultValue={report.workingHours ?? ''}
              placeholder={`所定 ${expectedHours}`}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                if (v !== report.workingHours) saveReport(report.lines, v);
              }}
              className="w-32 py-1"
            />
          </Field>
          <Text className="mt-2">
            {Math.abs(diff) < 1 ? (
              <span className="text-emerald-600 dark:text-emerald-400">勤怠と一致しています</span>
            ) : diff > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">あと {fmtHours(diff)} 不足（手動で調整してください）</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">{fmtHours(-diff)} 超過しています</span>
            )}
            {report.workingHours === null && <span className="block text-tremor-label">※未入力のため所定時間と比較</span>}
          </Text>
        </Card>
        <Card decoration="top" decorationColor="violet">
          <Text>別システムへの入力状況</Text>
          <Metric>
            {doneCount} / {outputRows.length}
          </Metric>
          <ProgressBar value={outputRows.length ? (doneCount / outputRows.length) * 100 : 0} color="violet" className="mt-3" />
        </Card>
        <Card decoration="top" decorationColor={missingBreakdown || missingWorkCode || unassignedMinutes ? 'amber' : 'emerald'}>
          <Text>未設定の項目</Text>
          <div className="mt-2 space-y-1 text-tremor-default">
            <div>作業内訳 未設定: {missingBreakdown}行</div>
            <div>作業コード 未設定: {missingWorkCode}行</div>
            <div>案件コード 未設定の稼働: {fmtHours(unassignedMinutes)}</div>
          </div>
        </Card>
      </Grid>

      <Card className="mt-4">
        <Flex className="flex-wrap gap-3" alignItems="start">
          <div>
            <Title>別システム入力用</Title>
            <Text>値をクリックするとコピーできます。稼働時間は直接書き換えて微調整できます（予定からの集計との差は「調整」に記録）。</Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={data.settings.roundingUnit}
              onChange={(e) => save('settings', { ...data.settings, roundingUnit: Number(e.target.value) })}
              className="w-32 py-1.5"
              title="稼働時間の丸め単位"
            >
              {ROUNDING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="secondary" icon={RiClipboardLine} onClick={copyTable} disabled={!outputRows.length}>
              表をコピー
            </Button>
            <Button variant="secondary" icon={RiFileDownloadLine} onClick={exportCsv} disabled={!outputRows.length}>
              CSV
            </Button>
            <Button variant="light" icon={RiFileDownloadLine} onClick={exportDetail} disabled={!entries.length}>
              明細 CSV
            </Button>
          </div>
        </Flex>

        {data.workContents.length === 0 && (
          <Callout title="作業内容マスタが未登録です" icon={RiInformationLine} color="blue" className="mt-4">
            「コード管理」タブで作業内容マスタの CSV を読み込むと、作業内訳を選択できるようになります。
            <span className="mt-2 block">
              <Button size="xs" onClick={() => onNavigate(TAB.codes)}>
                コード管理を開く
              </Button>
            </span>
          </Callout>
        )}
        {unassignedMinutes > 0 && (
          <Callout title={`案件コードが未設定の稼働が ${fmtHours(unassignedMinutes)} あります`} icon={RiErrorWarningLine} color="amber" className="mt-4">
            この時間は一覧に含まれていません。「稼働入力」タブで案件コードを設定してください。
            <span className="mt-2 block">
              <Button size="xs" variant="secondary" onClick={() => onNavigate(TAB.entries)}>
                稼働入力を開く
              </Button>
            </span>
          </Callout>
        )}

        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState>この月の稼働はありません。下の「行を追加」から手動で追加できます。</EmptyState>
          </div>
        ) : (
          <Table className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-16 text-center">入力済</TableHeaderCell>
                <TableHeaderCell>案件コード</TableHeaderCell>
                <TableHeaderCell>作業コード</TableHeaderCell>
                <TableHeaderCell>作業内訳名称</TableHeaderCell>
                <TableHeaderCell className="text-right">集計</TableHeaderCell>
                <TableHeaderCell className="text-right">調整</TableHeaderCell>
                <TableHeaderCell className="text-right">稼働時間</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const p = projects.get(r.projectId)!;
                const w = projects.workCode(r.workCodeId);
                return (
                  <TableRow key={r.key} className={r.line.done ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded text-emerald-600"
                        checked={r.line.done}
                        onChange={(e) => updateLine(r, { done: e.target.checked })}
                        aria-label="入力済"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ColorDot color={p.color} />
                        <CopyValue value={p.code} />
                      </div>
                      <div className="ml-[18px] max-w-[14rem] truncate text-tremor-label" title={p.name}>
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {w ? (
                        <>
                          <CopyValue value={w.code} />
                          <div className="text-tremor-label">{w.name}</div>
                        </>
                      ) : needsWorkCode(r) ? (
                        <Badge size="xs" color="amber">
                          未設定
                        </Badge>
                      ) : (
                        <span className="text-tremor-content-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <NativeSelect
                          value={r.breakdown ? `${r.breakdown.contentCode}|${r.breakdown.breakdownCode}` : ''}
                          disabled={contentGroups.length === 0}
                          onChange={(e) => {
                            const [contentCode = '', breakdownCode = ''] = e.target.value.split('|');
                            updateLine(r, { contentCode, breakdownCode });
                          }}
                          className={`w-60 py-1 ${r.inherited ? 'italic' : ''} ${r.breakdown ? '' : 'border-amber-400 dark:border-amber-600'}`}
                        >
                          <option value="">作業内訳を選択…</option>
                          {contentGroups.map((g) => (
                            <optgroup key={g.code} label={`${g.code} ${g.name}`}>
                              {g.items.map((b) => (
                                <option key={b.breakdownCode} value={`${b.contentCode}|${b.breakdownCode}`}>
                                  {b.breakdownCode} {b.breakdownName}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </NativeSelect>
                        {r.breakdown && <CopyValue value={r.breakdown.breakdownName} icon />}
                        {r.inherited && (
                          <Badge size="xs" color="gray" tooltip="前月までの設定を引き継いでいます">
                            引継
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{toHours(r.aggMinutes)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.line.adjustMinutes ? (
                        <span className={r.line.adjustMinutes > 0 ? 'text-blue-500' : 'text-amber-500'}>{fmtAdjust(r.line.adjustMinutes)}</span>
                      ) : (
                        <span className="text-tremor-content-subtle">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <HoursInput
                          minutes={r.finalMinutes}
                          step={data.settings.roundingUnit || 0.1}
                          onCommit={(minutes) => updateLine(r, { adjustMinutes: minutes - r.aggMinutes })}
                        />
                        <CopyValue value={String(toHours(r.finalMinutes))} icon />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {r.line.adjustMinutes !== 0 && (
                        <Button size="xs" variant="light" icon={RiArrowGoBackLine} tooltip="調整を戻す" onClick={() => updateLine(r, { adjustMinutes: 0 })} />
                      )}
                      {r.aggMinutes === 0 && <ConfirmButton label="行を削除" onConfirm={() => removeLine(r.key)} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFoot>
              <TableRow>
                <TableFooterCell />
                <TableFooterCell>合計</TableFooterCell>
                <TableFooterCell />
                <TableFooterCell />
                <TableFooterCell className="text-right tabular-nums">{toHours(aggTotal)}</TableFooterCell>
                <TableFooterCell className="text-right tabular-nums">{adjustTotal ? fmtAdjust(adjustTotal) : '—'}</TableFooterCell>
                <TableFooterCell className="pr-12 text-right tabular-nums">{toHours(finalTotal)}</TableFooterCell>
                <TableFooterCell />
              </TableRow>
            </TableFoot>
          </Table>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-tremor-default border border-dashed border-tremor-border p-3 dark:border-dark-tremor-border">
          <Field label="Outlook にない稼働の行を追加">
            <CodeSelect
              compact
              projectId={addProject}
              workCodeId={addWork}
              emptyLabel="案件コードを選択…"
              onChange={(p, w) => {
                setAddProject(p);
                setAddWork(w);
              }}
            />
          </Field>
          <Button size="xs" variant="secondary" icon={RiAddLine} onClick={addRow} disabled={!addProject}>
            行を追加
          </Button>
          <Text className="text-tremor-label">追加した行に稼働時間を入力してください。</Text>
        </div>
      </Card>
    </>
  );
}

/** クリックでクリップボードにコピーする値 */
function CopyValue({ value, icon }: { value: string; icon?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    postMessage({ type: 'copyText', text: value, label: value });
    setCopied(true);
  };
  const Icon = copied ? RiCheckLine : RiClipboardLine;
  if (icon) {
    return (
      <button
        onClick={copy}
        title={`「${value}」をコピー`}
        className="rounded p-1 text-tremor-content-subtle hover:bg-tremor-background-subtle hover:text-tremor-brand dark:hover:bg-dark-tremor-background-subtle"
      >
        <Icon className={`h-4 w-4 ${copied ? 'text-emerald-500' : ''}`} />
      </button>
    );
  }
  return (
    <button
      onClick={copy}
      title="クリックでコピー"
      className="group inline-flex items-center gap-1 rounded px-1 font-mono font-semibold text-tremor-content-strong hover:bg-tremor-brand-faint dark:text-dark-tremor-content-strong dark:hover:bg-dark-tremor-brand-faint"
    >
      {value}
      <Icon className={`h-3.5 w-3.5 ${copied ? 'text-emerald-500' : 'opacity-0 group-hover:opacity-60'}`} />
    </button>
  );
}

/** 稼働時間（h）の入力。フォーカスが外れたとき・Enter で確定 */
function HoursInput({ minutes, step, onCommit }: { minutes: number; step: number; onCommit: (minutes: number) => void }) {
  const commit = (v: string) => {
    const h = Number(v);
    if (v === '' || Number.isNaN(h) || h < 0) return;
    const m = Math.round(h * 60);
    if (m !== minutes) onCommit(m);
  };
  return (
    <NativeInput
      key={minutes}
      type="number"
      min={0}
      step={step}
      defaultValue={toHours(minutes)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-24 py-1 text-right font-semibold tabular-nums"
    />
  );
}
