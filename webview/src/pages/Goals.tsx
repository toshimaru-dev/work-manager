import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Dialog,
  DialogPanel,
  Flex,
  Grid,
  Metric,
  NumberInput,
  ProgressBar,
  ProgressCircle,
  Tab,
  TabGroup,
  TabList,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@tremor/react';
import { RiAddLine, RiEditLine, RiLineChartLine } from '@remixicon/react';
import { fiscalTermOf, Goal, GOAL_TERMS, GoalStatus, GoalTerm } from '@shared/types';
import { ConfirmButton, EmptyState, Field, NativeInput, NativeSelect, PageHeader } from '../components/ui';
import { uid, useAppData } from '../lib/data';
import { daysUntil, todayKey } from '../lib/date';
import { GOAL_STATUS, weightedProgress } from '../lib/stats';

const STATUSES = Object.keys(GOAL_STATUS) as GoalStatus[];
const TERMS = Object.keys(GOAL_TERMS) as GoalTerm[];
/** よく使うカテゴリ。この順で先に並べ、それ以外は名前順 */
const PRESET_CATEGORIES = ['業績', '能力開発', '組織貢献'];
const UNCATEGORIZED = '未分類';

type TermFilter = GoalTerm | 'all';
const TERM_FILTERS: TermFilter[] = ['all', ...TERMS];

const periodLabel = (fiscalYear: number, term: GoalTerm) => `${fiscalYear}年度 ${GOAL_TERMS[term].label}`;

const newGoal = (fiscalYear: number, term: GoalTerm): Goal => ({
  id: uid(),
  title: '',
  category: '業績',
  fiscalYear,
  term,
  weight: 20,
  criteria: '',
  dueDate: '',
  progress: 0,
  status: 'notStarted',
  updates: [],
});

function groupByCategory(goals: Goal[]): [string, Goal[]][] {
  const map = new Map<string, Goal[]>();
  for (const g of goals) {
    const c = g.category.trim() || UNCATEGORIZED;
    map.set(c, [...(map.get(c) ?? []), g]);
  }
  const rank = (c: string) => (PRESET_CATEGORIES.includes(c) ? PRESET_CATEGORIES.indexOf(c) : c === UNCATEGORIZED ? 999 : 100);
  return [...map].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'ja'));
}

type DialogState = { mode: 'edit'; goal: Goal; isNew: boolean } | { mode: 'progress'; goal: Goal } | null;

