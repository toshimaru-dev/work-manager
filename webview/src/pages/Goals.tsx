import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  DialogPanel,
  Divider,
  Flex,
  Grid,
  Metric,
  NumberInput,
  ProgressBar,
  ProgressCircle,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@tremor/react';
import { RiAddLine, RiEditLine, RiLineChartLine } from '@remixicon/react';
import { Goal, GoalStatus } from '@shared/types';
import { ConfirmButton, EmptyState, Field, NativeInput, NativeSelect, PageHeader } from '../components/ui';
import { uid, useAppData } from '../lib/data';
import { daysUntil, todayKey } from '../lib/date';
import { GOAL_STATUS, weightedProgress } from '../lib/stats';

const STATUSES = Object.keys(GOAL_STATUS) as GoalStatus[];

const defaultPeriod = () => {
  const d = new Date();
  // 4月始まりの年度で上期/下期を判定
  const fy = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
  return `${fy}年度${d.getMonth() >= 3 && d.getMonth() < 9 ? '上期' : '下期'}`;
};

const newGoal = (period: string): Goal => ({
  id: uid(),
  title: '',
  category: '業績',
  period,
  weight: 20,
  criteria: '',
  dueDate: '',
  progress: 0,
  status: 'notStarted',
  updates: [],
});

type DialogState = { mode: 'edit'; goal: Goal; isNew: boolean } | { mode: 'progress'; goal: Goal } | null;

export function Goals() {
  const { data, save } = useAppData();
  const periods = useMemo(() => [...new Set(data.goals.map((g) => g.period))].sort().reverse(), [data.goals]);
  const [period, setPeriod] = useState(() => periods[0] ?? '');
  const [dialog, setDialog] = useState<DialogState>(null);

  const goals = data.goals.filter((g) => !period || g.period === period);
  const totalWeight = goals.reduce((s, g) => s + g.weight, 0);
  const progress = weightedProgress(goals);

  const upsert = (goal: Goal) => {
    const exists = data.goals.some((g) => g.id === goal.id);
    save('goals', exists ? data.goals.map((g) => (g.id === goal.id ? goal : g)) : [...data.goals, goal]);
    if (!period || !exists) setPeriod(goal.period);
    setDialog(null);
  };

  return (
    <div>
      <PageHeader
        title="人事目標"
        description="評価期間ごとの目標と進捗を管理します。"
        actions={
          <>
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44">
              <option value="">すべての期間</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
            <Button icon={RiAddLine} onClick={() => setDialog({ mode: 'edit', goal: newGoal(period || defaultPeriod()), isNew: true })}>
              目標を追加
            </Button>
          </>
        }
      />

      <Grid numItemsSm={2} numItemsLg={3} className="gap-4">
        <Card>
          <Flex>
            <div>
              <Text>加重平均進捗</Text>
              <Metric>{progress}%</Metric>
            </div>
            <ProgressCircle value={progress} size="lg" color="violet">
              <span className="text-tremor-label font-medium">{progress}%</span>
            </ProgressCircle>
          </Flex>
        </Card>
        <Card>
          <Text>ウェイト合計</Text>
          <Metric className={totalWeight !== 100 && goals.length ? 'text-amber-500' : ''}>{totalWeight}%</Metric>
          <Text className="mt-2">{totalWeight === 100 || !goals.length ? '目標数 ' + goals.length + '件' : '合計が 100% になるよう調整してください'}</Text>
        </Card>
        <Card>
          <Text>ステータス</Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Badge key={s} color={GOAL_STATUS[s].color}>
                {GOAL_STATUS[s].label} {goals.filter((g) => g.status === s).length}
              </Badge>
            ))}
          </div>
        </Card>
      </Grid>

      {goals.length === 0 ? (
        <div className="mt-4">
          <EmptyState>目標がありません。「目標を追加」から登録してください。</EmptyState>
        </div>
      ) : (
        <Grid numItemsLg={2} className="mt-4 gap-4">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => setDialog({ mode: 'edit', goal: g, isNew: false })}
              onProgress={() => setDialog({ mode: 'progress', goal: g })}
              onDelete={() => save('goals', data.goals.filter((x) => x.id !== g.id))}
            />
          ))}
        </Grid>
      )}

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} static>
        <DialogPanel className="max-w-xl">
          {dialog?.mode === 'edit' && <GoalForm initial={dialog.goal} isNew={dialog.isNew} onSave={upsert} onCancel={() => setDialog(null)} />}
          {dialog?.mode === 'progress' && <ProgressForm goal={dialog.goal} onSave={upsert} onCancel={() => setDialog(null)} />}
        </DialogPanel>
      </Dialog>
    </div>
  );
}

