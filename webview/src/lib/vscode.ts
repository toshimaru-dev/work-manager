import { AppData, ExtensionToWebview, normalizeData, WebviewToExtension } from '@shared/types';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type Listener = (message: ExtensionToWebview) => void;
const listeners = new Set<Listener>();
window.addEventListener('message', (e: MessageEvent<ExtensionToWebview>) => listeners.forEach((l) => l(e.data)));

const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : createBrowserMock();

export function postMessage(message: WebviewToExtension): void {
  api.postMessage(message);
}

export function onMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** VS Code 外（ブラウザ）で UI を確認するための簡易モック。データは localStorage に保存する。 */
function createBrowserMock() {
  const KEY = 'workManager.dev';
  const load = (): AppData => normalizeData(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  const emit = (m: ExtensionToWebview) => setTimeout(() => window.postMessage(m, '*'));
  return {
    postMessage(m: WebviewToExtension) {
      switch (m.type) {
        case 'ready':
          emit({ type: 'data', data: load() });
          break;
        case 'save':
          localStorage.setItem(KEY, JSON.stringify({ ...load(), [m.key]: m.value }));
          break;
        case 'pickCalendarFile':
          emit({ type: 'calendarError', message: 'ブラウザプレビューではファイル取込を利用できません。' });
          break;
        case 'pickWorkContentCsv':
          emit({
            type: 'workContents',
            fileName: 'sample.csv',
            rows: [
              { contentCode: '110', contentName: 'プリセールス', breakdownCode: '20101', breakdownName: 'その他ソリューション' },
              { contentCode: '110', contentName: 'プリセールス', breakdownCode: '20102', breakdownName: 'クラウド' },
              { contentCode: '210', contentName: '開発', breakdownCode: '30101', breakdownName: '設計' },
              { contentCode: '210', contentName: '開発', breakdownCode: '30102', breakdownName: '製造・テスト' },
            ],
          });
          break;
        case 'copyText':
          void navigator.clipboard?.writeText(m.text);
          break;
        default:
          console.log('[mock]', m);
      }
    },
  };
}
