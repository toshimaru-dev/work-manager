import * as vscode from 'vscode';
import * as path from 'path';
import { parseCsv } from './importers/csv';
import { parseIcs } from './importers/ics';
import { parseWorkContentCsv } from './importers/workContents';
import { ExtensionToWebview, WebviewToExtension } from './shared/types';
import { Store } from './store';

export class WorkManagerPanel {
  static current: WorkManagerPanel | undefined;

  static show(context: vscode.ExtensionContext, store: Store): void {
    if (WorkManagerPanel.current) {
      WorkManagerPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel('workManager', '業務管理', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');
    WorkManagerPanel.current = new WorkManagerPanel(panel, context, store);
  }

  private readonly disposables: vscode.Disposable[] = [];
  /** Webview 自身の保存による変更通知は送り返さない（入力中の値が巻き戻るのを防ぐ） */
  private savingFromWebview = 0;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly store: Store,
  ) {
    panel.webview.html = this.getHtml();
    panel.webview.onDidReceiveMessage((m: WebviewToExtension) => this.onMessage(m), null, this.disposables);
    store.onDidChange(
      (data) => {
        if (this.savingFromWebview === 0) this.post({ type: 'data', data });
      },
      null,
      this.disposables,
    );
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private post(message: ExtensionToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  private async onMessage(m: WebviewToExtension): Promise<void> {
    switch (m.type) {
      case 'ready':
        this.post({ type: 'data', data: this.store.get() });
        break;
      case 'save':
        this.savingFromWebview++;
        try {
          await this.store.set(m.key, m.value);
        } finally {
          this.savingFromWebview--;
        }
        break;
      case 'pickCalendarFile':
        await this.pickCalendarFile(m.rangeStart, m.rangeEnd);
        break;
      case 'pickWorkContentCsv':
        await this.pickWorkContentCsv();
        break;
      case 'exportCsv':
        await this.exportCsv(m.fileName, m.content);
        break;
      case 'copyText':
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.setStatusBarMessage(`$(copy) コピーしました: ${m.label}`, 2500);
        break;
      case 'notify': {
        const show = { info: vscode.window.showInformationMessage, warn: vscode.window.showWarningMessage, error: vscode.window.showErrorMessage }[m.level];
        void show(m.message);
        break;
      }
    }
  }

  private async pickCalendarFile(rangeStart: string, rangeEnd: string): Promise<void> {
    const [uri] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        title: '予定表ファイルを選択',
        filters: { '予定表 (ICS / CSV)': ['ics', 'csv'] },
      })) ?? [];
    if (!uri) return;

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = decode(bytes);
      const from = new Date(`${rangeStart}T00:00:00`);
      const to = new Date(`${rangeEnd}T23:59:59`);
      const events = uri.path.toLowerCase().endsWith('.csv') ? parseCsv(text, from, to) : parseIcs(text, from, to);
      this.post({ type: 'calendarEvents', fileName: path.basename(uri.fsPath), events });
    } catch (e) {
      this.post({ type: 'calendarError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private async pickWorkContentCsv(): Promise<void> {
    const [uri] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        title: '作業内容マスタ (CSV) を選択',
        filters: { CSV: ['csv'] },
      })) ?? [];
    if (!uri) return;
    try {
      const rows = parseWorkContentCsv(decode(await vscode.workspace.fs.readFile(uri)));
      this.post({ type: 'workContents', fileName: path.basename(uri.fsPath), rows });
    } catch (e) {
      this.post({ type: 'workContentsError', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private async exportCsv(fileName: string, content: string): Promise<void> {
    const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: defaultFolder ? vscode.Uri.joinPath(defaultFolder, fileName) : undefined,
      filters: { CSV: ['csv'] },
    });
    if (!uri) return;
    // Excel で文字化けしないよう BOM 付き UTF-8 で保存
    await vscode.workspace.fs.writeFile(uri, Buffer.from('﻿' + content, 'utf8'));
    void vscode.window.showInformationMessage(`CSV を保存しました: ${uri.fsPath}`);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const root = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.css'));
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${style}" />
  <title>業務管理</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    WorkManagerPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

/** UTF-8 として読めなければ Shift_JIS（日本語版 Outlook の CSV 等）として読む */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