function GoalCard({ goal: g, onEdit, onProgress, onDelete }: { goal: Goal; onEdit: () => void; onProgress: () => void; onDelete: () => void }) {
  const st = GOAL_STATUS[g.status];
  const remaining = g.dueDate ? daysUntil(g.dueDate) : null;
  return (
    <Card decoration="left" decorationColor={st.color}>
      <Flex alignItems="start">
        <div className="min-w-0">
          <Flex justifyContent="start" className="gap-2">
            <Badge size="xs" color="slate">
              {g.category || '未分類'}
            </Badge>
            <Badge size="xs" color={st.color}>
              {st.label}
            </Badge>
            <Text className="text-tremor-label">ウェイト {g.weight}%</Text>
          </Flex>
          <Title className="mt-2">{g.title}</Title>
        </div>
        <div className="flex shrink-0">
          <Button size="xs" variant="light" icon={RiEditLine} onClick={onEdit} tooltip="編集" />
          <ConfirmButton onConfirm={onDelete} />
        </div>
      </Flex>
      {g.criteria && <Text className="mt-2 whitespace-pre-wrap">{g.criteria}</Text>}

      <Flex className="mt-4">
        <Text>
          進捗 <span className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">{g.progress}%</span>
        </Text>
        {g.dueDate && (
          <Text className={remaining !== null && remaining < 0 && g.status !== 'done' ? 'text-rose-500' : ''}>
            期限 {g.dueDate}
            {remaining !== null && g.status !== 'done' && (remaining >= 0 ? `（残り${remaining}日）` : `（${-remaining}日超過）`)}
          </Text>
        )}
      </Flex>
      <ProgressBar value={g.progress} color={st.color} className="mt-2" />

      {g.updates.length > 0 && (
        <>
          <Divider className="my-4" />
          <ul className="space-y-2">
            {g.updates
              .slice(-3)
              .reverse()
              .map((u, i) => (
                <li key={i} className="text-tremor-default">
                  <span className="mr-2 text-tremor-label text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                    {u.date} · {u.progress}%
                  </span>
                  <span className="whitespace-pre-wrap">{u.note}</span>
                </li>
              ))}
          </ul>
        </>
      )}
      <Button size="xs" variant="secondary" icon={RiLineChartLine} onClick={onProgress} className="mt-4">
        進捗を記録
      </Button>
    </Card>
  );
}

function GoalForm({ initial, isNew, onSave, onCancel }: { initial: Goal; isNew: boolean; onSave: (g: Goal) => void; onCancel: () => void }) {
  const [g, setG] = useState(initial);
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setG({ ...g, [k]: v });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (g.title.trim()) onSave(g);
      }}
    >
      <Title>{isNew ? '目標を追加' : '目標を編集'}</Title>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="目標" className="col-span-2">
          <TextInput value={g.title} onValueChange={(v) => set('title', v)} placeholder="例: 新規案件の受注 3件" required />
        </Field>
        <Field label="カテゴリ">
          <TextInput value={g.category} onValueChange={(v) => set('category', v)} placeholder="業績 / 能力開発 / 組織貢献" />
        </Field>
        <Field label="評価期間">
          <TextInput value={g.period} onValueChange={(v) => set('period', v)} placeholder="2026年度下期" />
        </Field>
        <Field label="ウェイト (%)">
          <NumberInput value={g.weight} onValueChange={(v) => set('weight', v || 0)} min={0} max={100} step={5} />
        </Field>
        <Field label="期限">
          <NativeInput type="date" value={g.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="ステータス" className="col-span-2">
          <NativeSelect value={g.status} onChange={(e) => set('status', e.target.value as GoalStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="達成基準・アクション" className="col-span-2">
          <Textarea value={g.criteria} onValueChange={(v) => set('criteria', v)} rows={4} placeholder="どの状態になれば達成か、具体的な行動計画など" />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={!g.title.trim()}>
          保存
        </Button>
      </div>
    </form>
  );
}

function ProgressForm({ goal, onSave, onCancel }: { goal: Goal; onSave: (g: Goal) => void; onCancel: () => void }) {
  const [progress, setProgress] = useState(goal.progress);
  const [status, setStatus] = useState<GoalStatus>(goal.status === 'notStarted' ? 'onTrack' : goal.status);
  const [note, setNote] = useState('');
  const effectiveStatus = progress >= 100 ? 'done' : status;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...goal,
          progress,
          status: effectiveStatus,
          updates: [...goal.updates, { date: todayKey(), progress, note }],
        });
      }}
    >
      <Title>進捗を記録</Title>
      <Text className="mt-1">{goal.title}</Text>
      {goal.status === 'done' && progress < 100 && (
        <Callout title="達成済みの目標です" color="amber" className="mt-4">
          進捗を 100% 未満にすると、ステータスを選び直す必要があります。
        </Callout>
      )}
      <div className="mt-4 space-y-4">
        <Field label={`進捗 ${progress}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <ProgressBar value={progress} className="mt-2" color={GOAL_STATUS[effectiveStatus].color} />
        </Field>
        <Field label="ステータス">
          <NativeSelect value={effectiveStatus} onChange={(e) => setStatus(e.target.value as GoalStatus)} disabled={progress >= 100}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="振り返りメモ">
          <Textarea value={note} onValueChange={setNote} rows={3} placeholder="実施したこと、課題、次のアクションなど" />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit">記録する</Button>
      </div>
    </form>
  );
}
