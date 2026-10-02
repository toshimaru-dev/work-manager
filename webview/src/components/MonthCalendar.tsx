import { useMemo, useState } from 'react';
import { Card, Flex, Table, TableBody, TableCell, TableRow, Text, Title } from '@tremor/react';
import { WorkEntry } from '@shared/types';
import { ColorDot } from './ui';
import { UNCLASSIFIED, useAppData, useProjects } from '../lib/data';
import { fmtHours, formatDay, isWeekend, monthDays, parseDateKey, todayKey, toHours } from '../lib/date';
import { sumMinutes } from '../lib/stats';

const WEEK_HEADER = ['月', '火', '水', '木', '金', '土', '日'];

/** 月曜始まりのカレンダー。各日に合計時間と案件コード別の時間を表示し、クリックで明細を表示する */

export function MonthCalendar({ month, entries }: { month: string; entries: WorkEntry[] }) {
  const { data } = useAppData();
  const projects = useProjects();
  const [selected, setSelected] = useState<string | null>(null);
  const standard = data.settings.standardHours * 60;

  const days = monthDays(month);
  const leading = (parseDateKey(days[0]).getDay() + 6) % 7; // 月曜始まり
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);

  const byDate = useMemo(() => {
    const map = new Map<string, WorkEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);

  const total = sumMinutes(entries);
  const workedDays = byDate.size;
  const selectedEntries = selected ? byDate.get(selected) ?? [] : [];

  return (
    <Card>
      <Flex className="flex-wrap gap-2">
        <Title>カレンダー</Title>
        <Text>
          合計 <span className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">{fmtHours(total)}</span>
          （稼働 {workedDays}日）
        </Text>
      </Flex>

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-tremor-default border border-tremor-border bg-tremor-border dark:border-dark-tremor-border dark:bg-dark-tremor-border">
          {WEEK_HEADER.map((w, i) => (
            <div
              key={w}
              className={`bg-tremor-background-muted py-1.5 text-center text-tremor-label font-medium dark:bg-dark-tremor-background-muted ${
                i === 5 ? 'text-blue-500' : i === 6 ? 'text-rose-500' : ''
              }`}
            >
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`b${i}`} className="min-h-[6.5rem] bg-tremor-background-muted/50 dark:bg-dark-tremor-background-muted/50" />;
            const list = byDate.get(date) ?? [];
            const dayTotal = sumMinutes(list);
            const byProject = new Map<string | null, number>();
            for (const e of list) byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + e.minutes);
            const items = [...byProject].sort((a, b) => b[1] - a[1]);
            const dow = parseDateKey(date).getDay();
            const short = !isWeekend(date) && dayTotal > 0 && dayTotal < standard;
            const isToday = date === todayKey();
            return (
              <button
                key={date}
                onClick={() => setSelected(selected === date ? null : date)}
                className={`flex min-h-[6.5rem] flex-col p-1.5 text-left transition-colors hover:bg-tremor-brand-faint dark:hover:bg-dark-tremor-brand-faint ${
                  selected === date
                    ? 'bg-tremor-brand-faint ring-2 ring-inset ring-tremor-brand dark:bg-dark-tremor-brand-faint'
                    : isWeekend(date)
                      ? 'bg-tremor-background-muted dark:bg-dark-tremor-background-muted'
                      : 'bg-tremor-background dark:bg-dark-tremor-background'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-tremor-label font-medium ${
                      isToday ? 'bg-tremor-brand text-white' : dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : ''
                    }`}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {dayTotal > 0 && (
                    <span
                      className={`text-tremor-label font-semibold tabular-nums ${
                        short ? 'text-amber-500' : 'text-tremor-content-strong dark:text-dark-tremor-content-strong'
                      }`}
                      title={short ? '所定時間に満たない日' : undefined}
                    >
                      {toHours(dayTotal)}h
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map(([pid, min]) => (
                    <div key={pid ?? 'none'} className="flex items-center gap-1 text-[11px] leading-4">
                      <ColorDot color={projects.color(pid)} />
                      <span className="truncate font-mono">{projects.get(pid)?.code ?? UNCLASSIFIED}</span>
                      <span className="ml-auto tabular-nums">{toHours(min)}</span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[11px] leading-4 text-tremor-content-subtle">+{items.length - 3}件</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mt-4">
          <Text className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
            {formatDay(selected)} の稼働（{fmtHours(sumMinutes(selectedEntries))}）
          </Text>
          {selectedEntries.length === 0 ? (
            <Text className="mt-2">稼働はありません</Text>
          ) : (
            <Table className="mt-2">
              <TableBody>
                {selectedEntries.map((e) => {
                  const wc = projects.workCode(e.workCodeId);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="w-28 whitespace-nowrap py-2">
                        {e.start}〜{e.end}
                      </TableCell>
                      <TableCell className="w-16 py-2 text-right">{fmtHours(e.minutes)}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <ColorDot color={projects.color(e.projectId)} />
                          <span className="font-mono">{projects.get(e.projectId)?.code ?? UNCLASSIFIED}</span>
                          {wc && <span className="font-mono text-tremor-content-subtle">/ {wc.code}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal py-2 text-tremor-content-strong dark:text-dark-tremor-content-strong">{e.title}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}