export function Goals() {
  const { data, save } = useAppData();
  const current = fiscalTermOf(new Date());
  const [year, setYear] = useState(current.fiscalYear);
  const [termFilter, setTermFilter] = useState<TermFilter>('all');
  const [dialog, setDialog] = useState<DialogState>(null);

  const years = useMemo(
    () =>
      [...new Set([current.fiscalYear - 1, current.fiscalYear, current.fiscalYear + 1, ...data.goals.map((g) => g.fiscalYear)])].sort(
        (a, b) => b - a,
      ),
    [data.goals, current.fiscalYear],
  );
  const categories = useMemo(
    () => [...new Set([...PRESET_CATEGORIES, ...data.goals.map((g) => g.category.trim()).filter(Boolean)])],
    [data.goals],
  );

  const yearGoals = data.goals.filter((g) => g.fiscalYear === year);
  const goals = yearGoals.filter((g) => termFilter === 'all' || g.term === termFilter);
  // 「すべて」では目標のある区分だけ、区分を選んだときは空でもその区分を表示
  const sections = TERMS.filter((t) => (termFilter === 'all' ? goals.some((g) => g.term === t) : t === termFilter));
  const progress = weightedProgress(goals);

  const upsert = (goal: Goal) => {
    const exists = data.goals.some((g) => g.id === goal.id);
    save('goals', exists ? data.goals.map((g) => (g.id === goal.id ? goal : g)) : [...data.goals, goal]);
    // 保存した目標が見える期間に切り替える
    setYear(goal.fiscalYear);
    if (termFilter !== 'all' && termFilter !== goal.term) setTermFilter(goal.term);
    setDialog(null);
  };

  const addGoal = (term?: GoalTerm) => {
    const t = term ?? (termFilter !== 'all' ? termFilter : year === current.fiscalYear ? current.term : 'full');
    setDialog({ mode: 'edit', goal: newGoal(year, t), isNew: true });
  };

  return (
    <div>
      <PageHeader
        title="人事目標"
        description="年度・評価期間ごとに、カテゴリ別で目標と進捗を管理します。"
        actions={
          <>
            <NativeSelect value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年度
                </option>
              ))}
            </NativeSelect>
            <TabGroup index={TERM_FILTERS.indexOf(termFilter)} onIndexChange={(i) => setTermFilter(TERM_FILTERS[i])} className="w-auto">
              <TabList variant="solid">
                {TERM_FILTERS.map((t) => (
                  <Tab key={t}>{t === 'all' ? 'すべて' : GOAL_TERMS[t].label}</Tab>
                ))}
              </TabList>
            </TabGroup>
            <Button icon={RiAddLine} onClick={() => addGoal()}>
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
          <Text>目標数</Text>
          <Metric>{goals.length}件</Metric>
          <Text className="mt-2">
            {TERMS.filter((t) => termFilter === 'all' || t === termFilter)
              .map((t) => `${GOAL_TERMS[t].label} ${goals.filter((g) => g.term === t).length}件`)
              .join(' / ')}
          </Text>
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

      {sections.length === 0 ? (
        <div className="mt-6">
          <EmptyState>{year}年度の目標がありません。「目標を追加」から登録してください。</EmptyState>
        </div>
      ) : (
        sections.map((term) => (
          <PeriodSection
            key={term}
            fiscalYear={year}
            term={term}
            goals={goals.filter((g) => g.term === term)}
            onAdd={() => addGoal(term)}
            onEdit={(g) => setDialog({ mode: 'edit', goal: g, isNew: false })}
            onProgress={(g) => setDialog({ mode: 'progress', goal: g })}
            onDelete={(g) => save('goals', data.goals.filter((x) => x.id !== g.id))}
          />
        ))
      )}

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} static>
        <DialogPanel className="max-w-xl">
          {dialog?.mode === 'edit' && (
            <GoalForm
              initial={dialog.goal}
              isNew={dialog.isNew}
              years={years}
              categories={categories}
              onSave={upsert}
              onCancel={() => setDialog(null)}
            />
          )}
          {dialog?.mode === 'progress' && <ProgressForm goal={dialog.goal} onSave={upsert} onCancel={() => setDialog(null)} />}
        </DialogPanel>
      </Dialog>
    </div>
  );
}

type GoalHandlers = { onEdit: (g: Goal) => void; onProgress: (g: Goal) => void; onDelete: (g: Goal) => void };

