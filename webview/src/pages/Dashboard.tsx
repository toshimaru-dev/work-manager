import { useMemo } from 'react';
import {
  Badge,
  BarChart,
  Button,
  Callout,
  Card,
  DonutChart,
  Flex,
  Grid,
  List,
  ListItem,
  Metric,
  ProgressBar,
  ProgressCircle,
  Text,
  Title,
} from '@tremor/react';
import { RiInformationLine } from '@remixicon/react';
import { MonthProps, TAB } from '../lib/nav';
import { ColorDot, EmptyState, MonthPicker, PageHeader } from '../components/ui';
import { UNCLASSIFIED, useAppData, useProjects } from '../lib/data';
import { businessDays, currentMonth, fmtHours, monthDays, todayKey, toHours, weekRange } from '../lib/date';
import { GOAL_STATUS, minutesByProject, sumMinutes, weightedProgress } from '../lib/stats';

export function Dashboard({ month, onMonthChange, onNavigate }: MonthProps & { onNavigate: (tab: number) => void }) {
  const { data } = useAppData();
  const projects = useProjects();

  const stats = useMemo(() => {
    const entries = data.entries.filter((e) => e.date.startsWith(month));
    const total = sumMinutes(entries);
    const expected = businessDays(month) * data.settings.standardHours * 60;
    const workedDays = new Set(entries.map((e) => e.date)).size;

    const [ws, we] = weekRange(todayKey());
    const week = sumMinutes(data.entries.filter((e) => e.date >= ws && e.date <= we));
    const unclassified = sumMinutes(entries.filter((e) => !projects.get(e.projectId)));

    // 案件別の内訳（時間の多い順）
    const byProject = [...minutesByProject(entries)]
      .map(([id, minutes]) => ({ id, name: projects.label(id), color: projects.color(id), minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    // 日別×案件の積み上げ棒グラフ用データ
    const categories = byProject.map((p) => p.name);
    const daily = monthDays(month).map((date) => {
      const row: Record<string, string | number> = { date: `${Number(date.slice(8))}日` };
      for (const p of byProject) row[p.name] = 0;
      for (const e of entries.filter((x) => x.date === date)) {
        const name = projects.label(e.projectId);
        row[name] = toHours((row[name] as number) * 60 + e.minutes);
      }
      return row;
    });

    return { total, expected, workedDays, week, unclassified, byProject, categories, daily };
  }, [data, month, projects]);

  const goals = data.goals;
  const goalProgress = weightedProgress(goals);
  const isCurrent = month === currentMonth();

  return (
    <div>
      <PageHeader
        title="ダッシュボード"
        description="稼働状況と人事目標の進捗をひと目で確認できます。"
        actions={<MonthPicker month={month} onChange={onMonthChange} />}
      />

      {data.projects.length === 0 && (
        <Callout title="はじめに" icon={RiInformationLine} color="blue" className="mb-6">
          まず「コード管理」タブで案件コード・作業コードを登録し、「予定取込」タブから予定表 (ICS / CSV) を取り込んでください。
          <span className="mt-3 block">
            <Button size="xs" onClick={() => onNavigate(TAB.codes)}>
              案件コードを登録する
            </Button>
          </span>
        </Callout>
      )}

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
        <Card decoration="top" decorationColor="blue">
          <Text>月間稼働</Text>
          <Metric>{fmtHours(stats.total)}</Metric>
          <Flex className="mt-4">
            <Text>所定 {fmtHours(stats.expected)}</Text>
            <Text>{stats.expected ? Math.round((stats.total / stats.expected) * 100) : 0}%</Text>
          </Flex>
          <ProgressBar value={stats.expected ? Math.min(100, (stats.total / stats.expected) * 100) : 0} className="mt-2" />
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Text>{isCurrent ? '今週の稼働' : '稼働日数'}</Text>
          <Metric>{isCurrent ? fmtHours(stats.week) : `${stats.workedDays}日`}</Metric>
          <Text className="mt-4">
            1日平均 {stats.workedDays ? fmtHours(stats.total / stats.workedDays) : '-'}（{stats.workedDays}日）
          </Text>
        </Card>
        <Card decoration="top" decorationColor={stats.unclassified ? 'amber' : 'gray'}>
          <Text>案件コード未設定の稼働</Text>
          <Metric>{fmtHours(stats.unclassified)}</Metric>
          <Text className="mt-4">
            {stats.unclassified ? (
              <button className="text-tremor-brand underline" onClick={() => onNavigate(TAB.entries)}>
                案件コードを設定する
              </button>
            ) : (
              'すべて案件コード設定済み'
            )}
          </Text>
        </Card>
        <Card decoration="top" decorationColor="violet">
          <Flex alignItems="start">
            <div>
              <Text>人事目標の進捗</Text>
              <Metric>{goalProgress}%</Metric>
              <Text className="mt-4">{goals.length}件の目標（加重平均）</Text>
            </div>
            <ProgressCircle value={goalProgress} size="md" color="violet" />
          </Flex>
        </Card>
      </Grid>

      <Grid numItemsLg={3} className="mt-4 gap-4">
        <Card className="lg:col-span-2">
          <Title>日別稼働</Title>
          {stats.total ? (
            <BarChart
              className="mt-4 h-72"
              data={stats.daily}
              index="date"
              categories={stats.categories}
              colors={stats.byProject.map((p) => p.color)}
              stack
              valueFormatter={(v) => `${v}h`}
              yAxisWidth={40}
            />
          ) : (
            <EmptyState>この月の稼働データはありません</EmptyState>
          )}
        </Card>
        <Card>
          <Title>案件別の内訳</Title>
          {stats.total ? (
            <>
              <DonutChart
                className="mt-6 h-40"
                data={stats.byProject.map((p) => ({ name: p.name, hours: toHours(p.minutes) }))}
                category="hours"
                index="name"
                colors={stats.byProject.map((p) => p.color)}
                valueFormatter={(v) => `${v}h`}
                label={fmtHours(stats.total)}
              />
              <List className="mt-6">
                {stats.byProject.map((p) => (
                  <ListItem key={p.id ?? UNCLASSIFIED}>
                    <Flex justifyContent="start" className="gap-2 truncate">
                      <ColorDot color={p.color} />
                      <span className="truncate">{p.name}</span>
                    </Flex>
                    <span className="whitespace-nowrap">
                      {fmtHours(p.minutes)}（{Math.round((p.minutes / stats.total) * 100)}%）
                    </span>
                  </ListItem>
                ))}
              </List>
            </>
          ) : (
            <EmptyState>データなし</EmptyState>
          )}
        </Card>
      </Grid>

      <Card className="mt-4">
        <Flex>
          <Title>人事目標</Title>
          <Button variant="light" size="xs" onClick={() => onNavigate(TAB.goals)}>
            すべて見る →
          </Button>
        </Flex>
        {goals.length ? (
          <div className="mt-4 space-y-4">
            {goals.map((g) => (
              <div key={g.id}>
                <Flex>
                  <Flex justifyContent="start" className="gap-2 truncate">
                    <Text className="truncate font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                      {g.title}
                    </Text>
                    <Badge size="xs" color={GOAL_STATUS[g.status].color}>
                      {GOAL_STATUS[g.status].label}
                    </Badge>
                  </Flex>
                  <Text>{g.progress}%</Text>
                </Flex>
                <ProgressBar value={g.progress} color={GOAL_STATUS[g.status].color} className="mt-2" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>人事目標はまだ登録されていません</EmptyState>
        )}
      </Card>
    </div>
  );
}
