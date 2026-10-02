import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Switch,
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
import { RiAddLine, RiArrowDownSLine, RiArrowRightSLine, RiErrorWarningLine, RiFileUploadLine, RiSearchLine } from '@remixicon/react';
import { Project, TREMOR_COLORS, TremorColor, WorkCode } from '@shared/types';
import { ColorDot, ConfirmButton, EmptyState, Field, NativeSelect, PageHeader } from '../components/ui';
import { uid, useAppData } from '../lib/data';
import { fmtHours } from '../lib/date';
import { onMessage, postMessage } from '../lib/vscode';

export function Codes() {
  return (
    <div>
      <PageHeader title="コード管理" description="稼働入力に使う案件コード・作業コードと、月次集計で使う作業内容マスタを管理します。" />
      <div className="space-y-4">
        <ProjectCodes />
        <WorkContentMaster />
      </div>
    </div>
  );
}

// ---------------- 案件コード・作業コード ----------------

function ProjectCodes() {
  const { data, save, notify } = useAppData();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const duplicate = (c: string, exceptId?: string) => data.projects.some((p) => p.code === c && p.id !== exceptId);

  const minutesByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries) if (e.projectId) m.set(e.projectId, (m.get(e.projectId) ?? 0) + e.minutes);
    return m;
  }, [data.entries]);

  const add = () => {
    const c = code.trim();
    if (!c || !name.trim()) return;
    if (duplicate(c)) return notify(`案件コード「${c}」は既に登録されています。`, 'warn');
    const project: Project = {
      id: uid(),
      code: c,
      name: name.trim(),
      color: TREMOR_COLORS[data.projects.length % TREMOR_COLORS.length],
      archived: false,
      note: '',
      workCodes: [],
    };
    save('projects', [...data.projects, project]);
    setExpanded(new Set([...expanded, project.id]));
    setCode('');
    setName('');
  };

  const update = (id: string, patch: Partial<Project>) =>
    save('projects', data.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const rename = (p: Project, newCode: string) => {
    const c = newCode.trim();
    if (!c || c === p.code) return;
    if (duplicate(c, p.id)) return notify(`案件コード「${c}」は既に登録されています。`, 'warn');
    update(p.id, { code: c });
  };

  const remove = (id: string) => {
    // 紐づく稼働は「未設定」に戻し、ルールは削除する
    save('projects', data.projects.filter((p) => p.id !== id));
    save('entries', data.entries.map((e) => (e.projectId === id ? { ...e, projectId: null, workCodeId: null } : e)));
    save('rules', data.rules.filter((r) => r.projectId !== id));
  };

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const q = query.trim().toLowerCase();
  const list = data.projects
    .filter((p) => showArchived || !p.archived)
    .filter((p) => !q || `${p.code} ${p.name} ${p.workCodes.map((w) => `${w.code} ${w.name}`).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <Card>
      <Title>案件コード</Title>
      <Text>案件コードごとに作業コードを登録します。行の ▶ をクリックすると作業コードを編集できます。</Text>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="案件コード" className="w-40">
          <TextInput value={code} onValueChange={setCode} placeholder="例: PJ-0123" error={!!code.trim() && duplicate(code.trim())} />
        </Field>
        <Field label="案件名" className="w-72">
          <TextInput value={name} onValueChange={setName} placeholder="例: A社 基幹システム更改" />
        </Field>
        <Button type="submit" icon={RiAddLine} disabled={!code.trim() || !name.trim() || duplicate(code.trim())}>
          案件コードを追加
        </Button>
      </form>

      <Flex className="mt-6 flex-wrap gap-3" justifyContent="start">
        <TextInput icon={RiSearchLine} value={query} onValueChange={setQuery} placeholder="コード・名称で検索" className="w-64" />
        <label className="flex items-center gap-2 text-tremor-default">
          <Switch checked={showArchived} onChange={setShowArchived} />
          終了した案件も表示
        </label>
        <Text className="ml-auto">{list.length}件</Text>
      </Flex>

      {list.length === 0 ? (
        <div className="mt-4">
          <EmptyState>案件コードがありません</EmptyState>
        </div>
      ) : (
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-8" />
              <TableHeaderCell>案件コード</TableHeaderCell>
              <TableHeaderCell>案件名</TableHeaderCell>
              <TableHeaderCell>作業コード</TableHeaderCell>
              <TableHeaderCell className="text-right">累計稼働</TableHeaderCell>
              <TableHeaderCell>色</TableHeaderCell>
              <TableHeaderCell>有効</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((p) => (
              <Fragment key={p.id}>
                <TableRow className={p.archived ? 'opacity-50' : ''}>
                  <TableCell>
                    <Button
                      size="xs"
                      variant="light"
                      icon={expanded.has(p.id) ? RiArrowDownSLine : RiArrowRightSLine}
                      onClick={() => toggle(p.id)}
                      aria-label="作業コードを表示"
                    />
                  </TableCell>
                  <TableCell>
                    {/* 入力中に毎回保存しないよう、フォーカスが外れたときに保存 */}
                    <TextInput key={`c-${p.code}`} defaultValue={p.code} onBlur={(e) => rename(p, e.target.value)} className="w-36 font-mono" />
                  </TableCell>
                  <TableCell>
                    <TextInput
                      key={`n-${p.name}`}
                      defaultValue={p.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.name && update(p.id, { name: e.target.value.trim() })}
                    />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggle(p.id)} className="flex flex-wrap gap-1">
                      {p.workCodes.length === 0 ? (
                        <Badge size="xs" color="amber">
                          未登録
                        </Badge>
                      ) : (
                        p.workCodes
                          .filter((w) => !w.archived)
                          .map((w) => (
                            <Badge key={w.id} size="xs" color="slate">
                              {w.code}
                            </Badge>
                          ))
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">{fmtHours(minutesByProject.get(p.id) ?? 0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ColorDot color={p.color} />
                      <NativeSelect value={p.color} onChange={(e) => update(p.id, { color: e.target.value as TremorColor })} className="w-28 py-1">
                        {TREMOR_COLORS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch checked={!p.archived} onChange={(v) => update(p.id, { archived: !v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmButton onConfirm={() => remove(p.id)} />
                  </TableCell>
                </TableRow>
                {expanded.has(p.id) && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-tremor-background-muted p-4 dark:bg-dark-tremor-background-muted">
                      <WorkCodeEditor project={p} onChange={(workCodes) => update(p.id, { workCodes })} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function WorkCodeEditor({ project, onChange }: { project: Project; onChange: (workCodes: WorkCode[]) => void }) {
  const { data, save, notify } = useAppData();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const duplicate = (c: string, exceptId?: string) => project.workCodes.some((w) => w.code === c && w.id !== exceptId);

  const add = () => {
    const c = code.trim();
    if (!c || !name.trim()) return;
    if (duplicate(c)) return notify(`作業コード「${c}」は既に登録されています。`, 'warn');
    onChange([...project.workCodes, { id: uid(), code: c, name: name.trim(), archived: false }]);
    setCode('');
    setName('');
  };

  const update = (id: string, patch: Partial<WorkCode>) => onChange(project.workCodes.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const remove = (id: string) => {
    onChange(project.workCodes.filter((w) => w.id !== id));
    save('entries', data.entries.map((e) => (e.workCodeId === id ? { ...e, workCodeId: null } : e)));
    save('rules', data.rules.map((r) => (r.workCodeId === id ? { ...r, workCodeId: null } : r)));
  };

  const usage = (id: string) => data.entries.filter((e) => e.workCodeId === id).reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="pl-8">
      <Text className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
        {project.code} {project.name} の作業コード
      </Text>
      {project.workCodes.length > 0 && (
        <table className="mt-2 w-full max-w-2xl text-tremor-default">
          <thead>
            <tr className="text-left text-tremor-label text-tremor-content dark:text-dark-tremor-content">
              <th className="py-1 font-medium">作業コード</th>
              <th className="py-1 font-medium">作業名</th>
              <th className="py-1 text-right font-medium">累計稼働</th>
              <th className="py-1 font-medium">有効</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.workCodes.map((w) => (
              <tr key={w.id} className={w.archived ? 'opacity-50' : ''}>
                <td className="py-1 pr-2">
                  <TextInput
                    key={`c-${w.code}`}
                    defaultValue={w.code}
                    className="w-28 font-mono"
                    onBlur={(e) => {
                      const c = e.target.value.trim();
                      if (!c || c === w.code) return;
                      if (duplicate(c, w.id)) return notify(`作業コード「${c}」は既に登録されています。`, 'warn');
                      update(w.id, { code: c });
                    }}
                  />
                </td>
                <td className="py-1 pr-2">
                  <TextInput
                    key={`n-${w.name}`}
                    defaultValue={w.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== w.name && update(w.id, { name: e.target.value.trim() })}
                  />
                </td>
                <td className="py-1 pr-4 text-right">{fmtHours(usage(w.id))}</td>
                <td className="py-1">
                  <Switch checked={!w.archived} onChange={(v) => update(w.id, { archived: !v })} />
                </td>
                <td className="py-1 text-right">
                  <ConfirmButton onConfirm={() => remove(w.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput value={code} onValueChange={setCode} placeholder="作業コード 例: 01" className="w-36" error={!!code.trim() && duplicate(code.trim())} />
        <TextInput value={name} onValueChange={setName} placeholder="作業名 例: 設計" className="w-56" />
        <Button type="submit" size="xs" variant="secondary" icon={RiAddLine} disabled={!code.trim() || !name.trim() || duplicate(code.trim())}>
          作業コードを追加
        </Button>
      </form>
    </div>
  );
}

// ---------------- 作業内容マスタ ----------------

function WorkContentMaster() {
  const { data, save, notify } = useAppData();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(
    () =>
      onMessage((m) => {
        if (m.type === 'workContents') {
          setError('');
          save('workContents', m.rows);
          const contents = new Set(m.rows.map((r) => r.contentCode)).size;
          notify(`作業内容マスタを読み込みました（${m.fileName}: 作業内容 ${contents}件 / 内訳 ${m.rows.length}件）。`);
        } else if (m.type === 'workContentsError') {
          setError(m.message);
        }
      }),
    [save, notify],
  );

  const q = query.trim().toLowerCase();
  const rows = data.workContents.filter(
    (r) => !q || `${r.contentCode} ${r.contentName} ${r.breakdownCode} ${r.breakdownName}`.toLowerCase().includes(q),
  );
  const contentCount = new Set(data.workContents.map((r) => r.contentCode)).size;

  return (
    <Card>
      <Flex className="flex-wrap gap-4" alignItems="start">
        <div>
          <Title>作業内容マスタ</Title>
          <Text>
            月次集計で 案件×作業コード ごとに選択する「作業内容」「内訳」の一覧です。CSV
            を読み込むと現在のマスタを置き換えます。
          </Text>
          <Text className="mt-1 font-mono text-tremor-label">
            列: 作業内容コード, 作業内容名称, 作業内訳コード, 作業内訳名称 ／ 例: 110,プリセールス,20101,その他ソリューション
          </Text>
        </div>
        <div className="flex gap-2">
          <Button icon={RiFileUploadLine} onClick={() => postMessage({ type: 'pickWorkContentCsv' })}>
            CSV を読み込む
          </Button>
          {data.workContents.length > 0 && <ConfirmButton size="sm" label="マスタをクリア" onConfirm={() => save('workContents', [])} />}
        </div>
      </Flex>

      {error && (
        <Callout title="読み込みに失敗しました" icon={RiErrorWarningLine} color="rose" className="mt-4">
          {error}
        </Callout>
      )}

      {data.workContents.length === 0 ? (
        <div className="mt-4">
          <EmptyState>作業内容マスタが未登録です</EmptyState>
        </div>
      ) : (
        <>
          <Flex className="mt-4 gap-3" justifyContent="start">
            <TextInput icon={RiSearchLine} value={query} onValueChange={setQuery} placeholder="コード・名称で検索" className="w-64" />
            <Text>
              作業内容 {contentCount}件 / 内訳 {data.workContents.length}件
            </Text>
          </Flex>
          <Table className="mt-2 max-h-96">
            <TableHead>
              <TableRow>
                <TableHeaderCell>作業内容コード</TableHeaderCell>
                <TableHeaderCell>作業内容名称</TableHeaderCell>
                <TableHeaderCell>作業内訳コード</TableHeaderCell>
                <TableHeaderCell>作業内訳名称</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.contentCode}:${r.breakdownCode}`}>
                  <TableCell className="font-mono">{r.contentCode}</TableCell>
                  <TableCell>{r.contentName}</TableCell>
                  <TableCell className="font-mono">{r.breakdownCode}</TableCell>
                  <TableCell>{r.breakdownName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
}