function PeriodSection({
  fiscalYear,
  term,
  goals,
  onAdd,
  ...handlers
}: { fiscalYear: number; term: GoalTerm; goals: Goal[]; onAdd: () => void } & GoalHandlers) {
  const totalWeight = goals.reduce((s, g) => s + g.weight, 0);
  const progress = weightedProgress(goals);
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tremor-border pb-3 dark:border-dark-tremor-border">
        <div>
          <Title>{periodLabel(fiscalYear, term)}</Title>
          <Text>
            {GOAL_TERMS[term].months} · {goals.length}件
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {goals.length > 0 && (
            <>
              <Badge color={totalWeight === 100 ? 'emerald' : 'amber'} tooltip={totalWeight === 100 ? undefined : '合計が 100% になるよう調整してください'}>
                ウェイト合計 {totalWeight}%
              </Badge>
              <div className="w-48">
                <Flex>
                  <Text>加重平均進捗</Text>
                  <Text className="font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">{progress}%</Text>
                </Flex>
                <ProgressBar value={progress} color="violet" className="mt-1" />
              </div>
            </>
          )}
          <Button size="xs" variant="secondary" icon={RiAddLine} onClick={onAdd}>
            追加
          </Button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="mt-4">
          <EmptyState>{periodLabel(fiscalYear, term)}の目標はまだありません。</EmptyState>
        </div>
      ) : (
        <Grid numItemsMd={2} numItemsLg={3} className="mt-4 items-start gap-4">
          {groupByCategory(goals).map(([category, items]) => (
            <Card key={category} className="p-0">
              <div className="border-b border-tremor-border px-5 py-3 dark:border-dark-tremor-border">
                <Flex>
                  <span className="text-tremor-default font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">{category}</span>
                  <Text className="text-tremor-label">
                    {items.length}件 · ウェイト {items.reduce((s, g) => s + g.weight, 0)}%
                  </Text>
                </Flex>
                <Flex className="mt-2 gap-3">
                  <ProgressBar value={weightedProgress(items)} color="violet" />
                  <Text className="shrink-0 text-tremor-label">{weightedProgress(items)}%</Text>
                </Flex>
              </div>
              <ul className="divide-y divide-tremor-border dark:divide-dark-tremor-border">
                {items.map((g) => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    onEdit={() => handlers.onEdit(g)}
                    onProgress={() => handlers.onProgress(g)}
                    onDelete={() => handlers.onDelete(g)}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </Grid>
      )}
    </section>
  );
}

function GoalRow({ goal: g, onEdit, onProgress, onDelete }: { goal: Goal; onEdit: () => void; onProgress: () => void; onDelete: () => void }) {
  const st = GOAL_STATUS[g.status];
  const remaining = g.dueDate ? daysUntil(g.dueDate) : null;
  const latest = g.updates[g.updates.length - 1];
  return (
    <li className="px-5 py-4">
      <Flex alignItems="start" className="gap-2">
        <div className="min-w-0">
          <Flex justifyContent="start" className="gap-2">
            <Badge size="xs" color={st.color}>
              {st.label}
            </Badge>
            <Text className="text-tremor-label">ウェイト {g.weight}%</Text>
          </Flex>
          <p className="mt-1.5 font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{g.title}</p>
        </div>
        <div className="flex shrink-0">
          <Button size="xs" variant="light" icon={RiLineChartLine} onClick={onProgress} tooltip="進捗を記録" />
          <Button size="xs" variant="light" icon={RiEditLine} onClick={onEdit} tooltip="編集" />
          <ConfirmButton onConfirm={onDelete} />
        </div>
      </Flex>
      {g.criteria && (
        <Text className="mt-1 line-clamp-2 whitespace-pre-wrap" title={g.criteria}>
          {g.criteria}
        </Text>
      )}

      <Flex className="mt-3 gap-3">
        <ProgressBar value={g.progress} color={st.color} />
        <Text className="shrink-0 font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">{g.progress}%</Text>
      </Flex>
      {g.dueDate && (
        <Text className={`mt-1 text-tremor-label ${remaining !== null && remaining < 0 && g.status !== 'done' ? 'text-rose-500' : ''}`}>
          期限 {g.dueDate}
          {remaining !== null && g.status !== 'done' && (remaining >= 0 ? `（残り${remaining}日）` : `（${-remaining}日超過）`)}
        </Text>
      )}
      {latest && (
        <Text className="mt-2 line-clamp-2 text-tremor-label" title={latest.note}>
          <span className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
            {latest.date} · {latest.progress}%
          </span>{' '}
          {latest.note}
        </Text>
      )}
    </li>
  );
}

function GoalForm({
  initial,
  isNew,
  years,
  categories,
  onSave,
  onCancel,
}: {
  initial: Goal;
  isNew: boolean;
  years: number[];
  categories: string[];
  onSave: (g: Goal) => void;
  onCancel: () => void;
}) {
  const [g, setG] = useState(initial);
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setG({ ...g, [k]: v });
  const yearOptions = [...new Set([...years, g.fiscalYear])].sort((a, b) => b - a);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (g.title.trim()) onSave({ ...g, category: g.category.trim() });
      }}
    >
      <Title>{isNew ? '目標を追加' : '目標を編集'}</Title>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="目標" className="col-span-2">
          <TextInput value={g.title} onValueChange={(v) => set('title', v)} placeholder="例: 新規案件の受注 3件" required />
        </Field>
        <Field label="年度">
          <NativeSelect value={g.fiscalYear} onChange={(e) => set('fiscalYear', Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年度
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="評価期間">
          <NativeSelect value={g.term} onChange={(e) => set('term', e.target.value as GoalTerm)}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {GOAL_TERMS[t].label}（{GOAL_TERMS[t].months}）
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="カテゴリ">
          <NativeInput list="goal-categories" value={g.category} onChange={(e) => set('category', e.target.value)} placeholder="業績 / 能力開発 / 組織貢献" />
          <datalist id="goal-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="ウェイト (%)">
          <NumberInput value={g.weight} onValueChange={(v) => set('weight', v || 0)} min={0} max={100} step={5} />
        </Field>
        <Field label="期限">
          <NativeInput type="date" value={g.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="ステータス">
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
