import Papa from 'papaparse';
import { WorkContent } from '../shared/types';

/**
 * 作業内容マスタ CSV を解析する。
 * 列順: 作業内容コード, 作業内容名称, 作業内訳コード, 作業内訳名称（例: 110,プリセールス,20101,その他ソリューション）
 * 1行目がヘッダー（コード列が数字/英数字コードでない）場合は読み飛ばす。
 */
export function parseWorkContentCsv(text: string): WorkContent[] {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.map((r) => r.map((c) => (c ?? '').trim()));
  const hasHeader = rows.length > 0 && /コード|code/i.test(rows[0][0] ?? '');
  if (hasHeader) rows.shift();

  const result: WorkContent[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (r.length < 4 || !r[0] || !r[2]) {
      throw new Error(`${i + 1 + (hasHeader ? 1 : 0)}行目の形式が正しくありません（4列「作業内容コード, 作業内容名称, 作業内訳コード, 作業内訳名称」が必要です）: ${r.join(',')}`);
    }
    const key = `${r[0]}:${r[2]}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ contentCode: r[0], contentName: r[1], breakdownCode: r[2], breakdownName: r[3] });
  });
  if (result.length === 0) throw new Error('CSV にデータ行がありません。');
  return result;
}
