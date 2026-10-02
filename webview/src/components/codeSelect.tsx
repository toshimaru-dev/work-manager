import { NativeSelect } from './ui';
import { defaultWorkCodeId, useProjects } from '../lib/data';

interface Props {
  projectId: string | null;
  workCodeId: string | null;
  onChange: (projectId: string | null, workCodeId: string | null) => void;
  disabled?: boolean;
  /** 案件コードの空欄の表示 */
  emptyLabel?: string;
  /** 行内表示用のコンパクトな見た目 */
  compact?: boolean;
  /** 横並び（既定）か縦並びか */
  layout?: 'row' | 'column';
}

/** 案件コード → 作業コード の連動セレクト */
export function CodeSelect({ projectId, workCodeId, onChange, disabled, emptyLabel = '（案件コード未設定）', compact, layout = 'row' }: Props) {
  const projects = useProjects();
  const project = projects.get(projectId);
  // アーカイブ済みでも現在選択中のものは表示する
  const projectOptions = projects.all.filter((p) => !p.archived || p.id === projectId);
  const workOptions = project?.workCodes.filter((w) => !w.archived || w.id === workCodeId) ?? [];
  const size = compact ? 'py-1 text-tremor-label' : '';

  return (
    <div className={layout === 'row' ? 'flex gap-2' : 'flex flex-col gap-1'}>
      <NativeSelect
        value={projectId ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value || null;
          onChange(id, defaultWorkCodeId(projects.get(id)));
        }}
        className={`${compact ? 'w-48' : 'w-full'} ${size}`}
      >
        <option value="">{emptyLabel}</option>
        {projectOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} {p.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        value={workCodeId ?? ''}
        disabled={disabled || !project}
        onChange={(e) => onChange(projectId, e.target.value || null)}
        className={`${compact ? 'w-36' : 'w-full'} ${size}`}
      >
        <option value="">{project && workOptions.length === 0 ? '（作業コードなし）' : '（作業コード未設定）'}</option>
        {workOptions.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code} {w.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
