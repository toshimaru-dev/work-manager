import { Fragment, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Flex,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  TextInput,
  Title,
} from '@tremor/react';
import { RiAddLine, RiEditLine, RiSearchLine } from '@remixicon/react';
import { WorkEntry } from '@shared/types';
import { CodeSelect } from '../components/codeSelect';
import { ColorDot, ConfirmButton, EmptyState, Field, MonthPicker, NativeInput, NativeSelect, PageHeader } from '../components/ui';
import { uid, useAppData, useProjects } from '../lib/data';
import { fmtHours, formatDay, isWeekend, minutesBetween, todayKey } from '../lib/date';
import { MonthProps } from '../lib/nav';
import { sumMinutes } from '../lib/stats';

type Form = Pick<WorkEntry, 'date' | 'start' | 'end' | 'title' | 'note' | 'projectId' | 'workCodeId'>;

const emptyForm = (): Form => ({ date: todayKey(), start: '09:00', end: '10:00', projectId: null, workCodeId: null, title: '', note: '' });

const SOURCE_LABEL = { manual: '手入力', ics: 'ICS', csv: 'CSV' } as const;

export function Entries({ month, onMonthChange }: MonthProps) {
  const { data, save } = useAppData();
  const projects = useProjects();
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [query, setQuery] = useState('');

  const formMinutes = minutesBetween(form.start, form.end);
  const canSubmit = !!form.date && formMinutes > 0 && !!form.projectId;

  const submit = () => {
    if (!canSubmit) return;
    const fields = { ...form, minutes: formMinutes };
    if (editingId) {
      save('entries', data.entries.map((e) => (e.id === editingId ? { ...e, ...fields } : e)));
    } else {
      save('entries', [...data.entries, { id: uid(), source: 'manual', ...fields }]);
    }
    setEditingId(null);
    // 連続入力しやすいよう、日付と終了時刻を次の開始時刻として引き継ぐ
    setForm({ ...emptyForm(), date: form.date, start: form.end, end: form.end, projectId: form.projectId, workCodeId: form.workCodeId });
  };

  const startEdit = (e: WorkEntry) => {
    setEditingId(e.id);
    setForm({ date: e.date, start: e.start, end: e.end, projectId: e.projectId, workCodeId: e.workCodeId, title: e.title, note: e.note });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const update = (id: string, patch: Partial<WorkEntry>) =>
    save('entries', data.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const remove = (id: string) => save('entries', data.entries.filter((e) => e.id !== id));

  // 日付ごとにグループ化（新しい日付が上）
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.entries
      .filter((e) => e.date.startsWith(month))
      .filter((e) => {
        if (!filterProject) return true;
        if (filterProject === '__none') return !projects.get(e.projectId);
        // 作業コードが登録されている案件で、作業コードが未設定のもの
        if (filterProject === '__noWork')
          return !projects.workCode(e.workCodeId) && !!projects.get(e.projectId)?.workCodes.some((w) => !w.archived);
        return e.projectId === filterProject;
      })
      .filter((e) => !q || `${e.title} ${e.note}`.toLowerCase().includes(q))
      .sort((a, b) => (b.date + a.start).localeCompare(a.date + b.start));
    const map = new Map<string, WorkEntry[]>();
    for (const e of list) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map];
  }, [data.entries, month, filterProject, query, projects]);

  const filteredTotal = groups.reduce((s, [, list]) => s + sumMinutes(list), 0);

  return (
    <div>
      <PageHeader title="稼働入力" description="稼働の手入力と、取り込んだ稼働の確認・修正を行います。" />

      <Card>
        <Title>{editingId ? '稼働を編集' : '稼働を追加'}</Title>
        <form
          className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="日付">
            <NativeInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="開始">
            <NativeInput type="time" value={form.start} step={300} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label={`終了（${fmtHours(formMinutes)}）`}>
            <NativeInput type="time" value={form.end} step={300} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
          <Field label="案件コード / 作業コード" className="col-span-2 md:col-span-3">
            <CodeSelect
              projectId={form.projectId}
              workCodeId={form.workCodeId}
              onChange={(projectId, workCodeId) => setForm({ ...form, projectId, workCodeId })}
              emptyLabel="案件コードを選択…"
            />
          </Field>
          <Field label="件名" className="col-span-2 md:col-span-3">
            <TextInput value={form.title} onValueChange={(v) => setForm({ ...form, title: v })} placeholder="作業内容" />
          </Field>
          <Field label="メモ" className="col-span-2 md:col-span-3">
            <TextInput value={form.note} onValueChange={(v) => setForm({ ...form, note: v })} placeholder="任意" />
          </Field>
          <div className="col-span-2 flex items-center gap-2 md:col-span-6">
            <Button type="submit" icon={editingId ? RiEditLine : RiAddLine} disabled={!canSubmit}>
              {editingId ? '更新' : '追加'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={cancelEdit}>
                キャンセル
              </Button>
            )}
            {formMinutes === 0 && <Text className="text-rose-500">終了時刻は開始時刻より後にしてください</Text>}
            {formMinutes > 0 && !form.projectId && <Text>案件コードを選択してください</Text>}
          </div>
        </form>
      </Card>

      <Card className="mt-4">
        <Flex className="flex-wrap gap-4">
          <MonthPicker month={month} onChange={onMonthChange} />
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-48">
              <option value="">すべての案件</option>
              <option value="__none">案件コード未設定のみ</option>
              <option value="__noWork">作業コード未設定のみ</option>
              {projects.all.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </NativeSelect>
            <TextInput icon={RiSearchLine} value={query} onValueChange={setQuery} placeholder="件名・メモで検索" className="w-56" />
            <Badge color="blue">合計 {fmtHours(filteredTotal)}</Badge>
          </div>
        </Flex>

        {groups.length === 0 ? (
          <EmptyState>表示する稼働はありません</EmptyState>
        ) : (
          <Table className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>時間帯</TableHeaderCell>
                <TableHeaderCell className="text-right">時間</TableHeaderCell>
                <TableHeaderCell>案件コード / 作業コード</TableHeaderCell>
                <TableHeaderCell>件名</TableHeaderCell>
                <TableHeaderCell>取込元</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map(([date, list]) => (
                <Fragment key={date}>
                  <TableRow className="bg-tremor-background-muted dark:bg-dark-tremor-background-muted">
                    <TableCell colSpan={6} className="py-2">
                      <Flex>
                        <span className={`font-semibold ${isWeekend(date) ? 'text-rose-500' : 'text-tremor-content-strong dark:text-dark-tremor-content-strong'}`}>
                          {formatDay(date)}
                        </span>
                        <span className="text-tremor-default">計 {fmtHours(sumMinutes(list))}</span>
                      </Flex>
                    </TableCell>
                  </TableRow>
                  {list.map((e) => (
                    <TableRow key={e.id} className={editingId === e.id ? 'bg-tremor-brand-faint dark:bg-dark-tremor-brand-faint' : ''}>
                      <TableCell className="whitespace-nowrap">
                        {e.start}〜{e.end}
                      </TableCell>
                      <TableCell className="text-right">{fmtHours(e.minutes)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ColorDot color={projects.color(e.projectId)} />
                          <CodeSelect
                            compact
                            projectId={e.projectId}
                            workCodeId={e.workCodeId}
                            onChange={(projectId, workCodeId) => update(e.id, { projectId, workCodeId })}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal">
                        <div className="text-tremor-content-strong dark:text-dark-tremor-content-strong">{e.title}</div>
                        {e.note && <div className="text-tremor-label">{e.note}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge size="xs" color={e.source === 'manual' ? 'gray' : 'cyan'}>
                          {SOURCE_LABEL[e.source]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button size="xs" variant="light" icon={RiEditLine} onClick={() => startEdit(e)} tooltip="編集" />
                        <ConfirmButton onConfirm={() => remove(e.id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
