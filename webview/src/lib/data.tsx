import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppData, DataKey, Project, WorkCode } from '@shared/types';
import { onMessage, postMessage } from './vscode';

interface DataContextValue {
  data: AppData;
  save: <K extends DataKey>(key: K, value: AppData[K]) => void;
  notify: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    const off = onMessage((m) => {
      if (m.type === 'data') setData(m.data);
    });
    postMessage({ type: 'ready' });
    return off;
  }, []);

  const save = useCallback(<K extends DataKey>(key: K, value: AppData[K]) => {
    setData((d) => d && { ...d, [key]: value });
    postMessage({ type: 'save', key, value });
  }, []);

  const notify = useCallback((message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    postMessage({ type: 'notify', level, message });
  }, []);

  const value = useMemo(() => (data ? { data, save, notify } : null), [data, save, notify]);

  if (!value) {
    return <div className="p-6 text-tremor-default text-tremor-content">読み込み中...</div>;
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('DataProvider が必要です');
  return ctx;
}

export const UNCLASSIFIED = '未分類';

/** 案件コード・作業コードの参照用ヘルパー */
export function useProjects() {
  const { data } = useAppData();
  return useMemo(() => {
    const byId = new Map(data.projects.map((p) => [p.id, p]));
    const workCodes = new Map(data.projects.flatMap((p) => p.workCodes.map((w) => [w.id, w] as const)));
    return {
      all: data.projects,
      active: data.projects.filter((p) => !p.archived),
      get: (id: string | null): Project | undefined => (id ? byId.get(id) : undefined),
      name: (id: string | null) => (id && byId.get(id)?.name) || UNCLASSIFIED,
      /** "PJ-0123 案件名" 形式 */
      label: (id: string | null) => {
        const p = id ? byId.get(id) : undefined;
        return p ? `${p.code} ${p.name}` : UNCLASSIFIED;
      },
      color: (id: string | null) => (id && byId.get(id)?.color) || 'gray',
      workCode: (id: string | null): WorkCode | undefined => (id ? workCodes.get(id) : undefined),
      /** 案件に属する作業コードか（案件変更時の整合チェック用） */
      hasWorkCode: (projectId: string | null, workCodeId: string | null) =>
        !!projectId && !!workCodeId && !!byId.get(projectId)?.workCodes.some((w) => w.id === workCodeId),
    };
  }, [data.projects]);
}

/** 案件の作業コードが1つだけなら自動選択する */
export function defaultWorkCodeId(project: Project | undefined): string | null {
  const active = project?.workCodes.filter((w) => !w.archived) ?? [];
  return active.length === 1 ? active[0].id : null;
}

export function uid(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
