import * as vscode from 'vscode';
import { WorkManagerPanel } from './panel';
import { AppData, normalizeData } from './shared/types';
import { Store } from './store';

export function activate(context: vscode.ExtensionContext): void {
  const store = new Store(context.globalState);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'workManager.open';
  statusBar.tooltip = '業務管理を開く';
  const updateStatusBar = (data: AppData) => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const minutes = data.entries.filter((e) => e.date === key).reduce((sum, e) => sum + e.minutes, 0);
    statusBar.text = `$(briefcase) 本日 ${(minutes / 60).toFixed(1)}h`;
  };
  updateStatusBar(store.get());
  statusBar.show();

  context.subscriptions.push(
    store,
    statusBar,
    store.onDidChange(updateStatusBar),
    vscode.commands.registerCommand('workManager.open', () => WorkManagerPanel.show(context, store)),
    vscode.commands.registerCommand('workManager.exportBackup', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'] },
        saveLabel: 'バックアップを保存',
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(store.get(), null, 2), 'utf8'));
      void vscode.window.showInformationMessage('バックアップを保存しました。');
    }),
    vscode.commands.registerCommand('workManager.importBackup', async () => {
      const [uri] = (await vscode.window.showOpenDialog({ filters: { JSON: ['json'] } })) ?? [];
      if (!uri) return;
      const ok = await vscode.window.showWarningMessage(
        '現在のデータをバックアップの内容で置き換えます。よろしいですか？',
        { modal: true },
        '置き換える',
      );
      if (ok !== '置き換える') return;
      try {
        const data = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')) as AppData;
        if (!Array.isArray(data.entries) || !Array.isArray(data.projects)) throw new Error('形式が正しくありません');
        await store.replace(normalizeData(data));
        void vscode.window.showInformationMessage('バックアップから復元しました。');
      } catch (e) {
        void vscode.window.showErrorMessage(`復元に失敗しました: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
}

export function deactivate(): void {}
