import { useState } from 'react';
import {
  Button,
  Card,
  Grid,
  NumberInput,
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
import { RiAddLine } from '@remixicon/react';
import { CodeSelect } from '../components/codeSelect';
import { ColorDot, ConfirmButton, Field, PageHeader } from '../components/ui';
import { uid, useAppData, useProjects } from '../lib/data';

export function Settings() {
  return (
    <div>
      <PageHeader title="設定" description="自動割当ルールと取込条件を設定します。案件コード・作業コードは「コード管理」タブで管理します。" />
      <div className="space-y-4">
        <Grid numItemsLg={2} className="gap-4">
          <RulesCard />
          <GeneralCard />
        </Grid>
        <Card>
          <Title>データ</Title>
          <Text className="mt-2">
            データは VS Code の拡張機能ストレージ (globalState) に保存され、すべてのワークスペースで共通です。
            コマンドパレットの「Work Manager: データをバックアップ」「Work Manager: バックアップから復元」で JSON
            ファイルへの書き出し・読み込みができます。
          </Text>
        </Card>
      </div>
    </div>
  );
}

function RulesCard() {
  const { data, save } = useAppData();
  const projects = useProjects();
  const [keyword, setKeyword] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workCodeId, setWorkCodeId] = useState<string | null>(null);

  const add = () => {
    if (!keyword.trim() || !projectId) return;
    save('rules', [...data.rules, { id: uid(), keyword: keyword.trim(), projectId, workCodeId }]);
    setKeyword('');
  };

  return (
    <Card>
      <Title>自動割当ルール</Title>
      <Text>予定のタイトルにキーワードが含まれる場合、取込時に案件コード・作業コードを自動で割り当てます（上から順に評価）。</Text>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="キーワード" className="w-40">
          <TextInput value={keyword} onValueChange={setKeyword} placeholder="例: A社" />
        </Field>
        <Field label="案件コード / 作業コード">
          <CodeSelect
            compact
            projectId={projectId}
            workCodeId={workCodeId}
            emptyLabel="案件コードを選択…"
            onChange={(p, w) => {
              setProjectId(p);
              setWorkCodeId(w);
            }}
          />
        </Field>
        <Button type="submit" icon={RiAddLine} disabled={!keyword.trim() || !projectId}>
          追加
        </Button>
      </form>
      {data.rules.length > 0 && (
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeaderCell>キーワード</TableHeaderCell>
              <TableHeaderCell>案件コード / 作業コード</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">{r.keyword}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ColorDot color={projects.color(r.projectId)} />
                    {projects.label(r.projectId)}
                    {projects.workCode(r.workCodeId) && (
                      <span className="text-tremor-content dark:text-dark-tremor-content">
                        / {projects.workCode(r.workCodeId)!.code} {projects.workCode(r.workCodeId)!.name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <ConfirmButton onConfirm={() => save('rules', data.rules.filter((x) => x.id !== r.id))} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function GeneralCard() {
  const { data, save } = useAppData();
  const s = data.settings;
  return (
    <Card>
      <Title>稼働・取込の設定</Title>
      <div className="mt-4 space-y-4">
        <Field label="1日の所定労働時間（時間）">
          <NumberInput
            value={s.standardHours}
            onValueChange={(v) => v > 0 && save('settings', { ...s, standardHours: v })}
            min={1}
            max={24}
            step={0.5}
            className="w-32"
          />
        </Field>
        <Field label="取込時に除外するキーワード（カンマ区切り）">
          <TextInput
            key={s.excludeKeywords.join(',')}
            defaultValue={s.excludeKeywords.join(', ')}
            onBlur={(e) =>
              save('settings', {
                ...s,
                excludeKeywords: e.target.value
                  .split(/[,、]/)
                  .map((k) => k.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <div className="flex items-center gap-3">
          <Switch id="allday" checked={s.includeAllDay} onChange={(v) => save('settings', { ...s, includeAllDay: v })} />
          <label htmlFor="allday" className="text-tremor-default">
            終日予定を所定労働時間分の稼働として取り込む
          </label>
        </div>
      </div>
    </Card>
  );
}
