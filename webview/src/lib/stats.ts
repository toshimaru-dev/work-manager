import { Goal, WorkEntry } from '@shared/types';

export const sumMinutes = (entries: WorkEntry[]) => entries.reduce((s, e) => s + e.minutes, 0);

/** 案件ID → 合計分 */
export function minutesByProject(entries: WorkEntry[]): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const e of entries) map.set(e.projectId, (map.get(e.projectId) ?? 0) + e.minutes);
  return map;
}

/** ウェイトによる加重平均進捗。ウェイト未設定なら単純平均 */
export function weightedProgress(goals: Goal[]): number {
  if (goals.length === 0) return 0;
  const totalWeight = goals.reduce((s, g) => s + g.weight, 0);
  if (totalWeight === 0) return Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length);
  return Math.round(goals.reduce((s, g) => s + g.progress * g.weight, 0) / totalWeight);
}

export const GOAL_STATUS = {
  notStarted: { label: '未着手', color: 'gray' },
  onTrack: { label: '順調', color: 'emerald' },
  atRisk: { label: '要注意', color: 'amber' },
  done: { label: '達成', color: 'blue' },
} as const;
